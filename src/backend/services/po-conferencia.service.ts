// Conferência da PO recebida com o orçamento da atividade (19/10/2026).
//
// O cliente emite a PO a partir do que aprovou; se ela vier com valor, quantidade
// ou site diferente do orçamento, o faturamento sai errado e só se descobre na
// cobrança. Esta conferência é calculada na hora — nada é gravado — e aparece na
// aba "PO e faturamento" e nas pendências dessa aba.
//
// Referência de preço, na ordem:
//   1. negociação APROVADA → valor_final (valor único, sem detalhe por item);
//   2. orçamento da atividade (o mesmo que o cockpit mostra: o atualizado por último):
//      - operação Highline → linhas da PV O&M (é nesse formato que a Highline emite a PO);
//      - demais → itens do preço ao cliente (BudgetService.itensPrecoCliente, com BDI).
//
// A Highline costuma emitir a PO de implantação em linhas genéricas (MATERIAL /
// SERVIÇO), sem os itens do orçamento. Por isso o total é a conferência principal e
// a comparação linha a linha só é feita quando as linhas da PO casam com as do orçamento.

import { prisma } from '../server';
import { BudgetService, calcularTotalLinha, calcularValorUnitarioFinal } from './budget.service';
import { ORIGEM_PV_OM, palavras, semelhanca } from './pv-om-highline.service';

export const TOLERANCIA_VALOR = 1; // R$ — arredondamento de centavos entre PDF e orçamento
const SEMELHANCA_MINIMA = 0.6;

const r2 = (v: number) => Math.round(v * 100) / 100;
const normSite = (s?: string | null) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export type SituacaoConferencia = 'CONFERE' | 'DIVERGE' | 'ATENCAO' | 'SEM_ORCAMENTO' | 'SEM_PO';

export interface LinhaReferencia {
    codigo: string;
    descricao: string;
    unidade: string | null;
    quantidade: number;
    valor_unitario: number;
    total: number;
}

export interface LinhaConferida {
    po_numero: string | null;
    numero_linha: string;
    descricao: string;
    quantidade: number | null;
    valor_unitario: number | null;
    valor_total: number;
    referencia: LinhaReferencia | null;
    semelhanca: number;
    situacao: 'CONFERE' | 'QUANTIDADE' | 'VALOR' | 'SEM_CORRESPONDENTE';
    diferenca: number | null; // PO − orçamento
}

export interface ConferenciaPO {
    situacao: SituacaoConferencia;
    resumo: string;
    orcamento: { id: string; numero: string | null; status: string; tipo: string; nome: string } | null;
    referencia: { origem: 'NEGOCIACAO' | 'ORCAMENTO'; nome: string; valor: number } | null;
    total_orcamento: number | null; // total dos itens do orçamento usados na comparação
    total_ls: number | null; // operação Highline: Orçamento LS, para comparar com a PV O&M
    total_po: number;
    diferenca: number | null; // PO − referência
    diferenca_pct: number | null;
    total_confere: boolean | null;
    modo_linhas: 'ITENS' | 'TOTAL'; // ITENS: as linhas da PO casam com as do orçamento
    linhas: LinhaConferida[];
    sem_po: LinhaReferencia[]; // itens do orçamento que nenhuma linha da PO cobre (modo ITENS)
    sites: { po: string[]; atividade: string[]; confere: boolean | null };
    avisos: string[];
}

const NOME_ORCAMENTO: Record<string, string> = {
    PV_HIGHLINE: 'PV Highline', ORCAMENTO_LS: 'Orçamento LS', PV_CLIENTE: 'PV do cliente', COTACAO_INTERNA: 'Orçamento',
};

function sitesDaPO(po: { leitura_json: string | null; linhas: { site: string | null }[] }): string[] {
    const s = new Set<string>();
    po.linhas.forEach(l => l.site && s.add(l.site.trim().toUpperCase()));
    try {
        const leitura = po.leitura_json ? JSON.parse(po.leitura_json) : null;
        (leitura?.sites || []).forEach((x: string) => x && s.add(String(x).trim().toUpperCase()));
        if (leitura?.site) s.add(String(leitura.site).trim().toUpperCase());
    } catch { /* leitura antiga sem JSON válido: fica só o site das linhas */ }
    return [...s];
}

