// ─────────────────────────────────────────────────────────────────────────────
// Execução por equipe própria e rateio de mão de obra (05/11/2026).
//
// Funcionário (ex.: técnico que recebe por semana + fechamento do mês) executa
// atividades sem pagamento próprio delas. Etapa 1: registra-se a execução (quem,
// dias, se houve material). Etapa 2: o pagamento semanal/mensal dele, lançado numa
// atividade, é rateado entre as execuções do período, proporcional aos dias.
// O valor rateado sai da atividade onde o pagamento foi lançado e entra nas demais.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../server';

const cent = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const PAGOS = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];
const dia = (v: unknown) => {
    const s = String(v || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};
/** Dias corridos entre duas datas, contando as duas pontas. */
const diasEntre = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);

const incluirExecucao = {
    funcionario: { select: { id: true, nome: true, cargo: true } },
    rateios: { include: { contratacao: { select: { id: true, atividade_id: true, finalidade: true, valor_contratado: true, atividade: { select: { codigo: true } } } } } },
};

export async function listarExecucoes(atividadeId: string) {
    return prisma.execucaoEquipePropria.findMany({ where: { atividade_id: atividadeId }, include: incluirExecucao, orderBy: { data_inicio: 'desc' } });
}

export async function registrarExecucao(tenantId: string, dados: any, usuario?: string | null) {
    const inicio = dia(dados.data_inicio);
    const fim = dia(dados.data_fim) || inicio;
    if (!dados.atividade_id) throw new Error('Informe a atividade');
    if (!dados.funcionario_id) throw new Error('Informe o funcionário que executou');
    if (!inicio || !fim) throw new Error('Informe o período da execução');
    if (fim < inicio) throw new Error('A data final é anterior à inicial');
    const dias = Number(dados.dias) > 0 ? Number(dados.dias) : diasEntre(inicio, fim);
    const [atividade, funcionario] = await Promise.all([
        prisma.atividade.findUnique({ where: { id: dados.atividade_id }, select: { id: true } }),
        prisma.funcionario.findUnique({ where: { id: dados.funcionario_id }, select: { id: true } }),
    ]);
    if (!atividade) throw new Error('Atividade não encontrada');
    if (!funcionario) throw new Error('Funcionário não encontrado');
    return prisma.execucaoEquipePropria.create({
        data: {
            tenant_id: tenantId, atividade_id: atividade.id, funcionario_id: funcionario.id,
            data_inicio: inicio, data_fim: fim, dias, houve_material: dados.houve_material === true,
            observacao: dados.observacao ? String(dados.observacao).slice(0, 300) : null, created_by: usuario || null,
        },
        include: incluirExecucao,
    });
}

export async function excluirExecucao(id: string) {
    await prisma.execucaoEquipePropria.delete({ where: { id } });
}

/**
 * Sugestão de rateio de um pagamento (contratação de funcionário): execuções dele
 * que caem no período, com o valor proporcional aos dias. Rateio já gravado vem marcado.
 */
export async function sugestaoRateio(contratacaoId: string, inicioTxt: unknown, fimTxt: unknown) {
    const c = await prisma.contratacaoFornecedor.findUnique({
        where: { id: contratacaoId },
        include: { funcionario: { select: { id: true, nome: true } }, rateiosMaoDeObra: true, atividade: { select: { codigo: true } } },
    });
    if (!c) throw new Error('Pagamento não encontrado');
    if (!c.funcionario_id) throw new Error('O rateio de mão de obra é só para pagamento de funcionário');
    const inicio = dia(inicioTxt), fim = dia(fimTxt);
    if (!inicio || !fim) throw new Error('Informe o período do pagamento');
    const ate = new Date(fim.getTime() + 12 * 3600000);
    const execucoes = await prisma.execucaoEquipePropria.findMany({
        where: {
            funcionario_id: c.funcionario_id,
            OR: [{ data_inicio: { lte: ate }, data_fim: { gte: new Date(inicio.getTime() - 12 * 3600000) } }, { id: { in: c.rateiosMaoDeObra.map(r => r.execucao_id) } }],
        },
        include: { atividade: { select: { id: true, codigo: true, titulo: true, id_site_sharing: true } } },
        orderBy: { data_inicio: 'asc' },
    });
    // Dias que caem dentro do período (execução maior que a semana conta só a parte dela).
    const diasNoPeriodo = (e: typeof execucoes[number]) => {
        const a = e.data_inicio > inicio ? e.data_inicio : inicio;
        const b = e.data_fim < fim ? e.data_fim : fim;
        if (b < a) return 0;
        const corridos = diasEntre(e.data_inicio, e.data_fim);
        return cent(Math.min(e.dias, e.dias * diasEntre(a, b) / corridos));
    };
    const totalDias = execucoes.reduce((s, e) => s + diasNoPeriodo(e), 0);
    let restante = c.valor_contratado;
    const itens = execucoes.map((e, i) => {
        const d = diasNoPeriodo(e);
        const sugerido = totalDias ? (i === execucoes.length - 1 ? cent(restante) : cent(c.valor_contratado * d / totalDias)) : 0;
        restante = cent(restante - sugerido);
        const gravado = c.rateiosMaoDeObra.find(r => r.execucao_id === e.id);
        return {
            execucao_id: e.id, atividade: e.atividade, data_inicio: e.data_inicio, data_fim: e.data_fim,
            dias: d, houve_material: e.houve_material, valor_sugerido: sugerido, valor_gravado: gravado?.valor ?? null,
        };
    });
    return {
        contratacao: { id: c.id, valor: c.valor_contratado, finalidade: c.finalidade, funcionario: c.funcionario, atividade_codigo: c.atividade.codigo, atividade_id: c.atividade_id },
        total_dias: cent(totalDias), itens, ja_rateado: c.rateiosMaoDeObra.length > 0,
    };
}

