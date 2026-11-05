// Meta de faturamento da atividade (18/10/2026).
//
// Cada atividade pode ter o MÊS em que deve faturar e o VALOR esperado. Definir
// a meta pela primeira vez é de quem edita a atividade; MUDAR o mês depois é do
// gestor/administrador (permissão "metas.alterar") e exige motivo. Toda mudança
// fica no histórico — é dele que sai a marca de "reincidente".
//
// Situação calculada:
//   SEM_META         sem mês definido
//   CUMPRIDA         faturou até o fim do mês da meta
//   CUMPRIDA_ATRASO  faturou, mas depois do mês da meta
//   NO_PRAZO         o mês ainda não chegou
//   VENCE_ESTE_MES   é o mês da meta e ainda não faturou
//   VENCIDA          o mês passou e não faturou

import { prisma } from '../server';

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_FATURADO = ['NF_EMITIDA', 'FATURADO', 'RECEBIDO'];
const r2 = (n: number) => Math.round(n * 100) / 100;
export const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const fimDoMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0, 23, 59, 59, 999); };

export type SituacaoMeta = 'SEM_META' | 'CUMPRIDA' | 'CUMPRIDA_ATRASO' | 'PARCIAL' | 'NO_PRAZO' | 'VENCE_ESTE_MES' | 'VENCIDA';

interface UsuarioMeta { email?: string; role?: string; permissoes?: string[] }
const podeAlterarMes = (u?: UsuarioMeta | null) => u?.role === 'ADMIN' || !!u?.permissoes?.includes('metas.alterar');

/**
 * Faturado por atividade: remessas de linha de PO faturadas/recebidas e lotes de
 * faturamento com a atividade. Devolve o total e a data da primeira faturação.
 */
export async function faturadoPorAtividade(ids: string[]) {
    const mapa = new Map<string, { valor: number; primeira: Date | null }>();
    if (!ids.length) return mapa;
    const somar = (id: string, valor: number, data: Date | null) => {
        const atual = mapa.get(id) || { valor: 0, primeira: null };
        atual.valor = r2(atual.valor + valor);
        if (data && (!atual.primeira || data < atual.primeira)) atual.primeira = data;
        mapa.set(id, atual);
    };
    const linhas = await prisma.faturamentoLinha.findMany({
        where: { status: { in: ['FATURADO', 'RECEBIDO'] }, linha: { po: { atividade_id: { in: ids } } } },
        select: { valor: true, data_faturamento: true, data_solicitacao: true, linha: { select: { po: { select: { atividade_id: true } } } } },
    });
    const comLinha = new Set<string>();
    for (const l of linhas) {
        const id = l.linha.po.atividade_id;
        if (!id) continue;
        comLinha.add(id);
        somar(id, l.valor, l.data_faturamento || l.data_solicitacao);
    }
    // Lote de faturamento só conta para quem não tem remessa por linha (evita somar duas vezes).
    const lotes = await prisma.faturamentoAtividade.findMany({
        where: { atividade_id: { in: ids }, faturamento: { status: { in: [...STATUS_FATURADO, 'FATURADO'] } } },
        select: { atividade_id: true, valor_incluido: true, faturamento: { select: { data_faturamento: true } } },
    });
    for (const l of lotes) if (!comLinha.has(l.atividade_id)) somar(l.atividade_id, l.valor_incluido, l.faturamento.data_faturamento);
    return mapa;
}

/**
 * Valor a faturar por atividade (04/11/2026) — a meta não pede valor: ele sai das
 * POs da atividade (soma das linhas; sem linhas, o valor da PO). Sem PO, o valor
 * do contrato. Saldo = a faturar − faturado (remessas FATURADO/RECEBIDO).
 */
export async function totalAFaturarPorAtividade(ids: string[]) {
    const mapa = new Map<string, number>();
    if (!ids.length) return mapa;
    const [pos, atividades] = await Promise.all([
        prisma.purchaseOrder.findMany({
            where: { atividade_id: { in: ids } },
            select: { atividade_id: true, valor: true, linhas: { select: { valor_total: true } } },
        }),
        prisma.atividade.findMany({ where: { id: { in: ids } }, select: { id: true, valor_contrato: true } }),
    ]);
    for (const po of pos) {
        const v = po.linhas.length ? po.linhas.reduce((s, l) => s + l.valor_total, 0) : (po.valor || 0);
        mapa.set(po.atividade_id, r2((mapa.get(po.atividade_id) || 0) + v));
    }
    for (const a of atividades) if (!mapa.get(a.id) && a.valor_contrato) mapa.set(a.id, r2(a.valor_contrato));
    return mapa;
}

/** Saldo a faturar; null quando não há valor de referência (sem PO e sem contrato). */
export const saldoAFaturar = (total: number | undefined, faturado: number | undefined) =>
    total ? r2(Math.max(0, total - (faturado || 0))) : null;
const TEM_SALDO = (saldo: number | null | undefined) => saldo != null && saldo > 0.5;

