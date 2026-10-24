// PV O&M Highline (14/10/2026).
//
// Em operação Highline vão DOIS orçamentos para o cliente: o Orçamento LS (itens
// da LPU Operações, com o nosso texto) e a PV O&M, na codificação da Highline
// (cadastro de produtos O&M, só código e descrição). A PV O&M não é digitada do
// zero: cada item do Orçamento LS aponta para um código O&M (`codigo_vinculo`) e
// a PV nasce desses vínculos — vários itens LS podem ir para o mesmo código.
//
// O preço de cada linha da PV O&M sugere o último valor usado para aquele código
// em outro orçamento (o histórico se forma conforme as PVs são preenchidas); sem
// histórico, sai do Orçamento LS. Pode ser editado; a edição é preservada quando
// a PV é remontada.

import { ehHighline } from '../utils/sharing';
import { prisma } from '../server';
import { HIGHLINE_OM_CATALOG } from '../data/highline-om-catalog';

export const NOME_PV_OM_HIGHLINE = 'PV O&M Highline';
export const ORIGEM_PV_OM = 'PV_OM_HIGHLINE';
const r2 = (n: number) => Math.round(n * 100) / 100;

const PALAVRAS_VAZIAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'POR', 'NO', 'NA', 'NOS', 'NAS', 'AO', 'A', 'O', 'OS', 'AS', 'UM', 'UMA', 'ATE', 'SEM']);
// Siglas de duas letras contam (RF, FO, EV, AC): são as que mais identificam o serviço.
export function palavras(t: string): string[] {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
        .filter(p => p.length >= 2 && !PALAVRAS_VAZIAS.has(p));
}
/** Mesma palavra, plural/singular ou mesmo radical (CABO/CABOS, MOBILIZACAO/MOBILIZAR). */
function casa(x: string, y: string): boolean {
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
    return x.length >= 6 && y.length >= 6 && x.slice(0, 6) === y.slice(0, 6);
}
/** Semelhança entre dois textos (0 a 1): palavras que casam sobre as do texto menor. */
export function semelhanca(a: string[], b: string[], peso?: (p: string) => number): number {
    if (!a.length || !b.length) return 0;
    const ua = [...new Set(a)], ub = [...new Set(b)];
    if (peso) {
        // Palavra rara pesa mais (RF, VSWR) que palavra comum (CABO, SITE).
        const total = ua.reduce((t, p) => t + peso(p), 0);
        const comum = ua.filter(p => ub.some(q => casa(p, q))).reduce((t, p) => t + peso(p), 0);
        return total ? comum / total : 0;
    }
    const comuns = ua.filter(p => ub.some(q => casa(p, q))).length;
    return comuns / Math.min(ua.length, ub.length);
}

async function orcamentoDeOperacaoHighline(budgetId: string) {
    const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { atividade: true, items: true } });
    if (!budget) throw new Error('Orçamento não encontrado');
    const at = budget.atividade;
    if (!at || !ehHighline(at.sharing) || at.tipo_demanda !== 'OPERACAO') {
        throw new Error('A PV O&M Highline é só para atividades de operação da Highline');
    }
    return budget;
}

export async function catalogoOm(tenantId: string) {
    const base = await prisma.priceBook.findFirst({ where: { tenant_id: tenantId, nome_lpu: NOME_PV_OM_HIGHLINE, status: 'ATIVA' } });
    // Sem a base importada no banco, vale o cadastro que vem com o sistema (16/10/2026).
    if (!base) return HIGHLINE_OM_CATALOG.map(([codigo, descricao]) => ({ codigo, descricao }));
    const itens = await prisma.priceBookItem.findMany({ where: { pricebook_id: base.id, ativo: true }, select: { codigo_item: true, descricao: true } });
    if (!itens.length) return HIGHLINE_OM_CATALOG.map(([codigo, descricao]) => ({ codigo, descricao }));
    const num = (c: string) => Number(c.replace(/\D/g, '')) || 0;
    return itens.filter(i => i.codigo_item).map(i => ({ codigo: i.codigo_item!, descricao: i.descricao }))
        .sort((a, b) => num(a.codigo) - num(b.codigo));
}

