import ExcelJS from 'exceljs';
import { prisma } from '../server';

// Faturamento parcial por linha da PO (Blueprint LSI, seções 26-30). A Highline libera
// percentuais por linha — 40% do material e 40% do serviço, por exemplo — e o saldo
// restante fica pendente para uma remessa futura. Este serviço calcula esse saldo e
// monta a solicitação de faturamento no formato da planilha usada com o cliente.

export interface LinhaComSaldo {
    id: string;
    numero_linha: string;
    descricao: string;
    site: string | null;
    cidade: string | null;
    projeto: string | null;
    unidade: string | null;
    quantidade: number | null;
    valor_total: number;
    autorizado: boolean;
    autorizacao_observacao: string | null;
    percentual_faturado: number;
    percentual_pendente: number;
    valor_faturado: number;
    valor_pendente: number;
    faturamentos: {
        id: string; percentual: number; valor: number; status: string;
        nf_numero: string | null; data_solicitacao: Date;
        motivo_cancelamento: string | null; cancelado_por: string | null; cancelado_em: Date | null;
    }[];
}

function round2(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

export async function linhasDaPOComSaldo(poId: string): Promise<LinhaComSaldo[]> {
    const linhas = await prisma.purchaseOrderLinha.findMany({
        where: { po_id: poId },
        include: { faturamentos: { orderBy: { data_solicitacao: 'asc' } } },
        orderBy: { ordem: 'asc' },
    });

    return linhas.map(l => {
        // Só o que foi cancelado devolve saldo; o resto (solicitado/faturado/recebido)
        // já está comprometido com o cliente.
        const ativos = l.faturamentos.filter(f => f.status !== 'CANCELADO');
        const percentualFaturado = round2(ativos.reduce((acc, f) => acc + f.percentual, 0));
        const valorFaturado = round2(ativos.reduce((acc, f) => acc + f.valor, 0));
        return {
            id: l.id,
            numero_linha: l.numero_linha,
            descricao: l.descricao,
            site: l.site,
            cidade: l.cidade,
            projeto: l.projeto,
            unidade: l.unidade,
            quantidade: l.quantidade,
            valor_total: l.valor_total,
            autorizado: l.autorizado,
            autorizacao_observacao: l.autorizacao_observacao,
            percentual_faturado: percentualFaturado,
            percentual_pendente: round2(Math.max(0, 100 - percentualFaturado)),
            valor_faturado: valorFaturado,
            valor_pendente: round2(Math.max(0, l.valor_total - valorFaturado)),
            // devolve também os cancelados, para a tela mostrar o histórico e o motivo
            faturamentos: l.faturamentos.map(f => ({
                id: f.id, percentual: f.percentual, valor: f.valor, status: f.status,
                nf_numero: f.nf_numero, data_solicitacao: f.data_solicitacao,
                motivo_cancelamento: f.motivo_cancelamento, cancelado_por: f.cancelado_por,
                cancelado_em: f.cancelado_em,
            })),
        };
    });
}

export interface SolicitacaoLinha {
    linha_id: string;
    percentual: number;
}

export async function solicitarFaturamentoLinhas(itens: SolicitacaoLinha[], gestor?: string) {
    if (!itens?.length) throw new Error('Selecione ao menos uma linha para faturar');

    const criados = [];
    for (const item of itens) {
        const linha = await prisma.purchaseOrderLinha.findUnique({
            where: { id: item.linha_id },
            include: { faturamentos: true },
        });
        if (!linha) throw new Error('Linha da PO não encontrada');
        if (!linha.autorizado) {
            throw new Error(`Linha ${linha.numero_linha} ainda não está autorizada para faturamento`);
        }

        const percentual = Number(item.percentual);
        if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
            throw new Error(`Percentual inválido na linha ${linha.numero_linha}`);
        }

        const jaFaturado = linha.faturamentos
            .filter(f => f.status !== 'CANCELADO')
            .reduce((acc, f) => acc + f.percentual, 0);
        if (round2(jaFaturado + percentual) > 100) {
            throw new Error(
                `Linha ${linha.numero_linha}: já foram faturados ${jaFaturado}%, então só restam ${round2(100 - jaFaturado)}%`,
            );
        }

        criados.push(await prisma.faturamentoLinha.create({
            data: {
                linha_id: linha.id,
                percentual,
                valor: round2(linha.valor_total * percentual / 100),
                gestor: gestor || null,
            },
        }));
    }
    return criados;
}

