import ExcelJS from 'exceljs';
import { prisma } from '../server';
import { buildOutlookEml, composeEmailForUser, type EmailUserContext } from './email-signature.service';
import { resolveEmailRouting } from './email-routing.service';

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

/** Resposta à pergunta "o cliente autorizou este faturamento?" (decisão de 08/10/2026). */
export interface AutorizacaoCliente {
    confirmada: boolean;
    autorizado_por: string; // quem autorizou do lado do cliente
    data: string;           // AAAA-MM-DD
}

const PREFIXO_AUTORIZACAO = 'Autorização do cliente:';

/**
 * Sem confirmação explícita de que o cliente autorizou, a solicitação não sai.
 * A resposta fica na própria remessa (observacoes) e na auditoria, e vai no e-mail.
 */
function validarAutorizacao(a: AutorizacaoCliente | undefined, quem: string) {
    if (!a?.confirmada) throw new Error('Confirme que o cliente autorizou este faturamento antes de solicitar');
    const por = String(a.autorizado_por || '').trim();
    if (!por) throw new Error('Informe quem autorizou o faturamento no cliente');
    const data = new Date(`${String(a.data || '').slice(0, 10)}T12:00:00`);
    if (Number.isNaN(data.getTime())) throw new Error('Informe a data da autorização do cliente');
    if (data.getTime() > Date.now() + 24 * 3600 * 1000) throw new Error('A data da autorização não pode estar no futuro');
    const dia = data.toLocaleDateString('pt-BR');
    return { por, dia, texto: `${PREFIXO_AUTORIZACAO} ${por} em ${dia}. Confirmada no sistema por ${quem}.` };
}