/** Último valor usado para cada código O&M em outros orçamentos (o histórico). */
async function ultimosValores(tenantId: string, codigos: string[], excetoBudget: string) {
    if (!codigos.length) return new Map<string, { valor: number; numero: string | null }>();
    const linhas = await prisma.budgetItem.findMany({
        where: { origem_item: ORIGEM_PV_OM, codigo_item: { in: codigos }, valor_unitario: { gt: 0 }, budget_id: { not: excetoBudget }, budget: { tenant_id: tenantId } },
        select: { codigo_item: true, valor_unitario: true, budget: { select: { numero: true, updated_at: true } } },
    });
    linhas.sort((a, b) => b.budget.updated_at.getTime() - a.budget.updated_at.getTime());
    const mapa = new Map<string, { valor: number; numero: string | null }>();
    for (const l of linhas) if (!mapa.has(l.codigo_item)) mapa.set(l.codigo_item, { valor: l.valor_unitario, numero: l.budget.numero });
    return mapa;
}

/** Itens do Orçamento LS com o vínculo atual e as sugestões de código O&M. */
export async function sugestoesVinculo(budgetId: string) {
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    const catalogo = await catalogoOm(budget.tenant_id);
    const porCodigo = new Map(catalogo.map(c => [c.codigo, c]));
    const palavrasCat = catalogo.map(c => ({ ...c, p: palavras(c.descricao) }));
    // Raridade de cada palavra no cadastro (quantos códigos a usam).
    const freq = (p: string) => palavrasCat.filter(c => c.p.some(q => casa(p, q))).length;
    const cachePeso = new Map<string, number>();
    const peso = (p: string) => { if (!cachePeso.has(p)) cachePeso.set(p, Math.log(1 + palavrasCat.length / (1 + freq(p)))); return cachePeso.get(p)!; };
    const itensLs = budget.items.filter(i => i.origem_item === 'ORCAMENTO_LS').sort((a, b) => a.ordem - b.ordem);

    // 1. Vínculo que a LPU já traz (código original O&M da planilha).
    const fontes = itensLs.map(i => i.source_pricebook_item_id).filter(Boolean) as string[];
    const daLpu = new Map((await prisma.priceBookItem.findMany({ where: { id: { in: fontes } }, select: { id: true, pv_item: { select: { codigo_item: true } } } }))
        .filter(x => x.pv_item?.codigo_item).map(x => [x.id, x.pv_item!.codigo_item!]));
    // 2. O que já foi vinculado antes, em outros orçamentos (aprende com o uso).
    const anteriores = await prisma.budgetItem.findMany({
        where: { origem_item: 'ORCAMENTO_LS', codigo_vinculo: { not: null }, budget_id: { not: budgetId }, budget: { tenant_id: budget.tenant_id } },
        select: { titulo: true, source_pricebook_item_id: true, codigo_vinculo: true },
    });
    const chave = (t: string) => palavras(t).join(' ');
    const porTitulo = new Map<string, string>(), porFonte = new Map<string, string>();
    for (const a of anteriores) {
        porTitulo.set(chave(a.titulo), a.codigo_vinculo!);
        if (a.source_pricebook_item_id) porFonte.set(a.source_pricebook_item_id, a.codigo_vinculo!);
    }

    const itens = itensLs.map(i => {
        const sug = new Map<string, { codigo: string; descricao: string; motivo: string; score: number }>();
        const add = (codigo: string | undefined, motivo: string, score: number) => {
            const c = codigo && porCodigo.get(codigo);
            if (c && (!sug.has(c.codigo) || sug.get(c.codigo)!.score < score)) sug.set(c.codigo, { codigo: c.codigo, descricao: c.descricao, motivo, score });
        };
        if (i.source_pricebook_item_id) {
            add(daLpu.get(i.source_pricebook_item_id), 'código da LPU', 1);
            add(porFonte.get(i.source_pricebook_item_id), 'usado antes para este item', 0.98);
        }
        add(porTitulo.get(chave(i.titulo)), 'usado antes para esta descrição', 0.95);
        const p = palavras(i.titulo);
        palavrasCat.map(c => ({ c, s: semelhanca(p, c.p, peso) }))
            .filter(x => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 4)
            .forEach(x => add(x.c.codigo, 'descrição parecida', r2(x.s * 0.9)));
        return {
            id: i.id, codigo_item: i.codigo_item, titulo: i.titulo, unidade: i.unidade, quantidade: i.quantidade, total: i.total_linha,
            codigo_vinculo: i.codigo_vinculo,
            sugestoes: [...sug.values()].sort((a, b) => b.score - a.score).slice(0, 4),
        };
    });
    return { itens, catalogo };
}