/** Casa cada linha da PO com a linha do orçamento de descrição mais parecida (cada uma usada uma vez). */
function casarLinhas(poLinhas: Omit<LinhaConferida, 'referencia' | 'semelhanca' | 'situacao' | 'diferenca'>[], ref: LinhaReferencia[]): LinhaConferida[] {
    const pares: { i: number; j: number; s: number }[] = [];
    poLinhas.forEach((l, i) => ref.forEach((r, j) => {
        const s = semelhanca(palavras(l.descricao), palavras(`${r.codigo} ${r.descricao}`));
        if (s >= SEMELHANCA_MINIMA) pares.push({ i, j, s });
    }));
    pares.sort((a, b) => b.s - a.s);
    const usadoPo = new Map<number, { j: number; s: number }>(), usadoRef = new Set<number>();
    for (const p of pares) {
        if (usadoPo.has(p.i) || usadoRef.has(p.j)) continue;
        usadoPo.set(p.i, { j: p.j, s: p.s });
        usadoRef.add(p.j);
    }
    return poLinhas.map((l, i) => {
        const par = usadoPo.get(i);
        if (!par) return { ...l, referencia: null, semelhanca: 0, situacao: 'SEM_CORRESPONDENTE' as const, diferenca: null };
        const r = ref[par.j];
        const diferenca = r2(l.valor_total - r.total);
        const qtdDif = l.quantidade != null && Math.abs(l.quantidade - r.quantidade) > 1e-6;
        const situacao = Math.abs(diferenca) <= TOLERANCIA_VALOR && !qtdDif ? 'CONFERE' : qtdDif ? 'QUANTIDADE' : 'VALOR';
        return { ...l, referencia: r, semelhanca: r2(par.s), situacao, diferenca };
    });
}