export async function solicitarFaturamentoLinhas(
    itens: SolicitacaoLinha[], gestor?: string,
    autorizacaoCliente?: AutorizacaoCliente, usuario?: { userId?: string; tenantId?: string; nome?: string; email?: string },
) {
    if (!itens?.length) throw new Error('Selecione ao menos uma linha para faturar');
    const autorizacao = validarAutorizacao(autorizacaoCliente, usuario?.nome || usuario?.email || 'usuário não identificado');

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
                observacoes: autorizacao.texto,
            },
        }));
    }
    if (usuario?.tenantId) {
        await prisma.auditLog.createMany({
            data: criados.map(c => ({
                tenant_id: usuario.tenantId!, entidade: 'FaturamentoLinha', entidade_id: c.id,
                acao: 'FATURAMENTO_AUTORIZACAO_CONFIRMADA',
                depois_json: JSON.stringify({ autorizado_por: autorizacao.por, data: autorizacao.dia, percentual: c.percentual, valor: c.valor }),
                user_id: usuario.userId || null,
            })),
        });
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
    if (autor?.role !== 'ADMIN') {
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

export async function gerarEmailFaturamento(faturamentoLinhaIds: string[], opcoes: { cliente?: string; competencia?: string } | undefined, usuario: EmailUserContext, modo: 'preview' | 'cid' = 'preview') {
    const registros = await prisma.faturamentoLinha.findMany({
        where: { id: { in: faturamentoLinhaIds }, linha: { po: { tenant_id: usuario.tenantId } } },
        include: {
            linha: {
                include: {
                    po: { include: { atividade: { select: { codigo: true, tipo_demanda: true, sharing: true, estado: true, municipio: true, id_site_sharing: true } } } },
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

    const origens = [...new Set(registros.map(r => r.linha.po.atividade?.tipo_demanda).filter(Boolean))];
    const origem = origens.length === 1
        ? (origens[0] === 'IMPLANTACAO' ? 'IMPLANTAÇÃO' : origens[0] === 'OPERACAO' ? 'OPERAÇÕES' : 'ENGENHARIA')
        : 'ENGENHARIA';
    const sites = [...new Set(registros.map(r => r.linha.site || r.linha.po.atividade?.id_site_sharing || r.linha.po.atividade?.codigo).filter(Boolean))];
    const assunto = `[${origem}] FATURAMENTO | ${sites.slice(0, 3).join(' / ') || cliente.toUpperCase()} | ${competencia}`;

    // "Autorização do cliente: Fulano em 08/10/2026." — sem o trecho interno de quem confirmou.
    const autorizacoes = [...new Set(registros
        .map(r => r.observacoes || '')
        .filter(o => o.startsWith(PREFIXO_AUTORIZACAO))
        .map(o => o.split(' Confirmada no sistema')[0].replace(PREFIXO_AUTORIZACAO, 'Faturamento autorizado pelo cliente:')))];

    const corpoTexto = [
        'Boa tarde!',
        '',
        `Segue a atualização das liberações de faturamento da ${cliente.toUpperCase()}, referente às demandas já liberadas no Microsiga.`,
        `Nesta atualização, temos ${registros.length} linha(s) liberada(s), totalizando ${fmtMoeda(total)} para faturamento.`,
        'Peço, por gentileza, que considere a tabela abaixo para o devido prosseguimento do processo de faturamento.',
        '',
        ...(autorizacoes.length ? [...autorizacoes, ''] : []),
        'POs LIBERADAS PARA FATURAMENTO',
        '',
        [COLUNAS.join(' | ')].concat(linhasTabela.map(l => l.join(' | '))).join('\n'),
    ].join('\n');

    // Tabela pensada para o Outlook (19/10/2026): ele desenha com o motor do Word e
    // ignora boa parte do CSS — larguras vão em atributo width, alinhamento em
    // align, e cada célula repete a fonte. Texto à esquerda, valores à direita,
    // códigos ao centro; nada de quebra nas colunas curtas.
    const COLUNAS_EMAIL: { largura: number; alinhar: 'left' | 'right' | 'center'; quebra?: boolean }[] = [
        { largura: 96, alinhar: 'left' },            // ID SITE
        { largura: 62, alinhar: 'center' },          // PO
        { largura: 46, alinhar: 'center' },          // LINHA
        { largura: 260, alinhar: 'left', quebra: true }, // SERVIÇO
        { largura: 92, alinhar: 'right' },           // VALOR
        { largura: 78, alinhar: 'left' },            // EMPRESA
        { largura: 32, alinhar: 'center' },          // UF
        { largura: 110, alinhar: 'left', quebra: true }, // CIDADE
        { largura: 92, alinhar: 'right' },           // VALOR PO
        { largura: 70, alinhar: 'center' },          // % LIBERAÇÃO
        { largura: 70, alinhar: 'center' },          // LIBERAÇÃO MICROSIGA
    ];
    const larguraTabela = COLUNAS_EMAIL.reduce((t, c) => t + c.largura, 0);
    const fonte = "font-family:Calibri,Arial,sans-serif;font-size:9pt;mso-line-height-rule:exactly;line-height:12pt";
    const celula = (conteudo: string, i: number, cabecalho = false) => {
        const c = COLUNAS_EMAIL[i];
        const estilo = `${fonte};border:1px solid #9BB0C9;padding:4px 6px;vertical-align:middle;text-align:${cabecalho ? 'center' : c.alinhar};${c.quebra || cabecalho ? '' : 'white-space:nowrap;'}${cabecalho ? `background:${i < 5 ? '#DCE6F1' : '#FFFF00'};color:#000000;font-weight:bold;` : ''}`;
        const tag = cabecalho ? 'th' : 'td';
        return `<${tag} width="${c.largura}" align="${cabecalho ? 'center' : c.alinhar}" valign="middle" style="${estilo}">${conteudo}</${tag}>`;
    };
    const tabelaHtml = `<table width="${larguraTabela}" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:${larguraTabela}px;table-layout:fixed;${fonte}">
  <thead><tr>${COLUNAS.map((c, i) => celula(escapeHtml(c), i, true)).join('')}</tr></thead>
  <tbody>
    ${linhasTabela.map((l, n) => `<tr style="background:${n % 2 ? '#F3F6FA' : '#FFFFFF'}">${l.map((c, i) => celula(escapeHtml(c), i)).join('')}</tr>`).join('\n    ')}
    <tr style="background:#DCE6F1">${celula('<b>TOTAL</b>', 0)}${celula('', 1)}${celula('', 2)}${celula('', 3)}${celula(`<b>${fmtMoeda(total)}</b>`, 4)}${COLUNAS_EMAIL.slice(5).map((_, k) => celula('', k + 5)).join('')}</tr>
  </tbody>
</table>`;

    const corpoHtml = `
<p>Boa tarde!</p>
<p>Segue a atualização das liberações de faturamento da <strong>${escapeHtml(cliente.toUpperCase())}</strong>, referente às demandas já liberadas no Microsiga.<br>
Nesta atualização, temos <strong>${registros.length} linha(s) liberada(s)</strong>, totalizando <strong>${fmtMoeda(total)}</strong> para faturamento.<br>
Peço, por gentileza, que considere a tabela abaixo para o devido prosseguimento do processo de faturamento.</p>
${autorizacoes.length ? `<p>${autorizacoes.map(a => escapeHtml(a)).join('<br>')}</p>` : ''}
<p><strong>POs LIBERADAS PARA FATURAMENTO</strong></p>
${tabelaHtml}
<p style="margin-top:14px">Total: <strong>${fmtMoeda(total)}</strong> em ${registros.length} linha(s).</p>`;

    const composto = await composeEmailForUser(corpoHtml, usuario, modo);
    const routing = await resolveEmailRouting(usuario.tenantId, 'BILLING', undefined, usuario.userId);
    return {
        assunto,
        para: routing.para.join('; '),
        cc: routing.cc.join('; '),
        routing_pendente: routing.pendente,
        sem_assinatura: !composto.signature,
        responsavel: { nome: usuario.nome || usuario.email, email: usuario.email },
        corpo_texto: corpoTexto,
        corpo_html: composto.html,
        assinatura: composto.signature,
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
// Modelo da planilha que a LS Office envia (19/10/2026: "1. LS OFFICE_Faturamento
// HIGHLINE_Setembro_25.09.2026.xlsx"): mesmas colunas, cores por grupo, larguras
// e formatos. As colunas de quem recebe (CNAE, CR, data, NF, ROIT, recebimento)
// vão em branco de propósito.
const AZUL = 'FFDCE6F1', AMARELO = 'FFFFFF00', LARANJA = 'FFF79646', CINZA = 'FFD9D9D9', VERDE = 'FF92D050', BRANCO = 'FFFFFFFF';
const COLUNAS_PLANILHA: { titulo: string; largura: number; cor: string; tamanho?: number }[] = [
    { titulo: 'ID SITE |', largura: 14.4, cor: AZUL },
    { titulo: 'PO |', largura: 13, cor: AZUL },
    { titulo: 'LINHA |', largura: 9.3, cor: AZUL },
    { titulo: 'SERVIÇO |', largura: 41, cor: AZUL },
    { titulo: 'VALOR', largura: 16.7, cor: AZUL },
    { titulo: 'EMPRESA', largura: 12.1, cor: AMARELO },
    { titulo: 'UF', largura: 7.4, cor: AMARELO },
    { titulo: 'CIDADE', largura: 12, cor: AMARELO },
    { titulo: 'VALOR PO', largura: 17.6, cor: AMARELO },
    { titulo: '% LIBERAÇÃO\nFATURAMENTO', largura: 14.3, cor: AMARELO, tamanho: 8 },
    { titulo: 'CNAE\n422190500 - 07.05', largura: 21.6, cor: LARANJA },
    { titulo: 'VALIDAÇÃO PARCIAL (CR)', largura: 20.3, cor: AMARELO },
    { titulo: 'LIBERAÇÃO - MICROSIGA (CR)', largura: 22.3, cor: AMARELO },
    { titulo: 'GESTOR', largura: 16, cor: CINZA },
    { titulo: 'DATA FATURAMENTO', largura: 14.9, cor: VERDE },
    { titulo: 'NF', largura: 9.7, cor: VERDE },
    { titulo: 'ROIT', largura: 14.1, cor: VERDE },
    { titulo: 'DATA RECEBIMENTO', largura: 17.7, cor: BRANCO, tamanho: 10 },
];

export async function gerarPlanilhaFaturamento(faturamentoLinhaIds: string[], opcoes: { cliente?: string; competencia?: string } | undefined, tenantId: string) {
    const registros = await prisma.faturamentoLinha.findMany({
        where: { id: { in: faturamentoLinhaIds }, linha: { po: { tenant_id: tenantId } } },
        include: {
            linha: {
                include: {
                    po: { include: { atividade: { select: { sharing: true, estado: true, municipio: true, id_site_sharing: true, gestor: true, responsavel: true, site: { select: { endereco: true, bairro: true, cidade: true, uf: true, cep: true } } } } } },
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
    wb.creator = 'LS Office Rumo';
    wb.created = new Date();
    const hoje = new Date();
    const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const mes = MESES[hoje.getMonth()];
    const dataBr = hoje.toLocaleDateString('pt-BR');
    const ws = wb.addWorksheet(`FATURAMENTO ${mes} ${String(hoje.getDate()).padStart(2, '0')}`);
    const fino = { style: 'thin' as const };
    const borda = { top: fino, bottom: fino, left: fino, right: fino };
    const fonte = (tamanho = 10, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Arial', size: tamanho, ...extra });
    const cheio = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const MOEDA = '"R$" #,##0.00';
    void competencia;

    // Título, mesclado de A a N
    ws.mergeCells(1, 1, 1, 14);
    const titulo = ws.getCell(1, 1);
    titulo.value = `Solicitação de Faturamento ${cliente} - LIBERADO ${dataBr}`;
    titulo.font = fonte(18, { bold: true });
    titulo.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Cabeçalho com as cores por grupo do modelo
    const cabecalho = ws.getRow(2);
    COLUNAS_PLANILHA.forEach((col, i) => {
        const celula = cabecalho.getCell(i + 1);
        celula.value = col.titulo;
        celula.font = fonte(col.tamanho || 11, { bold: true });
        celula.fill = cheio(col.cor);
        celula.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        celula.border = borda;
        ws.getColumn(i + 1).width = col.largura;
    });
    cabecalho.height = 42;

    registros.forEach((r, idx) => {
        const l = r.linha;
        const atv = l.po.atividade;
        const n = 3 + idx;
        const linha = ws.getRow(n);
        const valores: (string | number | ExcelJS.CellFormulaValue | null)[] = [
            l.site || atv?.id_site_sharing || '',
            l.po.numero || '',
            l.numero_linha,
            l.descricao,
            { formula: `I${n}*J${n}/100`, result: r.valor },   // VALOR = valor da PO × % liberado, como no modelo
            cliente,
            atv?.estado || '',
            l.cidade || atv?.municipio || '',
            l.valor_total,
            r.percentual,
            null, null,                                            // CNAE e validação parcial (CR)
            l.autorizado ? 'OK' : 'NOK',
            atv?.gestor || atv?.responsavel || '',
            null, null, null, null,                                // data faturamento, NF, ROIT, data recebimento
        ];
        valores.forEach((v, i) => {
            const celula = linha.getCell(i + 1);
            if (v !== null) celula.value = v as any;
            celula.font = fonte(10, i === 9 ? { color: { argb: 'FF0000FF' } } : {});
            celula.border = borda;
            celula.alignment = { horizontal: i === 3 ? 'left' : 'center', vertical: 'middle', wrapText: i === 3 || i === 7 };
            if (i === 4 || i === 8) celula.numFmt = MOEDA;
            if (i === 9) celula.numFmt = '0"%"';
        });
    });

    // Total, como no modelo: rótulo em A e somas de VALOR e VALOR PO
    const nTotal = 3 + registros.length;
    const linhaTotal = ws.getRow(nTotal);
    for (let i = 1; i <= 14; i++) {
        const c = linhaTotal.getCell(i);
        c.fill = cheio('FFF2F2F2');
        c.border = borda;
        c.font = fonte(11, { bold: true });
    }
    linhaTotal.getCell(1).value = 'TOTAL';
    linhaTotal.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    linhaTotal.getCell(5).value = { formula: `SUM(E3:E${nTotal - 1})`, result: round2(registros.reduce((a, r) => a + r.valor, 0)) };
    linhaTotal.getCell(9).value = { formula: `SUM(I3:I${nTotal - 1})`, result: round2(registros.reduce((a, r) => a + r.linha.valor_total, 0)) };
    for (const c of [5, 9]) { linhaTotal.getCell(c).numFmt = MOEDA; linhaTotal.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; }
    linhaTotal.height = 29.4;
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    // Aba ENDEREÇOS: ID e PO puxados da primeira aba; endereço do cadastro do site
    const we = wb.addWorksheet('ENDEREÇOS');
    const colEnd = [['ID SITE', 10.9], ['PO', 9], ['ENDEREÇO', 34], ['BAIRRO', 18], ['CIDADE', 14], ['UF', 5], ['CEP', 11]] as const;
    colEnd.forEach(([t, w], i) => {
        const c = we.getRow(1).getCell(i + 1);
        c.value = t; c.font = fonte(11, { bold: true }); c.fill = cheio(AZUL); c.border = borda;
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        we.getColumn(i + 1).width = w;
    });
    const nomeAba = ws.name.replace(/'/g, "''");
    const vistos = new Set<string>();
    let e = 2;
    registros.forEach((r, idx) => {
        const site = r.linha.po.atividade?.site;
        const chave = `${r.linha.site || r.linha.po.atividade?.id_site_sharing}|${r.linha.po.numero}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        const linha = we.getRow(e++);
        const valores: any[] = [
            { formula: `'${nomeAba}'!A${3 + idx}`, result: r.linha.site || r.linha.po.atividade?.id_site_sharing || '' },
            { formula: `'${nomeAba}'!B${3 + idx}`, result: r.linha.po.numero || '' },
            site?.endereco || '', site?.bairro || '', site?.cidade || r.linha.cidade || r.linha.po.atividade?.municipio || '',
            site?.uf || r.linha.po.atividade?.estado || '', site?.cep || '',
        ];
        valores.forEach((v, i) => {
            const c = linha.getCell(i + 1);
            c.value = v; c.border = borda;
            c.font = fonte(10, { color: { argb: i < 2 ? 'FF008000' : 'FF0000FF' } });
            c.alignment = { horizontal: i < 2 || i >= 5 ? 'center' : 'left', vertical: 'middle' };
        });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const mesArquivo = mes.charAt(0) + mes.slice(1).toLowerCase();
    const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return {
        buffer: Buffer.from(buffer),
        filename: semAcento(`1. LS OFFICE_Faturamento ${cliente}_${mesArquivo}_${dataBr.replace(/\//g, '.')}.xlsx`),
    };
}

/**
 * E-mail de faturamento pronto para o Outlook (20/10/2026): .eml com a planilha
 * de faturamento já anexada. Abrir o arquivo cria uma mensagem nova, com Para,
 * CC, assunto, corpo, assinatura e o anexo — é só conferir e enviar.
 */
export async function gerarEmlFaturamento(ids: string[], opcoes: { cliente?: string; competencia?: string } | undefined, usuario: EmailUserContext) {
    const email = await gerarEmailFaturamento(ids, opcoes, usuario, 'cid');
    const planilha = await gerarPlanilhaFaturamento(ids, opcoes, usuario.tenantId);
    const eml = buildOutlookEml({
        assunto: email.assunto, para: email.para, cc: email.cc, html: email.corpo_html, signature: email.assinatura,
        attachments: [{ filename: planilha.filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: planilha.buffer }],
    });
    return { eml, filename: planilha.filename.replace(/\.xlsx$/i, '.eml') };
}