/** Grava os vínculos (item LS → código O&M) e remonta a PV O&M. */
export async function salvarVinculos(budgetId: string, vinculos: { item_id: string; codigo: string | null }[]) {
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    if (budget.status !== 'RASCUNHO') throw new Error('O orçamento já saiu do rascunho; os vínculos não podem mais mudar');
    const validos = new Set((await catalogoOm(budget.tenant_id)).map(c => c.codigo));
    const idsLs = new Set(budget.items.filter(i => i.origem_item === 'ORCAMENTO_LS').map(i => i.id));
    for (const v of vinculos) {
        if (!idsLs.has(v.item_id)) throw new Error('Item do Orçamento LS não encontrado');
        const codigo = v.codigo ? v.codigo.trim().toUpperCase() : null;
        if (codigo && !validos.has(codigo)) throw new Error(`Código O&M inexistente no cadastro da Highline: ${codigo}`);
        await prisma.budgetItem.update({ where: { id: v.item_id }, data: { codigo_vinculo: codigo } });
    }
    await montarPvOm(budgetId);
    return listarPvOm(budgetId);
}

/**
 * Monta as linhas da PV O&M a partir dos vínculos. Linha que já existia mantém o
 * preço (pode ter sido editado); linha nova sugere o último valor do histórico
 * ou, sem histórico, o valor do Orçamento LS.
 */
export async function montarPvOm(budgetId: string) {
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    const catalogo = new Map((await catalogoOm(budget.tenant_id)).map(c => [c.codigo, c]));
    const itensLs = budget.items.filter(i => i.origem_item === 'ORCAMENTO_LS' && i.ativo && i.codigo_vinculo).sort((a, b) => a.ordem - b.ordem);
    const grupos = new Map<string, typeof itensLs>();
    for (const i of itensLs) grupos.set(i.codigo_vinculo!, [...(grupos.get(i.codigo_vinculo!) || []), i]);
    const existentes = new Map(budget.items.filter(i => i.origem_item === ORIGEM_PV_OM).map(i => [i.codigo_item, i]));
    const historico = await ultimosValores(budget.tenant_id, [...grupos.keys()].filter(c => !existentes.has(c)), budgetId);

    const linhas = [...grupos.entries()].map(([codigo, ls], ordem) => {
        const unidades = new Set(ls.map(i => i.unidade.trim().toUpperCase()));
        const mesmaUnidade = unidades.size === 1;
        const quantidade = mesmaUnidade ? r2(ls.reduce((s, i) => s + i.quantidade, 0)) : 1;
        const unidade = mesmaUnidade ? ls[0].unidade : 'VB';
        const totalLs = r2(ls.reduce((s, i) => s + i.total_linha, 0));
        const atual = existentes.get(codigo);
        let valor: number, origem: string, editado = false;
        if (atual) {
            // Preço editado fica; quantidade acompanha o Orçamento LS.
            valor = atual.valor_unitario; origem = atual.descricao || ''; editado = atual.user_overridden;
            if (!editado && Math.abs(atual.quantidade - quantidade) > 0.001) { valor = r2(totalLs / quantidade); origem = 'Do Orçamento LS'; }
        } else if (historico.has(codigo)) {
            const h = historico.get(codigo)!;
            valor = h.valor; origem = `Último valor usado${h.numero ? ` (${h.numero})` : ''}`;
        } else {
            valor = r2(totalLs / quantidade); origem = 'Do Orçamento LS';
        }
        return {
            budget_id: budgetId, versao: budget.versao_atual, bloco: NOME_PV_OM_HIGHLINE, codigo_item: codigo,
            titulo: catalogo.get(codigo)?.descricao || atual?.titulo || codigo, descricao: origem,
            unidade, quantidade, valor_unitario: valor, bdi_percent: 0, desconto_interno_percent: 0,
            total_linha: r2(quantidade * valor), origem_item: ORIGEM_PV_OM, user_overridden: editado, ativo: true, ordem,
        };
    });
    await prisma.$transaction([
        prisma.budgetItem.deleteMany({ where: { budget_id: budgetId, origem_item: ORIGEM_PV_OM } }),
        prisma.budgetItem.createMany({ data: linhas }),
    ]);
}

/** PV O&M com os itens LS de cada linha, o histórico e a conferência com o Orçamento LS. */
export async function listarPvOm(budgetId: string) {
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    const ls = budget.items.filter(i => i.origem_item === 'ORCAMENTO_LS' && i.ativo);
    const pv = budget.items.filter(i => i.origem_item === ORIGEM_PV_OM).sort((a, b) => a.ordem - b.ordem);
    const historico = await ultimosValores(budget.tenant_id, pv.map(p => p.codigo_item), budgetId);
    return {
        editavel: budget.status === 'RASCUNHO',
        numero: budget.numero,
        linhas: pv.map(p => ({
            id: p.id, codigo: p.codigo_item, descricao: p.titulo, unidade: p.unidade, quantidade: p.quantidade,
            valor_unitario: p.valor_unitario, total: p.total_linha, origem_preco: p.descricao, editado: p.user_overridden,
            ultimo_valor: historico.get(p.codigo_item) || null,
            itens_ls: ls.filter(i => i.codigo_vinculo === p.codigo_item).map(i => ({ codigo: i.codigo_item, titulo: i.titulo, quantidade: i.quantidade, unidade: i.unidade, total: i.total_linha })),
        })),
        total_pv: r2(pv.reduce((s, p) => s + p.total_linha, 0)),
        total_ls: r2(ls.reduce((s, i) => s + i.total_linha, 0)),
        sem_vinculo: ls.filter(i => !i.codigo_vinculo).map(i => ({ codigo: i.codigo_item, titulo: i.titulo })),
    };
}

