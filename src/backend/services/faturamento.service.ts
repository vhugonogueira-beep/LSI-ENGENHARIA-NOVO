import { prisma } from '../server';
import ExcelJS from 'exceljs';

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

export interface MarcoAvaliado {
    caminho: string;
    marco: string;
    percentual: number;
    atingido: boolean;
}

export interface AvaliacaoFaturamento {
    regra_aplicada: string | null;
    caminho_resolvido: string | null;
    marcos: MarcoAvaliado[];
    percentual_liberado: number;
    valor_liberado: number;
}

// Motor de regras de faturamento (Blueprint LSI, seção 30) — resolve o achado #4:
// os marcos pós-RFI formam DOIS CAMINHOS CONDICIONAIS alternativos (conforme a energia
// no momento do RFI), não uma tabela plana de percentuais. Marcos com caminho='PADRAO'
// valem para qualquer caminho (ex.: APC, Aceitação); os demais só contam quando o
// caminho resolvido (a partir de RFI.energizado) corresponde.
export async function avaliarMarcosFaturamento(atividade_id: string): Promise<AvaliacaoFaturamento> {
    const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
    if (!atividade) {
        return { regra_aplicada: null, caminho_resolvido: null, marcos: [], percentual_liberado: 0, valor_liberado: 0 };
    }

    const candidatas = await prisma.regraFaturamento.findMany({
        where: {
            tenant_id: atividade.tenant_id,
            ativo: true,
            OR: [{ contratante_id: atividade.contratante_id }, { contratante_id: null }],
        },
        include: { marcos: { orderBy: { ordem: 'asc' } } },
    });

    // Prioriza a regra mais específica: contratante+tipo_obra > contratante > tipo_obra > global.
    const aplicaveis = candidatas.filter(r => r.tipo_obra === null || r.tipo_obra === atividade.tipo_obra);
    aplicaveis.sort((a, b) => {
        const scoreA = (a.contratante_id ? 2 : 0) + (a.tipo_obra ? 1 : 0);
        const scoreB = (b.contratante_id ? 2 : 0) + (b.tipo_obra ? 1 : 0);
        return scoreB - scoreA;
    });
    const regra = aplicaveis[0];

    if (!regra) {
        // Sem motor configurado: fallback simples — 100% quando pronto para faturar.
        const percentual = atividade.status_faturamento === 'PRONTO_PARA_FATURAR' || atividade.status_faturamento === 'ENVIADO_FINANCEIRO' ? 100 : 0;
        return {
            regra_aplicada: null,
            caminho_resolvido: null,
            marcos: [],
            percentual_liberado: percentual,
            valor_liberado: round2((atividade.valor_contrato || 0) * percentual / 100),
        };
    }

    const ultimoRfi = await prisma.rFI.findFirst({ where: { atividade_id }, orderBy: { created_at: 'desc' } });
    const rfiEnergizadoAlgumaVez = await prisma.rFI.findFirst({ where: { atividade_id, energizado: true } });

    let caminhoResolvido: string | null = null;
    if (ultimoRfi) {
        caminhoResolvido = ultimoRfi.energizado === true ? 'ENERGIZADO' : ultimoRfi.energizado === false ? 'SEM_ENERGIA' : null;
    }

    const apcLiberado = await prisma.aPC.findFirst({ where: { atividade_id, status: 'APC_LIBERADO' } });
    const aceite = await prisma.aceite.findFirst({ where: { atividade_id } });

    const marcosAvaliados: MarcoAvaliado[] = [];
    for (const m of regra.marcos) {
        if (m.caminho !== 'PADRAO' && m.caminho !== caminhoResolvido) continue;

        let atingido = false;
        switch (m.marco) {
            case 'APC': atingido = !!apcLiberado; break;
            case 'RFI': atingido = !!ultimoRfi; break;
            case 'RFI_ENERGIZADO': atingido = ultimoRfi?.energizado === true; break;
            case 'RFI_SEM_ENERGIA': atingido = ultimoRfi?.energizado === false; break;
            case 'ENERGIZACAO_POS_RFI': atingido = !!rfiEnergizadoAlgumaVez; break;
            case 'ACEITACAO': atingido = !!aceite; break;
            default: atingido = false;
        }
        marcosAvaliados.push({ caminho: m.caminho, marco: m.marco, percentual: m.percentual, atingido });
    }

    const percentualLiberado = round2(marcosAvaliados.filter(m => m.atingido).reduce((s, m) => s + m.percentual, 0));
    const valorLiberado = round2((atividade.valor_contrato || 0) * percentualLiberado / 100);

    return {
        regra_aplicada: regra.nome,
        caminho_resolvido: caminhoResolvido,
        marcos: marcosAvaliados,
        percentual_liberado: percentualLiberado,
        valor_liberado: valorLiberado,
    };
}

