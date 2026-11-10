// ─────────────────────────────────────────────────────────────────────────────
// Comissionamento — Rollout Engenharia (06/11/2026). Comercial › Comissões.
//
// Por mês de faturamento (data da NF da remessa):
//   bruto (remessas faturadas)  − impostos (alíquota, 22,04%)  − custo da atividade
//     (custo real total, proporcional ao que foi faturado no mês)  = líquido
//   faixa do líquido do mês → % de comissão de CADA agente ativo (regra flat)
//   saldo = líquido − comissões da equipe;  gestor = % do saldo (10%).
// Mês fechado guarda um retrato (ComissaoFechamento) e não muda mais.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../server';
import { custosDasAtividades } from './custo-real.service';
import { totalAFaturarPorAtividade } from './meta-faturamento.service';

const cent = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface Faixa { ate: number | null; percentual: number }
/** Faixas da planilha "COMISSIONAMENTO — ROLLOUT ENGENHARIA". */
export const FAIXAS_PADRAO: Faixa[] = [
    { ate: 75000, percentual: 0 }, { ate: 140000, percentual: 0.75 }, { ate: 210000, percentual: 1 },
    { ate: 280000, percentual: 1.25 }, { ate: 350000, percentual: 1.5 }, { ate: 420000, percentual: 1.75 },
    { ate: null, percentual: 2 },
];

export async function obterConfig(tenantId: string) {
    const c = await prisma.comissaoConfig.findUnique({ where: { tenant_id: tenantId } });
    let faixas = FAIXAS_PADRAO;
    try { if (c?.faixas_json) faixas = JSON.parse(c.faixas_json); } catch { /* mantém o padrão */ }
    return {
        aliquota_imposto: c?.aliquota_imposto ?? 22.04, faixas,
        gestor_nome: c?.gestor_nome ?? null, gestor_percentual: c?.gestor_percentual ?? 10,
        updated_by: c?.updated_by ?? null, updated_at: c?.updated_at ?? null,
    };
}

export async function salvarConfig(tenantId: string, dados: any, usuario?: string | null) {
    const aliquota = Number(dados.aliquota_imposto);
    if (!(aliquota >= 0 && aliquota < 100)) throw new Error('Alíquota de imposto inválida');
    const gestorPct = Number(dados.gestor_percentual);
    if (!(gestorPct >= 0 && gestorPct <= 100)) throw new Error('Percentual do gestor inválido');
    const faixas: Faixa[] = (dados.faixas || []).map((f: any) => ({ ate: f.ate === null || f.ate === '' || f.ate === undefined ? null : Number(f.ate), percentual: Number(f.percentual) }));
    if (!faixas.length || faixas.some(f => !(f.percentual >= 0) || (f.ate !== null && !(f.ate > 0)))) throw new Error('Faixas inválidas');
    for (let i = 1; i < faixas.length; i++) if (faixas[i - 1].ate === null || (faixas[i].ate !== null && faixas[i].ate! <= faixas[i - 1].ate!)) throw new Error('As faixas precisam estar em ordem crescente; só a última fica sem limite');
    const data = { aliquota_imposto: aliquota, faixas_json: JSON.stringify(faixas), gestor_nome: dados.gestor_nome || null, gestor_percentual: gestorPct, updated_by: usuario || null };
    await prisma.comissaoConfig.upsert({ where: { tenant_id: tenantId }, create: { tenant_id: tenantId, ...data }, update: data });
    return obterConfig(tenantId);
}

export const listarAgentes = (tenantId: string) => prisma.comissaoAgente.findMany({ where: { tenant_id: tenantId }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });

export async function salvarAgente(tenantId: string, dados: any, id?: string) {
    const nome = String(dados.nome || '').trim();
    if (!nome) throw new Error('Informe o nome do agente');
    if (!MES_RE.test(String(dados.inicio_mes || ''))) throw new Error('Informe o mês de início (AAAA-MM)');
    if (dados.fim_mes && !MES_RE.test(String(dados.fim_mes))) throw new Error('Mês de fim inválido (AAAA-MM)');
    const data = {
        nome, cargo: dados.cargo || null, funcionario_id: dados.funcionario_id || null,
        inicio_mes: String(dados.inicio_mes), fim_mes: dados.fim_mes || null, ativo: dados.ativo !== false,
    };
    return id ? prisma.comissaoAgente.update({ where: { id }, data }) : prisma.comissaoAgente.create({ data: { tenant_id: tenantId, ...data } });
}
export const excluirAgente = (id: string) => prisma.comissaoAgente.delete({ where: { id } });

