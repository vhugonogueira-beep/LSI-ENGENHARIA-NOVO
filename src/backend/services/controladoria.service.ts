// Controladoria financeira — a cadeia da seção 14 do Blueprint LSI:
//
//   Receita bruta  (valor comercial aprovado da Atividade)
//   (–) Impostos   (alíquota do cadastro da empresa)
//   =   Receita líquida
//   (–) Custo comprometido  (soma de ContratacaoFornecedor.valor_contratado)
//   (–) Custo pago          (soma de ParcelaPagamento já paga)
//   =   Resultado projetado / realizado  →  margem
//
// Regra de ouro: custo COMPROMETIDO ≠ custo PAGO. Um prestador contratado por
// R$ 18.000 conta como R$ 18.000 comprometidos mesmo com R$ 3.600 pagos.
//
// Enquanto não houver contratação de fornecedor cadastrada, o custo é zero de
// verdade — não é estimativa nem número herdado de outra tela.

import { prisma } from '../server';

const PARCELA_PAGA = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];
const ALIQUOTA_PADRAO = 0.2204;

const cent = (v: number) => Math.round(v * 100) / 100;

function chaveMes(d: Date): string {
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export interface ResumoControladoria {
    mes: string;
    aliquota: number;
    receitaBruta: number;
    impostos: number;
    receitaLiquida: number;
    custoComprometido: number;
    custoPago: number;
    custoAPagar: number;
    resultadoProjetado: number;
    resultadoRealizado: number;
    margemProjetada: number;
    margemRealizada: number;
    desvio: number;
    faturado: number;
    recebido: number;
    aReceber: number;
    atividades: {
        id: string;
        codigo: string;
        titulo: string;
        sharing: string;
        status_operacional: string;
        status_faturamento: string;
        receita: number;
        comprometido: number;
        pago: number;
        margem: number;
        margemPercentual: number | null;
    }[];
    contagem: {
        total: number;
        semValorComercial: number;
        semContratacao: number;
    };
    mesesDisponiveis: string[];
}

/**
 * @param mes "MM/AAAA"; ausente = todas as atividades, sem recorte.
 * A atividade entra no mês pela data de abertura — é quando a receita é
 * reconhecida no acompanhamento gerencial da LS.
 */
export async function apurarControladoria(mes?: string): Promise<ResumoControladoria> {
    const empresa = await prisma.empresaConfig.findFirst();
    const aliquota = empresa?.aliquota_impostos ?? ALIQUOTA_PADRAO;

    const todas = await prisma.atividade.findMany({
        select: {
            id: true, codigo: true, titulo: true, sharing: true,
            status_operacional: true, status_faturamento: true,
            valor_contrato: true, valor_orcado: true, data_abertura: true,
        },
        orderBy: { data_abertura: 'desc' },
    });

    const mesesDisponiveis = [...new Set(todas.map(a => chaveMes(a.data_abertura)))]
        .sort((a, b) => {
            const [ma, ya] = a.split('/').map(Number);
            const [mb, yb] = b.split('/').map(Number);
            return (yb - ya) || (mb - ma);
        });

    const doMes = mes ? todas.filter(a => chaveMes(a.data_abertura) === mes) : todas;
    const ids = doMes.map(a => a.id);

    // Comprometido: o que foi contratado, tenha sido pago ou não.
    const contratacoes = ids.length
        ? await prisma.contratacaoFornecedor.findMany({
            where: { atividade_id: { in: ids }, status: { not: 'CANCELADA' } },
            select: { atividade_id: true, valor_contratado: true },
        })
        : [];

    // Pago: só as parcelas que efetivamente saíram do caixa.
    const parcelas = ids.length
        ? await prisma.parcelaPagamento.findMany({
            where: {
                contratacao: { atividade_id: { in: ids }, status: { not: 'CANCELADA' } },
                status: { in: PARCELA_PAGA },
            },
            select: { valor: true, contratacao: { select: { atividade_id: true } } },
        })
        : [];

    const comprometidoPorAtiv = new Map<string, number>();
    for (const c of contratacoes) {
        comprometidoPorAtiv.set(c.atividade_id, (comprometidoPorAtiv.get(c.atividade_id) || 0) + c.valor_contratado);
    }
    const pagoPorAtiv = new Map<string, number>();
    for (const p of parcelas) {
        const id = p.contratacao.atividade_id;
        pagoPorAtiv.set(id, (pagoPorAtiv.get(id) || 0) + p.valor);
    }

    const atividades = doMes.map(a => {
        const receita = a.valor_contrato ?? a.valor_orcado ?? 0;
        const comprometido = comprometidoPorAtiv.get(a.id) || 0;
        const pago = pagoPorAtiv.get(a.id) || 0;
        const liquida = receita - receita * aliquota;
        const margem = cent(liquida - comprometido);
        return {
            id: a.id,
            codigo: a.codigo,
            titulo: a.titulo,
            sharing: a.sharing,
            status_operacional: a.status_operacional,
            status_faturamento: a.status_faturamento,
            receita: cent(receita),
            comprometido: cent(comprometido),
            pago: cent(pago),
            margem,
            margemPercentual: receita > 0 ? cent((margem / receita) * 100) : null,
        };
    });

    const receitaBruta = cent(atividades.reduce((s, a) => s + a.receita, 0));
    const impostos = cent(receitaBruta * aliquota);
    const receitaLiquida = cent(receitaBruta - impostos);
    const custoComprometido = cent(atividades.reduce((s, a) => s + a.comprometido, 0));
    const custoPago = cent(atividades.reduce((s, a) => s + a.pago, 0));

    // Faturado e recebido saem das linhas de faturamento das POs dessas atividades.
    const linhas = ids.length
        ? await prisma.faturamentoLinha.findMany({
            where: {
                status: { not: 'CANCELADO' },
                linha: { po: { atividade_id: { in: ids } } },
            },
            select: { valor: true, status: true },
        })
        : [];
    const faturado = cent(linhas.filter(l => l.status !== 'SOLICITADO').reduce((s, l) => s + l.valor, 0));
    const recebido = cent(linhas.filter(l => l.status === 'RECEBIDO').reduce((s, l) => s + l.valor, 0));

    const resultadoProjetado = cent(receitaLiquida - custoComprometido);
    // Realizado considera o que já saiu do caixa mais o que resta pagar do que
    // já foi comprometido — é o mesmo número quando tudo estiver quitado.
    const custoAPagar = cent(custoComprometido - custoPago);
    const resultadoRealizado = cent(receitaLiquida - custoPago - custoAPagar);

    return {
        mes: mes || 'TODOS',
        aliquota,
        receitaBruta,
        impostos,
        receitaLiquida,
        custoComprometido,
        custoPago,
        custoAPagar,
        resultadoProjetado,
        resultadoRealizado,
        margemProjetada: receitaBruta > 0 ? cent((resultadoProjetado / receitaBruta) * 100) : 0,
        margemRealizada: receitaBruta > 0 ? cent((resultadoRealizado / receitaBruta) * 100) : 0,
        desvio: receitaBruta > 0 ? cent(((resultadoRealizado - resultadoProjetado) / receitaBruta) * 100) : 0,
        faturado,
        recebido,
        aReceber: cent(faturado - recebido),
        atividades,
        contagem: {
            total: doMes.length,
            semValorComercial: atividades.filter(a => a.receita === 0).length,
            semContratacao: atividades.filter(a => a.comprometido === 0).length,
        },
        mesesDisponiveis,
    };
}