export function situacaoMeta(
    a: { meta_faturamento_mes: string | null; status_faturamento?: string | null },
    faturado: { valor: number; primeira: Date | null } | undefined,
    hoje = new Date(),
    saldo?: number | null,
): SituacaoMeta {
    const mes = a.meta_faturamento_mes;
    if (!mes || !MES_RE.test(mes)) return 'SEM_META';
    const faturou = (faturado?.valor || 0) > 0 || STATUS_FATURADO.includes(String(a.status_faturamento || ''));
    // Faturou só uma parte: a meta fica aberta para um novo mês, com o saldo.
    if (faturou && TEM_SALDO(saldo)) return 'PARCIAL';
    if (faturou) {
        const quando = faturado?.primeira;
        return !quando || quando <= fimDoMes(mes) ? 'CUMPRIDA' : 'CUMPRIDA_ATRASO';
    }
    const atual = mesDe(hoje);
    if (mes > atual) return 'NO_PRAZO';
    if (mes === atual) return 'VENCE_ESTE_MES';
    return 'VENCIDA';
}

/** Quantas vezes o mês da meta foi adiado, por atividade. */
export async function adiamentosPorAtividade(ids: string[]) {
    const mapa = new Map<string, number>();
    if (!ids.length) return mapa;
    const hist = await prisma.metaFaturamentoHistorico.findMany({ where: { atividade_id: { in: ids }, mes_anterior: { not: null } }, select: { atividade_id: true, mes_anterior: true, mes_novo: true } });
    for (const h of hist) if (h.mes_novo && h.mes_anterior && h.mes_novo > h.mes_anterior) mapa.set(h.atividade_id, (mapa.get(h.atividade_id) || 0) + 1);
    return mapa;
}

/** Define ou altera a meta. Regras de permissão e motivo descritas no topo. */
export async function definirMeta(atividadeId: string, dados: { mes?: string | null; valor?: number | string | null; motivo?: string | null }, usuario?: UsuarioMeta | null) {
    const a = await prisma.atividade.findUnique({ where: { id: atividadeId } });
    if (!a) throw new Error('Atividade não encontrada');
    const mes = dados.mes ? String(dados.mes).trim() : null;
    if (mes && !MES_RE.test(mes)) throw new Error('Mês da meta inválido: use o formato AAAA-MM');
    const valorBruto = dados.valor === '' || dados.valor === undefined ? null : dados.valor;
    const valor = valorBruto === null ? null : Number(valorBruto);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) throw new Error('Valor da meta inválido');
    // Meta é só o MÊS (04/11/2026): o valor deixou de ser pedido.
    const motivo = String(dados.motivo || '').trim();

    const mudaMes = (a.meta_faturamento_mes || null) !== mes;
    const mudaValor = r2(a.meta_faturamento_valor || 0) !== r2(valor || 0);
    if (!mudaMes && !mudaValor) return { ...a, sem_alteracao: true };
    // Faturada em parte (04/11/2026): o saldo precisa de um novo mês, então a meta
    // fica liberada para qualquer um alterar — sem exigir gestor nem motivo.
    const fat = (await faturadoPorAtividade([a.id])).get(a.id);
    const saldo = saldoAFaturar((await totalAFaturarPorAtividade([a.id])).get(a.id), fat?.valor);
    const parcial = situacaoMeta(a, fat, new Date(), saldo) === 'PARCIAL';
    if (a.meta_faturamento_mes && mudaMes && !parcial) {
        if (!podeAlterarMes(usuario)) throw new Error('Só gestor ou administrador pode alterar o mês da meta depois de definido');
        if (motivo.length < 5) throw new Error('Informe o motivo da alteração do mês da meta');
    }
    const [atualizada] = await prisma.$transaction([
        prisma.atividade.update({ where: { id: a.id }, data: { meta_faturamento_mes: mes, meta_faturamento_valor: mes ? valor : null } }),
        prisma.metaFaturamentoHistorico.create({
            data: {
                tenant_id: a.tenant_id, atividade_id: a.id,
                mes_anterior: a.meta_faturamento_mes, mes_novo: mes,
                valor_anterior: a.meta_faturamento_valor, valor_novo: mes ? valor : null,
                motivo: motivo || (parcial && mudaMes ? `Saldo a faturar de R$ ${saldo?.toFixed(2).replace('.', ',')} — novo mês` : null),
                alterado_por: usuario?.email || null,
            },
        }),
    ]);
    return atualizada;
}

/** Meta da atividade com situação, faturado e histórico (para a tela da atividade). */
export async function metaDaAtividade(atividadeId: string) {
    const a = await prisma.atividade.findUnique({ where: { id: atividadeId }, select: { id: true, meta_faturamento_mes: true, meta_faturamento_valor: true, status_faturamento: true, valor_contrato: true } });
    if (!a) throw new Error('Atividade não encontrada');
    const fat = (await faturadoPorAtividade([a.id])).get(a.id);
    const total = (await totalAFaturarPorAtividade([a.id])).get(a.id);
    const saldo = saldoAFaturar(total, fat?.valor);
    const historico = await prisma.metaFaturamentoHistorico.findMany({ where: { atividade_id: a.id }, orderBy: { created_at: 'desc' } });
    const adiamentos = historico.filter(h => h.mes_anterior && h.mes_novo && h.mes_novo > h.mes_anterior).length;
    return {
        mes: a.meta_faturamento_mes, valor: total ?? null, valor_sugerido: a.valor_contrato || null,
        situacao: situacaoMeta(a, fat, new Date(), saldo), faturado: fat?.valor || 0, a_faturar: total ?? null, saldo,
        adiamentos, reincidente: adiamentos >= 2, historico,
    };
}