export function faixaDo(liquido: number, faixas: Faixa[]) {
    const i = faixas.findIndex(f => f.ate === null || liquido <= f.ate);
    const idx = i < 0 ? faixas.length - 1 : i;
    return { faixa: idx + 1, percentual: liquido > 0 ? faixas[idx].percentual : 0 };
}

const limitesDoMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    return { de: new Date(a, m - 1, 1), ate: new Date(a, m, 1) };
};

/** Cálculo ao vivo do mês (sem olhar fechamento). */
export async function calcularMes(tenantId: string, mes: string) {
    if (!MES_RE.test(mes)) throw new Error('Mês inválido: use AAAA-MM');
    const cfg = await obterConfig(tenantId);
    const { de, ate } = limitesDoMes(mes);
    const remessas = await prisma.faturamentoLinha.findMany({
        where: { status: { in: ['FATURADO', 'RECEBIDO'] }, data_faturamento: { gte: de, lt: ate }, linha: { po: { atividade: { tenant_id: tenantId } } } },
        include: { linha: { select: { numero_linha: true, po: { select: { numero: true, atividade: { select: { id: true, codigo: true, titulo: true, id_site_sharing: true, sharing: true, tipo_demanda: true } } } } } } },
    });
    const porAtividade = new Map<string, any>();
    for (const r of remessas) {
        const a = r.linha.po.atividade;
        if (!a) continue;
        const item = porAtividade.get(a.id) || { atividade: a, bruto: 0, pos: new Set<string>(), nfs: new Set<string>(), datas: [] as Date[] };
        item.bruto = cent(item.bruto + r.valor);
        if (r.linha.po.numero) item.pos.add(r.linha.po.numero);
        if (r.nf_numero) item.nfs.add(r.nf_numero);
        if (r.data_faturamento) item.datas.push(r.data_faturamento);
        porAtividade.set(a.id, item);
    }
    const ids = [...porAtividade.keys()];
    const [custos, totais] = await Promise.all([custosDasAtividades(ids), totalAFaturarPorAtividade(ids)]);
    const aliquota = cfg.aliquota_imposto / 100;
    const atividades = [...porAtividade.values()].map(i => {
        const total = totais.get(i.atividade.id) || 0;
        const fracao = total > 0 ? Math.min(1, i.bruto / total) : 1;
        const custoTotal = custos.get(i.atividade.id)?.comprometido || 0;
        const custo = cent(custoTotal * fracao);
        const impostos = cent(i.bruto * aliquota);
        return {
            atividade_id: i.atividade.id, codigo: i.atividade.codigo, titulo: i.atividade.titulo, site: i.atividade.id_site_sharing,
            cliente: i.atividade.sharing, tipo: i.atividade.tipo_demanda, pos: [...i.pos], nfs: [...i.nfs],
            data_faturamento: i.datas.sort((x: Date, y: Date) => x.getTime() - y.getTime())[0] || null,
            bruto: i.bruto, impostos, custo, custo_total: cent(custoTotal), fracao_faturada: Math.round(fracao * 10000) / 100,
            liquido: cent(i.bruto - impostos - custo),
        };
    }).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

    const soma = (k: 'bruto' | 'impostos' | 'custo' | 'liquido') => cent(atividades.reduce((s, a) => s + a[k], 0));
    const liquido = soma('liquido');
    const { faixa, percentual } = faixaDo(liquido, cfg.faixas);
    const agentesAtivos = (await listarAgentes(tenantId)).filter(g => g.ativo && g.inicio_mes <= mes && (!g.fim_mes || g.fim_mes >= mes));
    const agentes = agentesAtivos.map(g => ({ id: g.id, nome: g.nome, cargo: g.cargo, comissao: liquido > 0 ? cent(liquido * percentual / 100) : 0 }));
    const comissoes = cent(agentes.reduce((s, g) => s + g.comissao, 0));
    const saldo = cent(liquido - comissoes);
    const gestor = saldo > 0 ? cent(saldo * cfg.gestor_percentual / 100) : 0;
    return {
        mes, aliquota_imposto: cfg.aliquota_imposto, gestor_nome: cfg.gestor_nome, gestor_percentual: cfg.gestor_percentual,
        atividades,
        totais: { bruto: soma('bruto'), impostos: soma('impostos'), custo: soma('custo'), liquido, faixa, percentual, comissoes, saldo, gestor,
            pct_comissoes_sobre_liquido: liquido > 0 ? Math.round((comissoes / liquido) * 10000) / 100 : 0 },
        agentes,
    };
}