export async function definirAutorizacaoLinha(linhaId: string, autorizado: boolean, observacao?: string) {
    return prisma.purchaseOrderLinha.update({
        where: { id: linhaId },
        data: { autorizado, autorizacao_observacao: observacao ?? undefined },
    });
}

// Cancelar devolve o saldo à linha e desfaz algo que já foi comunicado ao cliente —
// por isso exige justificativa e registra o autor. Restrito a administrador.
export async function cancelarFaturamentoLinha(id: string, motivo: string, autor?: { nome?: string; email?: string; role?: string }) {
    if (autor?.role && autor.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem cancelar um faturamento já solicitado');
    }
    const texto = (motivo || '').trim();
    if (texto.length < 10) {
        throw new Error('Descreva o motivo do cancelamento (mínimo de 10 caracteres)');
    }

    const registro = await prisma.faturamentoLinha.findUnique({ where: { id } });
    if (!registro) throw new Error('Faturamento não encontrado');
    if (registro.status === 'CANCELADO') throw new Error('Este faturamento já está cancelado');

    return prisma.faturamentoLinha.update({
        where: { id },
        data: {
            status: 'CANCELADO',
            motivo_cancelamento: texto,
            cancelado_por: autor?.nome || autor?.email || null,
            cancelado_em: new Date(),
        },
    });
}

export async function atualizarStatusFaturamentoLinha(id: string, status: string, nf_numero?: string) {
    if (!['SOLICITADO', 'FATURADO', 'RECEBIDO', 'CANCELADO'].includes(status)) {
        throw new Error('Status inválido');
    }
    return prisma.faturamentoLinha.update({
        where: { id },
        data: {
            status,
            nf_numero: nf_numero !== undefined ? nf_numero : undefined,
            data_faturamento: status === 'FATURADO' ? new Date() : undefined,
        },
    });
}

// ── E-mail de solicitação de faturamento ────────────────────────────────────
// Reproduz o formato já usado com a Highline: texto de abertura com a contagem de
// linhas e o total, seguido da tabela "POs LIBERADAS PARA FATURAMENTO".
const COLUNAS = [
    'ID SITE', 'PO', 'LINHA', 'SERVIÇO', 'VALOR', 'EMPRESA', 'UF', 'CIDADE',
    'VALOR PO', '% LIBERAÇÃO FATURAMENTO', 'LIBERAÇÃO MICROSIGA',
];