// Planilha de faturamento — reproduz fielmente o layout legado ("MED ENG LS OFFICE" /
// Winity) que o financeiro já utiliza: mesmas 13 colunas, mesma fórmula de desconto
// (22,04%) e mesmo nome de aba. Único ajuste consciente: a coluna "LINHA" antes vinha
// do item de PO importado via PDF (não reproduzido nesta onda); aqui é a numeração
// sequencial da atividade dentro do lote.
export async function gerarPlanilhaFaturamento(faturamentoId: string): Promise<Buffer> {
    const faturamento = await prisma.faturamento.findUnique({
        where: { id: faturamentoId },
        include: {
            atividades: {
                include: {
                    atividade: {
                        select: {
                            titulo: true, id_site_sharing: true, responsavel: true, estado: true, municipio: true,
                            purchaseOrders: { where: { status: 'LIBERADA' }, select: { numero: true }, orderBy: { created_at: 'desc' }, take: 1 },
                        },
                    },
                },
            },
        },
    });
    if (!faturamento) throw new Error('Faturamento não encontrado');

    const faturado = ['FATURADO', 'RECEBIDO'].includes(faturamento.status);
    const dataFaturamentoStr = faturamento.data_faturamento ? faturamento.data_faturamento.toLocaleDateString('pt-BR') : '';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LSI - LS Office';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('MED ENG LS OFFICE');

    sheet.addRow(Array(13).fill(''));
    sheet.addRow(['NF', 'NF', 'NF', 'NF', 'NF', '', '', '', '', '', '', '', '']);
    const headerRow = sheet.addRow([
        'SITE ID WINITY |', 'Nº P.O |', 'LINHA |', 'SERVIÇO |', 'VALOR ',
        'RESPONSÁVEL\n(Quem Acionou o Serviço)', 'LIBERAÇÃO ESPECIALISTA', 'UF', 'CIDADE',
        'DATA FATURAMENTO', 'NF', 'DATA \nRECEBIMENTO', 'Desconto - Aliquota Imposto Mês 22,04% (-)',
    ]);
    headerRow.eachCell(cell => { cell.font = { bold: true }; cell.alignment = { wrapText: true, vertical: 'middle' }; });

    faturamento.atividades.forEach((fa, idx) => {
        const po = fa.atividade.purchaseOrders[0];
        const poNum = po?.numero ? po.numero.replace(/\s*[\/\-]\s*\d{4}\s*$/, '').trim() : '';
        const excelRowNum = idx + 4;
        const valor = round2(fa.valor_incluido);
        const desconto = round2(valor * 0.2204);
        const row = sheet.addRow([
            fa.atividade.id_site_sharing || '',
            poNum,
            idx + 1,
            fa.atividade.titulo,
            valor,
            fa.atividade.responsavel || '',
            '',
            fa.atividade.estado || '',
            fa.atividade.municipio || '',
            faturado ? dataFaturamentoStr : '',
            faturado ? (faturamento.nf_numero || '') : '',
            '',
            { formula: `E${excelRowNum}*22.04%`, result: desconto },
        ]);
        row.getCell(5).numFmt = '"R$" #,##0.00';
        row.getCell(13).numFmt = '"R$" #,##0.00';
    });

    const widths = [16, 10, 8, 52, 14, 28, 22, 5, 16, 18, 12, 18, 30];
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}