/** Mês: o retrato do fechamento, se fechado; senão o cálculo ao vivo. */
export async function mesComissao(tenantId: string, mes: string) {
    const fechamento = await prisma.comissaoFechamento.findUnique({ where: { tenant_id_mes: { tenant_id: tenantId, mes } } });
    if (!fechamento) return { ...(await calcularMes(tenantId, mes)), fechado: false, fechamento: null };
    const retrato = JSON.parse(fechamento.dados_json);
    const atual = await calcularMes(tenantId, mes);
    const mudou = Math.abs(atual.totais.liquido - retrato.totais.liquido) > 0.01;
    return {
        ...retrato, fechado: true,
        fechamento: { por: fechamento.fechado_por, em: fechamento.fechado_em, meta_atingida: fechamento.meta_atingida },
        aviso_mudanca: mudou ? `Depois do fechamento o líquido do mês mudou para ${atual.totais.liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (faturamento ou custo lançado depois). O fechado não muda; reabra o mês se quiser recalcular.` : null,
    };
}

export async function fecharMes(tenantId: string, mes: string, metaAtingida: boolean | null, usuario?: string | null) {
    const existe = await prisma.comissaoFechamento.findUnique({ where: { tenant_id_mes: { tenant_id: tenantId, mes } } });
    if (existe) throw new Error('Este mês já está fechado');
    const calc = await calcularMes(tenantId, mes);
    await prisma.comissaoFechamento.create({
        data: {
            tenant_id: tenantId, mes, dados_json: JSON.stringify(calc), liquido: calc.totais.liquido, comissoes: calc.totais.comissoes,
            saldo: calc.totais.saldo, gestor_valor: calc.totais.gestor, meta_atingida: metaAtingida, fechado_por: usuario || null,
        },
    });
    return mesComissao(tenantId, mes);
}

export async function reabrirMes(tenantId: string, mes: string, motivo: string, usuario?: { email?: string; userId?: string } | null) {
    if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo da reabertura');
    const f = await prisma.comissaoFechamento.findUnique({ where: { tenant_id_mes: { tenant_id: tenantId, mes } } });
    if (!f) throw new Error('Este mês não está fechado');
    await prisma.auditLog.create({
        data: { tenant_id: tenantId, entidade: 'ComissaoFechamento', entidade_id: f.id, acao: 'COMISSAO_MES_REABERTO', antes_json: JSON.stringify({ motivo, fechamento: f }), user_id: usuario?.userId || null },
    }).catch(() => undefined);
    await prisma.comissaoFechamento.delete({ where: { id: f.id } });
    return mesComissao(tenantId, mes);
}

/** Painel anual: uma linha por mês (fechado ou ao vivo) e o acumulado por agente. */
export async function painelAno(tenantId: string, ano: number) {
    const hoje = new Date();
    const ultimoMes = ano < hoje.getFullYear() ? 12 : ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 0;
    const meses: any[] = [];
    for (let m = 1; m <= ultimoMes; m++) {
        const mes = `${ano}-${String(m).padStart(2, '0')}`;
        const d: any = await mesComissao(tenantId, mes);
        meses.push({ mes, fechado: d.fechado, meta_atingida: d.fechamento?.meta_atingida ?? null, totais: d.totais, agentes: d.agentes, atividades: d.atividades.length });
    }
    const porAgente = new Map<string, { nome: string; cargo: string | null; comissao: number; inicio: string }>();
    for (const m of meses) for (const g of m.agentes) {
        const atual = porAgente.get(g.nome) || { nome: g.nome, cargo: g.cargo, comissao: 0, inicio: m.mes };
        atual.comissao = cent(atual.comissao + g.comissao);
        porAgente.set(g.nome, atual);
    }
    const tot = (k: string) => cent(meses.reduce((s, m) => s + (m.totais as any)[k], 0));
    return {
        ano, meses,
        totais: { bruto: tot('bruto'), impostos: tot('impostos'), custo: tot('custo'), liquido: tot('liquido'), comissoes: tot('comissoes'), saldo: tot('saldo'), gestor: tot('gestor') },
        agentes: [...porAgente.values()],
    };
}