function fmtMoeda(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(v: string): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function gerarEmailFaturamento(faturamentoLinhaIds: string[], opcoes?: { cliente?: string; competencia?: string }) {
    const registros = await prisma.faturamentoLinha.findMany({
        where: { id: { in: faturamentoLinhaIds } },
        include: {
            linha: {
                include: {
                    po: { include: { atividade: { select: { sharing: true, estado: true, municipio: true, id_site_sharing: true } } } },
                },
            },
        },
        orderBy: { data_solicitacao: 'asc' },
    });
    if (registros.length === 0) throw new Error('Nenhuma linha selecionada');

    const cliente = opcoes?.cliente || registros[0].linha.po.atividade?.sharing || 'CLIENTE';
    const competencia = opcoes?.competencia
        || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    const total = round2(registros.reduce((acc, r) => acc + r.valor, 0));

    const linhasTabela = registros.map(r => {
        const l = r.linha;
        const atv = l.po.atividade;
        return [
            l.site || atv?.id_site_sharing || '—',
            l.po.numero || '—',
            l.numero_linha,
            l.descricao,
            fmtMoeda(r.valor),
            cliente.toUpperCase(),
            atv?.estado || '—',
            l.cidade || atv?.municipio || '—',
            fmtMoeda(l.valor_total),
            String(r.percentual),
            'OK',
        ];
    });

    const assunto = `[${cliente.toUpperCase()}] FATURAMENTO ENGENHARIA - ${competencia}`;

    const corpoTexto = [
        'Boa tarde!',
        '',
        `Segue a atualização das liberações de faturamento da ${cliente.toUpperCase()}, referente às demandas já liberadas no Microsiga.`,
        `Nesta atualização, temos ${registros.length} linha(s) liberada(s), totalizando ${fmtMoeda(total)} para faturamento.`,
        'Peço, por gentileza, que considere a tabela abaixo para o devido prosseguimento do processo de faturamento.',
        '',
        'POs LIBERADAS PARA FATURAMENTO',
        '',
        [COLUNAS.join(' | ')].concat(linhasTabela.map(l => l.join(' | '))).join('\n'),
    ].join('\n');

    const corpoHtml = `
<p>Boa tarde!</p>
<p>Segue a atualização das liberações de faturamento da <strong>${escapeHtml(cliente.toUpperCase())}</strong>, referente às demandas já liberadas no Microsiga.<br>
Nesta atualização, temos <strong>${registros.length} linha(s) liberada(s)</strong>, totalizando <strong>${fmtMoeda(total)}</strong> para faturamento.<br>
Peço, por gentileza, que considere a tabela abaixo para o devido prosseguimento do processo de faturamento.</p>
<p><strong>POs LIBERADAS PARA FATURAMENTO</strong></p>
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">
  <thead>
    <tr style="background:#1F4E79;color:#fff">
      ${COLUNAS.map(c => `<th style="border:1px solid #8EA9DB;padding:6px 10px;text-align:left;white-space:nowrap">${escapeHtml(c)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${linhasTabela.map(l => `<tr>${l.map((c, i) => `<td style="border:1px solid #8EA9DB;padding:6px 10px;${i === 4 || i === 8 ? 'text-align:right;white-space:nowrap' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
  </tbody>
</table>
<p style="margin-top:14px">Total: <strong>${fmtMoeda(total)}</strong> em ${registros.length} linha(s).</p>`;

    return {
        assunto,
        corpo_texto: corpoTexto,
        corpo_html: corpoHtml,
        total,
        total_linhas: registros.length,
        colunas: COLUNAS,
        linhas: linhasTabela,
    };
}

// ── Planilha de solicitação de faturamento ──────────────────────────────────
// Mesmo cabeçalho da planilha que a LS Office já envia. Preenchemos só o que é nosso;
// as colunas de responsabilidade de quem recebe (CNAE, validação do CR, data de
// faturamento, NF, ROIT e data de recebimento) vão em branco de propósito.
const COLUNAS_PLANILHA: { titulo: string; largura: number; preenchida: boolean }[] = [
    { titulo: 'ID SITE', largura: 20, preenchida: true },
    { titulo: 'PO', largura: 12, preenchida: true },
    { titulo: 'LINHA', largura: 9, preenchida: true },
    { titulo: 'SERVIÇO', largura: 48, preenchida: true },
    { titulo: 'VALOR', largura: 15, preenchida: true },
    { titulo: 'EMPRESA', largura: 14, preenchida: true },
    { titulo: 'UF', largura: 6, preenchida: true },
    { titulo: 'CIDADE', largura: 20, preenchida: true },
    { titulo: 'VALOR PO', largura: 15, preenchida: true },
    { titulo: '% LIBERAÇÃO FATURAMENTO', largura: 14, preenchida: true },
    { titulo: 'CNAE', largura: 14, preenchida: false },
    { titulo: 'VALIDAÇÃO PARCIAL PELO CR', largura: 16, preenchida: false },
    { titulo: 'LIBERAÇÃO - MICROSIGA (CR)', largura: 16, preenchida: true },
    { titulo: 'GESTOR', largura: 20, preenchida: true },
    { titulo: 'DATA FATURAMENTO', largura: 14, preenchida: false },
    { titulo: 'NF', largura: 10, preenchida: false },
    { titulo: 'ROIT', largura: 14, preenchida: false },
    { titulo: 'DATA RECEBIMENTO', largura: 14, preenchida: false },
];

export async function gerarPlanilhaFaturamento(faturamentoLinhaIds: string[], opcoes?: { cliente?: string; competencia?: string }) {
    const registros = await prisma.faturamentoLinha.findMany({
        where: { id: { in: faturamentoLinhaIds } },
        include: {
            linha: {
                include: {
                    po: { include: { atividade: { select: { sharing: true, estado: true, municipio: true, id_site_sharing: true, gestor: true, responsavel: true } } } },
                },
            },
        },
        orderBy: { data_solicitacao: 'asc' },
    });
    if (registros.length === 0) throw new Error('Nenhuma linha selecionada');

    const cliente = (opcoes?.cliente || registros[0].linha.po.atividade?.sharing || 'CLIENTE').toUpperCase();
    const competencia = opcoes?.competencia
        || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'LS Office ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Faturamento');

    // Título
    ws.mergeCells(1, 1, 1, COLUNAS_PLANILHA.length);
    const titulo = ws.getCell(1, 1);
    titulo.value = `Solicitação de Faturamento ${cliente} - ${competencia}`;
    titulo.font = { bold: true, size: 12 };
    titulo.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 22;

    // Cabeçalho: colunas que quem recebe preenche ficam em amarelo, como na planilha atual
    const cabecalho = ws.getRow(2);
    COLUNAS_PLANILHA.forEach((col, i) => {
        const celula = cabecalho.getCell(i + 1);
        celula.value = col.titulo;
        celula.font = { bold: true, size: 9, color: { argb: col.preenchida ? 'FFFFFFFF' : 'FF000000' } };
        celula.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: col.preenchida ? 'FF1F4E79' : 'FFFFFF00' },
        };
        celula.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        celula.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        ws.getColumn(i + 1).width = col.largura;
    });
    cabecalho.height = 34;

    registros.forEach((r, idx) => {
        const l = r.linha;
        const atv = l.po.atividade;
        const linha = ws.getRow(3 + idx);
        const valores: (string | number | null)[] = [
            l.site || atv?.id_site_sharing || '',
            l.po.numero || '',
            l.numero_linha,
            l.descricao,
            r.valor,
            cliente,
            atv?.estado || '',
            l.cidade || atv?.municipio || '',
            l.valor_total,
            r.percentual,
            null,                    // CNAE — preenchido por quem recebe
            null,                    // Validação parcial pelo CR — idem
            l.autorizado ? 'OK' : 'NOK',
            atv?.gestor || atv?.responsavel || '',
            null, null, null, null,  // Data faturamento, NF, ROIT, Data recebimento
        ];
        valores.forEach((v, i) => {
            const celula = linha.getCell(i + 1);
            if (v !== null) celula.value = v;
            celula.font = { size: 9 };
            celula.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            if (i === 4 || i === 8) celula.numFmt = 'R$ #,##0.00';
            if (i === 9) celula.alignment = { horizontal: 'center' };
            // as colunas de quem recebe ficam destacadas na linha também
            if (!COLUNAS_PLANILHA[i].preenchida) {
                celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
            }
        });
    });

    // Total
    const linhaTotal = ws.getRow(3 + registros.length);
    linhaTotal.getCell(4).value = 'TOTAL';
    linhaTotal.getCell(4).font = { bold: true, size: 9 };
    linhaTotal.getCell(5).value = round2(registros.reduce((acc, r) => acc + r.valor, 0));
    linhaTotal.getCell(5).numFmt = 'R$ #,##0.00';
    linhaTotal.getCell(5).font = { bold: true, size: 9 };

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLUNAS_PLANILHA.length } };
    ws.views = [{ state: 'frozen', ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    const dataArquivo = new Date().toLocaleDateString('pt-BR').replace(/\//g, '');
    return {
        buffer: Buffer.from(buffer),
        filename: `LS OFFICE_Faturamento ${cliente}_${dataArquivo}.xlsx`,
    };
}