/** Grava (substitui) o rateio de um pagamento. A soma não pode passar do valor pago. */
export async function salvarRateio(tenantId: string, contratacaoId: string, itens: { execucao_id: string; valor: number; dias?: number }[]) {
    const c = await prisma.contratacaoFornecedor.findUnique({ where: { id: contratacaoId } });
    if (!c) throw new Error('Pagamento não encontrado');
    const validos = (itens || []).filter(i => i.execucao_id && Number(i.valor) > 0);
    const soma = cent(validos.reduce((s, i) => s + Number(i.valor), 0));
    if (soma > c.valor_contratado + 0.01) throw new Error(`O rateio soma R$ ${soma.toFixed(2)}, mais que o pagamento (R$ ${c.valor_contratado.toFixed(2)})`);
    const execucoes = await prisma.execucaoEquipePropria.findMany({ where: { id: { in: validos.map(i => i.execucao_id) } } });
    if (execucoes.some(e => e.funcionario_id !== c.funcionario_id)) throw new Error('Só dá para ratear entre execuções do mesmo funcionário do pagamento');
    await prisma.$transaction([
        prisma.rateioMaoDeObra.deleteMany({ where: { contratacao_id: c.id } }),
        ...validos.map(i => {
            const e = execucoes.find(x => x.id === i.execucao_id)!;
            return prisma.rateioMaoDeObra.create({
                data: { tenant_id: tenantId, contratacao_id: c.id, execucao_id: e.id, atividade_id: e.atividade_id, dias: Number(i.dias) || e.dias, valor: cent(Number(i.valor)) },
            });
        }),
    ]);
    return { itens: validos.length, total: soma };
}

/**
 * Efeito do rateio no custo das atividades: valor que ENTRA nas atividades das
 * execuções e que SAI da atividade onde o pagamento foi lançado. "Pago" segue a
 * fração já paga do pagamento.
 */
export async function movimentosDeRateio(ids: string[]) {
    if (!ids.length) return [];
    const rateios = await prisma.rateioMaoDeObra.findMany({
        where: { OR: [{ atividade_id: { in: ids } }, { contratacao: { atividade_id: { in: ids } } }] },
        include: {
            contratacao: { select: { id: true, atividade_id: true, valor_contratado: true, finalidade: true, status: true, atividade: { select: { codigo: true } }, funcionario: { select: { nome: true } }, parcelas: { select: { valor: true, status: true, data_pagamento: true } } } },
            execucao: { select: { data_inicio: true, data_fim: true, dias: true, atividade: { select: { codigo: true } } } },
        },
    });
    return rateios.filter(r => r.contratacao.status !== 'CANCELADA' && r.atividade_id !== r.contratacao.atividade_id).map(r => {
        const pago = r.contratacao.parcelas.filter(p => PAGOS.includes(p.status)).reduce((s, p) => s + p.valor, 0);
        const fracao = r.contratacao.valor_contratado > 0 ? Math.min(1, pago / r.contratacao.valor_contratado) : 0;
        return {
            id: r.id, destino: r.atividade_id, origem: r.contratacao.atividade_id, valor: r.valor, valor_pago: cent(r.valor * fracao),
            pago: fracao >= 0.999, funcionario: r.contratacao.funcionario?.nome || '—', finalidade: r.contratacao.finalidade,
            dias: r.dias, data: r.contratacao.parcelas.find(p => p.data_pagamento)?.data_pagamento || r.execucao.data_fim,
            codigo_origem: r.contratacao.atividade.codigo, codigo_destino: r.execucao.atividade.codigo,
        };
    });
}