/** Edição de quantidade e preço na PV O&M. */
export async function editarPvOm(budgetId: string, itens: { id: string; quantidade: number; valor_unitario: number }[]) {
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    if (budget.status !== 'RASCUNHO') throw new Error('O orçamento já saiu do rascunho; a PV O&M não pode mais mudar');
    const linhas = new Map(budget.items.filter(i => i.origem_item === ORIGEM_PV_OM).map(i => [i.id, i]));
    for (const it of itens) {
        const atual = linhas.get(it.id);
        if (!atual) throw new Error('Linha da PV O&M não encontrada');
        const q = Number(it.quantidade), v = Number(it.valor_unitario);
        if (!(q > 0) || !(v >= 0)) throw new Error(`${atual.codigo_item}: quantidade maior que zero e valor não negativo`);
        if (Math.abs(q - atual.quantidade) < 0.0001 && Math.abs(v - atual.valor_unitario) < 0.001) continue;
        await prisma.budgetItem.update({
            where: { id: it.id },
            data: { quantidade: q, valor_unitario: r2(v), total_linha: r2(q * v), user_overridden: true, descricao: 'Editado na PV O&M' },
        });
    }
    return listarPvOm(budgetId);
}

/**
 * Campos fixos do modelo de importação da PV O&M na Highline (planilha enviada
 * em 14/10/2026). Iguais em toda linha; se a Highline mudar algum, é aqui.
 */
export const CAMPOS_FIXOS_PV_OM = {
    cliente: 31, passivo: 'PASSIVO', tipo_requisicao: 51, estoque: '',
    fornecedor: 'UNINC9', loja: 1, filial: 12, lpu: 'NÃO',
};

/**
 * PV O&M em Excel, no layout da Highline: Cliente | PASSIVO | Tipo Requisição |
 * Estoque | Código Site | Produto | Descrição Comp (valor unitário) | Quantidade |
 * Fornecedor | Loja | Filial | LPU | Valor (total da linha).
 */
export async function excelPvOm(budgetId: string) {
    const ExcelJS = (await import('exceljs')).default;
    const budget = await orcamentoDeOperacaoHighline(budgetId);
    const pv = budget.items.filter(i => i.origem_item === ORIGEM_PV_OM).sort((a, b) => a.ordem - b.ordem);
    if (!pv.length) throw new Error('A PV O&M está vazia: vincule os itens do Orçamento LS antes de baixar');
    const site = (budget.atividade?.id_site_sharing || '').toUpperCase();
    const f = CAMPOS_FIXOS_PV_OM;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Planilha1');
    ws.columns = [
        { header: 'Cliente', width: 10 }, { header: 'PASSIVO', width: 12 }, { header: 'Tipo Requisição', width: 16 },
        { header: 'Estoque', width: 10 }, { header: 'Código Site', width: 14 }, { header: 'Produto', width: 12 },
        { header: 'Descrição Comp', width: 16 }, { header: 'Quantidade', width: 12 }, { header: 'Fornecedor', width: 12 },
        { header: 'Loja', width: 8 }, { header: 'Filial', width: 8 }, { header: 'LPU', width: 8 }, { header: 'Valor', width: 16 },
    ];
    for (const p of pv) {
        const r = ws.addRow([f.cliente, f.passivo, f.tipo_requisicao, f.estoque, site, p.codigo_item, p.valor_unitario,
            p.quantidade, f.fornecedor, f.loja, f.filial, f.lpu, r2(p.quantidade * p.valor_unitario)]);
        r.getCell(7).numFmt = '"R$" #,##0.00';
        r.getCell(13).numFmt = '"R$" #,##0.00';
    }
    const nome = `PV_OM_${site || 'SITE'}${budget.numero ? `_${budget.numero}` : ''}.xlsx`.replace(/[^\w.\-]/g, '_');
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nome };
}
