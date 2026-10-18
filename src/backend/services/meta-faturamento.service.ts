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

export type SituacaoMeta = 'SEM_META' | 'CUMPRIDA' | 'CUMPRIDA_ATRASO' | 'NO_PRAZO' | 'VENCE_ESTE_MES' | 'VENCIDA';

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

export function situacaoMeta(
    a: { meta_faturamento_mes: string | null; status_faturamento?: string | null },
    faturado: { valor: number; primeira: Date | null } | undefined,
    hoje = new Date(),
): SituacaoMeta {
    const mes = a.meta_faturamento_mes;
    if (!mes || !MES_RE.test(mes)) return 'SEM_META';
    const faturou = (faturado?.valor || 0) > 0 || STATUS_FATURADO.includes(String(a.status_faturamento || ''));
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
    if (mes && (valor === null || !(valor > 0))) throw new Error('Informe o valor da meta de faturamento');
    const motivo = String(dados.motivo || '').trim();

    const mudaMes = (a.meta_faturamento_mes || null) !== mes;
    const mudaValor = r2(a.meta_faturamento_valor || 0) !== r2(valor || 0);
    if (!mudaMes && !mudaValor) return { ...a, sem_alteracao: true };
    if (a.meta_faturamento_mes && mudaMes) {
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
                motivo: motivo || null, alterado_por: usuario?.email || null,
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
    const historico = await prisma.metaFaturamentoHistorico.findMany({ where: { atividade_id: a.id }, orderBy: { created_at: 'desc' } });
    const adiamentos = historico.filter(h => h.mes_anterior && h.mes_novo && h.mes_novo > h.mes_anterior).length;
    return {
        mes: a.meta_faturamento_mes, valor: a.meta_faturamento_valor, valor_sugerido: a.valor_contrato || null,
        situacao: situacaoMeta(a, fat), faturado: fat?.valor || 0, adiamentos, reincidente: adiamentos >= 2, historico,
    };
}