export async function conferirPOComOrcamento(atividadeId: string): Promise<ConferenciaPO | null> {
    const at = await prisma.atividade.findUnique({
        where: { id: atividadeId },
        include: { site: { select: { id_site_detentora: true } } },
    });
    if (!at) return null;

    const [pos, budget, negociacao] = await Promise.all([
        prisma.purchaseOrder.findMany({
            where: { atividade_id: at.id },
            include: { linhas: { orderBy: { ordem: 'asc' } } },
            orderBy: { created_at: 'asc' },
        }),
        // Mesmo orçamento que o cockpit mostra na aba de orçamento (orcamentos[0] por updated_at).
        prisma.budget.findFirst({ where: { atividade_id: at.id }, orderBy: { updated_at: 'desc' }, include: { items: true } }),
        prisma.negociacao.findFirst({ where: { atividade_id: at.id, status: 'APROVADA' }, orderBy: { updated_at: 'desc' } }),
    ]);

    const avisos: string[] = [];
    const total_po = r2(pos.reduce((s, po) => s + (po.valor ?? po.linhas.reduce((t, l) => t + l.valor_total, 0)), 0));
    const sitesPo = [...new Set(pos.flatMap(sitesDaPO))];
    const sitesAt = [...new Set([at.id_site_sharing, at.id_site_operadora, at.site?.id_site_detentora]
        .filter((x): x is string => !!x && !!x.trim()).map(x => x.trim().toUpperCase()))];
    const siteConfere = !sitesPo.length || !sitesAt.length ? null
        : sitesPo.every(sp => sitesAt.some(sa => normSite(sp) === normSite(sa)));

    // Linhas de referência do orçamento
    const omHighline = at.sharing.trim().toUpperCase() === 'HIGHLINE' && at.tipo_demanda === 'OPERACAO';
    let ref: LinhaReferencia[] = [];
    let total_ls: number | null = null;
    let nomeOrc = '';
    if (budget) {
        if (omHighline) {
            nomeOrc = 'PV O&M Highline';
            ref = budget.items.filter(i => i.ativo && i.origem_item === ORIGEM_PV_OM).sort((a, b) => a.ordem - b.ordem)
                .map(i => ({ codigo: i.codigo_item, descricao: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, total: r2(i.total_linha) }));
            total_ls = r2(budget.items.filter(i => i.ativo && i.origem_item === 'ORCAMENTO_LS').reduce((s, i) => s + i.total_linha, 0));
            if (!ref.length && total_ls) {
                // PV O&M ainda não montada: o Orçamento LS é o que existe para comparar.
                nomeOrc = 'Orçamento LS';
                avisos.push('A PV O&M ainda não foi montada — a PO foi conferida contra o Orçamento LS.');
                ref = budget.items.filter(i => i.ativo && i.origem_item === 'ORCAMENTO_LS')
                    .map(i => ({ codigo: i.codigo_item, descricao: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: calcularValorUnitarioFinal(i), total: calcularTotalLinha(i) }));
            }
        } else {
            nomeOrc = NOME_ORCAMENTO[budget.tipo_orcamento] || 'Orçamento';
            ref = BudgetService.itensPrecoCliente(budget)
                .map(i => ({ codigo: i.codigo_item, descricao: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: calcularValorUnitarioFinal(i), total: calcularTotalLinha(i) }));
        }
    }
    const total_orcamento = budget ? r2(ref.reduce((s, r) => s + r.total, 0)) : null;

    const referencia = negociacao?.valor_final != null
        ? { origem: 'NEGOCIACAO' as const, nome: 'Valor negociado (aprovado)', valor: r2(negociacao.valor_final) }
        : budget && total_orcamento ? { origem: 'ORCAMENTO' as const, nome: nomeOrc, valor: total_orcamento } : null;

    if (budget && !negociacao && budget.status !== 'APROVADO') {
        avisos.push(`O orçamento ${budget.numero || ''} está como ${budget.status} e não há negociação aprovada — a PO foi conferida contra um valor ainda não aprovado.`.replace('  ', ' '));
    }
    if (negociacao && total_orcamento && Math.abs(negociacao.valor_final! - total_orcamento) > TOLERANCIA_VALOR) {
        avisos.push(`O valor negociado difere do total dos itens do orçamento (${moeda(total_orcamento)}) — a comparação por linha usa os itens, o total usa o valor negociado.`);
    }
    if (at.valor_contrato && referencia && Math.abs(at.valor_contrato - referencia.valor) > TOLERANCIA_VALOR) {
        avisos.push(`O valor de contrato da atividade (${moeda(at.valor_contrato)}) difere da referência (${moeda(referencia.valor)}).`);
    }

    // Linhas da PO × linhas do orçamento
    const poLinhas = pos.flatMap(po => po.linhas.map(l => ({
        po_numero: po.numero, numero_linha: l.numero_linha, descricao: l.descricao,
        quantidade: l.quantidade, valor_unitario: l.valor_unitario, valor_total: r2(l.valor_total),
    })));
    const linhas = casarLinhas(poLinhas, ref);
    const modo_linhas: 'ITENS' | 'TOTAL' = linhas.some(l => l.referencia) ? 'ITENS' : 'TOTAL';
    const cobertos = new Set(linhas.filter(l => l.referencia).map(l => l.referencia));
    const sem_po = modo_linhas === 'ITENS' ? ref.filter(r => !cobertos.has(r)) : [];

    const diferenca = referencia ? r2(total_po - referencia.valor) : null;
    const diferenca_pct = referencia && referencia.valor ? r2((diferenca! / referencia.valor) * 100) : null;
    const total_confere = referencia ? Math.abs(diferenca!) <= TOLERANCIA_VALOR : null;

    let situacao: SituacaoConferencia;
    let resumo: string;
    if (!pos.length) {
        situacao = 'SEM_PO'; resumo = 'Nenhuma PO anexada para conferir.';
    } else if (!referencia) {
        situacao = 'SEM_ORCAMENTO'; resumo = 'A atividade não tem orçamento com valor nem negociação aprovada — não há com o que conferir a PO.';
    } else {
        const problemas: string[] = [];
        if (!total_confere) problemas.push(`total da PO ${diferenca! > 0 ? 'acima' : 'abaixo'} do ${referencia.origem === 'NEGOCIACAO' ? 'valor negociado' : 'orçamento'} em ${moeda(Math.abs(diferenca!))}`);
        if (siteConfere === false) problemas.push('site da PO diferente do site da atividade');
        const divLinhas = modo_linhas === 'ITENS' ? linhas.filter(l => l.situacao !== 'CONFERE').length : 0;
        if (divLinhas) problemas.push(`${divLinhas} linha(s) da PO diferente(s) do orçamento`);
        if (sem_po.length) problemas.push(`${sem_po.length} item(ns) do orçamento sem linha na PO`);
        situacao = !total_confere || siteConfere === false ? 'DIVERGE' : problemas.length ? 'ATENCAO' : 'CONFERE';
        resumo = problemas.length ? capitalizar(problemas.join('; ')) + '.' : `PO confere com ${referencia.nome.toLowerCase()} (${moeda(referencia.valor)}).`;
    }

    return {
        situacao, resumo,
        orcamento: budget ? { id: budget.id, numero: budget.numero, status: budget.status, tipo: budget.tipo_orcamento, nome: nomeOrc } : null,
        referencia, total_orcamento, total_ls, total_po, diferenca, diferenca_pct, total_confere,
        modo_linhas, linhas, sem_po,
        sites: { po: sitesPo, atividade: sitesAt, confere: siteConfere },
        avisos,
    };
}

function moeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function capitalizar(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
