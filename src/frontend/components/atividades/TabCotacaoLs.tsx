import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, Plus, Save, Search, Trash2 } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, EmptyState, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Cotação LS — mesmo padrão de montagem da PV Highline: o catálogo inteiro fica
// à vista, marca-se o item e edita-se na própria linha. Antes era "abrir modal e
// adicionar", que esconde o catálogo e não deixa comparar entre itens.
//
// A diferença de PROPÓSITO: a PV é o que a LS cobra do cliente; a Cotação LS é
// quanto a obra CUSTA para a LS executar. Por isso o número que manda aqui é o
// custo LS, e o valor de venda entra ao lado apenas como referência, para a
// margem ficar visível item a item.
//
// O que a PV não tem e aqui precisa existir: item avulso. Nem tudo que a LS
// cota está na LPU, então os avulsos ficam num bloco próprio, abaixo.
// ─────────────────────────────────────────────────────────────────────────────

interface SavedItem {
    id: string;
    codigo_item: string;
    titulo: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    desconto_interno_percent?: number | null;
    bdi_percent: number;
    highline_template_row?: number | null;
    source_pricebook_item_id?: string | null;
    origem_item?: string | null;
}

interface BudgetDetail {
    versao_atual: number;
    updated_at: string;
    items: SavedItem[];
}

interface ItemLpu {
    id: string;
    codigo_item: string | null;
    descricao: string;
    detalhamento: string | null;
    subtipo: string | null;
    unidade: string;
    valor_venda: number | null;
    custo_ls: number | null;
}

/** Linha marcada do catálogo. A chave é o id do item na LPU. */
interface DraftItem {
    quantidade: number;
    /** Custo unitário que a LS paga. É o número que a Cotação LS existe para medir. */
    custo_unitario: number;
    desconto_interno_percent: number;
    bdi_percent: number;
}

/** Item que não existe na LPU — digitado à mão. */
interface LinhaAvulsa extends DraftItem {
    key: string;
    codigo_item: string;
    titulo: string;
    unidade: string;
}

interface ItemTotals {
    withoutDiscount: number;
    internalSavings: number;
    final: number;
}

function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Mesma conta da PV Highline, para os dois orçamentos da atividade não
// divergirem no cálculo de BDI e desconto interno.
function calculateItem(item: DraftItem): ItemTotals {
    const quantity = Math.max(0, Number(item.quantidade) || 0);
    const standardValue = roundMoney(Math.max(0, Number(item.custo_unitario) || 0));
    const discount = Math.min(100, Math.max(0, Number(item.desconto_interno_percent) || 0));
    const bdi = Math.max(0, Number(item.bdi_percent) || 0);

    const unitWithoutDiscount = roundMoney(standardValue * (1 + bdi / 100));
    const discountedUnit = roundMoney(standardValue * (1 - discount / 100));
    const finalUnit = roundMoney(discountedUnit * (1 + bdi / 100));
    const withoutDiscount = roundMoney(quantity * unitWithoutDiscount);
    const final = roundMoney(quantity * finalUnit);

    return { withoutDiscount, internalSavings: roundMoney(withoutDiscount - final), final };
}

function addTotals(left: ItemTotals, right: ItemTotals): ItemTotals {
    return {
        withoutDiscount: roundMoney(left.withoutDiscount + right.withoutDiscount),
        internalSavings: roundMoney(left.internalSavings + right.internalSavings),
        final: roundMoney(left.final + right.final),
    };
}

const EMPTY_TOTALS: ItemTotals = { withoutDiscount: 0, internalSavings: 0, final: 0 };

let avulsaSeq = 0;
function novaAvulsa(): LinhaAvulsa {
    avulsaSeq += 1;
    return {
        key: `avulso-${avulsaSeq}`, codigo_item: '', titulo: '', unidade: 'un',
        quantidade: 1, custo_unitario: 0, desconto_interno_percent: 0, bdi_percent: 0,
    };
}

export default function TabCotacaoLs({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const orcamentoAtivo = atividade.orcamentos && atividade.orcamentos.length > 0 ? atividade.orcamentos[0] : null;

    const [budget, setBudget] = useState<BudgetDetail | null>(null);
    const [catalogo, setCatalogo] = useState<ItemLpu[]>([]);
    const [nomeBase, setNomeBase] = useState('');
    const [motivoBase, setMotivoBase] = useState('');
    const [draft, setDraft] = useState<Record<string, DraftItem>>({});
    const [avulsos, setAvulsos] = useState<LinhaAvulsa[]>([]);
    const [busca, setBusca] = useState('');
    const [familia, setFamilia] = useState('TODAS');
    const [somenteSelecionados, setSomenteSelecionados] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [erro, setErro] = useState('');

    const load = useCallback(async () => {
        if (!orcamentoAtivo) { setLoading(false); return; }
        setLoading(true);
        setErro('');
        try {
            // Base e orçamento juntos: o draft só se reconstrói sabendo quais
            // itens salvos correspondem a quais linhas da LPU.
            // A base de custo é escolhida pelo servidor por área + cliente da
            // atividade (lpu-atividade.service) — a mesma regra para todas as telas.
            const rl = await fetch(`/api/atividades/${atividade.id}/lpus`);
            const lpus = rl.ok ? await rl.json() : null;
            const lpu = lpus?.custo ? { id: lpus.custo.id, nome_lpu: lpus.custo.nome } : null;
            setMotivoBase(lpus?.custo?.motivo || '');

            let itens: ItemLpu[] = [];
            if (lpu) {
                setNomeBase(lpu.nome_lpu);
                const ri = await fetch(`/api/pricebooks/${lpu.id}/items?limit=2000`);
                const d = ri.ok ? await ri.json() : { items: [] };
                itens = (Array.isArray(d) ? d : d.items || []) as ItemLpu[];
                itens.sort((a, b) => (a.codigo_item || '').localeCompare(b.codigo_item || '', 'pt-BR'));
                setCatalogo(itens);
            }

            const r = await fetch(`/api/budgets/${orcamentoAtivo.id}`);
            if (!r.ok) throw new Error('Não foi possível carregar a Cotação LS');
            const data: BudgetDetail = await r.json();
            setBudget(data);

            // Um item salvo volta para o catálogo quando dá para reconhecê-lo —
            // pelo vínculo com a LPU ou, na falta dele, pelo código LS.
            const porId = new Map(itens.map(i => [i.id, i]));
            const porCodigo = new Map(itens.filter(i => i.codigo_item).map(i => [i.codigo_item!, i]));

            const novoDraft: Record<string, DraftItem> = {};
            const novosAvulsos: LinhaAvulsa[] = [];

            for (const item of (data.items || [])) {
                if (item.highline_template_row != null) continue;   // pertence à PV
                if (item.origem_item === 'ORCAMENTO_LS') continue;   // preço ao cliente do Orçamento LS, não custo
                const daLpu = (item.source_pricebook_item_id && porId.get(item.source_pricebook_item_id))
                    || porCodigo.get(item.codigo_item);
                const valores: DraftItem = {
                    quantidade: item.quantidade,
                    // O que o orçamento guarda em valor_unitario, nesta aba, é o custo.
                    custo_unitario: item.valor_unitario,
                    desconto_interno_percent: item.desconto_interno_percent ?? 0,
                    bdi_percent: item.bdi_percent,
                };
                if (daLpu) novoDraft[daLpu.id] = valores;
                else novosAvulsos.push({ ...valores, key: item.id, codigo_item: item.codigo_item, titulo: item.titulo, unidade: item.unidade });
            }
            setDraft(novoDraft);
            setAvulsos(novosAvulsos);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }, [orcamentoAtivo?.id, atividade.id]);

    useEffect(() => { load(); }, [load]);

    const familias = useMemo(
        () => ([...new Set(catalogo.map(i => i.subtipo).filter(Boolean))] as string[]).sort(),
        [catalogo],
    );

    const visiveis = useMemo(() => {
        const termo = busca.trim().toLocaleLowerCase('pt-BR');
        return catalogo.filter(i => {
            if (familia !== 'TODAS' && i.subtipo !== familia) return false;
            if (somenteSelecionados && !draft[i.id]) return false;
            if (!termo) return true;
            return `${i.codigo_item || ''} ${i.descricao} ${i.detalhamento || ''} ${i.subtipo || ''}`
                .toLocaleLowerCase('pt-BR').includes(termo);
        });
    }, [catalogo, busca, familia, somenteSelecionados, draft]);

    const totais = useMemo(() => {
        const doCatalogo = Object.values(draft).reduce((acc, i) => addTotals(acc, calculateItem(i)), EMPTY_TOTALS);
        return avulsos.reduce((acc, i) => addTotals(acc, calculateItem(i)), doCatalogo);
    }, [draft, avulsos]);

    function marcar(item: ItemLpu) {
        setSaved(false);
        setDraft(atual => {
            const proximo = { ...atual };
            if (proximo[item.id]) delete proximo[item.id];
            // Sugere o custo da LPU. Só 23 dos 372 itens têm custo cadastrado —
            // nos demais a linha nasce em zero e pede o número na mão.
            else proximo[item.id] = {
                quantidade: 1,
                custo_unitario: item.custo_ls ?? 0,
                desconto_interno_percent: 0,
                bdi_percent: 0,
            };
            return proximo;
        });
    }

    function editar(id: string, campo: keyof DraftItem, bruto: string) {
        const n = Number(bruto);
        const valido = Number.isFinite(n) && n >= 0 ? n : 0;
        const valor = campo === 'desconto_interno_percent' ? Math.min(100, valido) : valido;
        setSaved(false);
        setDraft(atual => ({ ...atual, [id]: { ...atual[id], [campo]: valor } }));
    }

    function editarAvulso(key: string, campo: keyof LinhaAvulsa, bruto: string) {
        setSaved(false);
        setAvulsos(atual => atual.map(linha => {
            if (linha.key !== key) return linha;
            if (campo === 'codigo_item' || campo === 'titulo' || campo === 'unidade') return { ...linha, [campo]: bruto };
            const n = Number(bruto);
            const valido = Number.isFinite(n) && n >= 0 ? n : 0;
            return { ...linha, [campo]: campo === 'desconto_interno_percent' ? Math.min(100, valido) : valido };
        }));
    }

    /** Volta o custo da linha para o custo cadastrado na LPU. */
    function alinharComABase(item: ItemLpu) {
        if (item.custo_ls == null) return;
        setSaved(false);
        setDraft(atual => ({ ...atual, [item.id]: { ...atual[item.id], custo_unitario: item.custo_ls! } }));
    }

    const divergentes = useMemo(
        () => catalogo.filter(i => {
            const d = draft[i.id];
            if (!d || i.custo_ls == null || !(i.custo_ls > 0)) return false;
            return Math.round(d.custo_unitario * 100) !== Math.round(i.custo_ls * 100);
        }),
        [catalogo, draft],
    );

    /** Itens marcados que ainda estão sem custo — é o que trava a cotação. */
    const semCusto = useMemo(
        () => catalogo.filter(i => draft[i.id] && !(draft[i.id].custo_unitario > 0)),
        [catalogo, draft],
    );

    /** Venda de referência e margem, para o custo não ser lido no vácuo. */
    const referencia = useMemo(() => {
        let venda = 0;
        for (const i of catalogo) {
            const d = draft[i.id];
            if (d && i.valor_venda) venda += (Number(d.quantidade) || 0) * i.valor_venda;
        }
        return roundMoney(venda);
    }, [catalogo, draft]);

    async function salvar(): Promise<boolean> {
        if (!orcamentoAtivo || !budget) return false;
        setSaving(true);
        setErro('');
        try {
            const doCatalogo = catalogo
                .filter(i => draft[i.id])
                .map((i, index) => ({
                    codigo_item: i.codigo_item || `LPU-${index + 1}`,
                    titulo: i.descricao,
                    descricao: i.detalhamento || null,
                    unidade: i.unidade,
                    bloco: i.subtipo || 'OUTROS',
                    // Guarda de qual linha da LPU o item veio — é o que permite
                    // reabrir a cotação com as marcações no lugar.
                    source_pricebook_item_id: i.id,
                    quantidade: draft[i.id].quantidade,
                    valor_unitario: draft[i.id].custo_unitario,
                    desconto_interno_percent: draft[i.id].desconto_interno_percent,
                    bdi_percent: draft[i.id].bdi_percent,
                    ativo: true,
                    ordem: index,
                }));

            const extras = avulsos
                .filter(l => l.titulo.trim() || l.codigo_item.trim())
                .map((l, index) => ({
                    codigo_item: l.codigo_item || `AVULSO-${index + 1}`,
                    titulo: l.titulo || 'Item sem descrição',
                    unidade: l.unidade || 'un',
                    quantidade: l.quantidade,
                    valor_unitario: l.custo_unitario,
                    desconto_interno_percent: l.desconto_interno_percent,
                    bdi_percent: l.bdi_percent,
                    ativo: true,
                    ordem: doCatalogo.length + index,
                }));

            const r = await fetch(`/api/budgets/${orcamentoAtivo.id}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [...doCatalogo, ...extras],
                    versaoAtual: budget.versao_atual,
                    expectedUpdatedAt: budget.updated_at,
                    scope: 'internal',
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar a Cotação LS');
            setBudget(await r.json());
            setSaved(true);
            onRefresh();
            return true;
        } catch (e: any) {
            setErro(e.message);
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function baixar() {
        setExporting(true);
        setErro('');
        try {
            const ok = await salvar();
            if (!ok || !orcamentoAtivo) return;
            const r = await fetch(`/api/budgets/${orcamentoAtivo.id}/export/excel`);
            if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Erro ao exportar a Cotação LS');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `COTACAO_LS_${atividade.codigo || orcamentoAtivo.id}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setExporting(false);
        }
    }

    if (!orcamentoAtivo) {
        return (
            <Card title="Cotação LS">
                <EmptyState text="Crie o orçamento na aba Identificação antes de montar a Cotação LS." />
            </Card>
        );
    }

    if (loading) {
        return <Card title="Cotação LS"><div className="py-10 text-center text-muted-foreground">Carregando catálogo...</div></Card>;
    }

    const selecionados = Object.keys(draft).length;

    return (
        <Card title="Cotação LS — custo interno">
            {erro && <ErrorBanner message={erro} />}

            {catalogo.length === 0 ? (
                <EmptyState text="A LPU LS Office Geral ainda não foi importada. Rode: npx tsx src/backend/scripts/importar-lpu-ls.ts" />
            ) : (
                <>
                    {/* filtros */}
                    <div className="flex flex-col lg:flex-row gap-2 mb-3">
                        <div className="relative flex-1">
                            <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                className={`${inputClass} pl-9`}
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar código LS, item, grupo ou família"
                                aria-label="Buscar item da LPU"
                            />
                        </div>
                        <select aria-label="Família" className={`${inputClass} lg:w-64`} value={familia} onChange={e => setFamilia(e.target.value)}>
                            <option value="TODAS">Todas as famílias ({familias.length})</option>
                            {familias.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <label className="h-10 px-3 flex items-center gap-2 rounded-lg border border-border bg-background text-sm whitespace-nowrap cursor-pointer">
                            <input type="checkbox" checked={somenteSelecionados} onChange={e => setSomenteSelecionados(e.target.checked)} />
                            Selecionados
                        </label>
                    </div>

                    <div className="mb-3 text-xs text-muted-foreground">
                        Custo sugerido: custo LS da <strong>{nomeBase || 'LPU LS Office Geral'}</strong>{motivoBase ? <> — escolhida automaticamente: {motivoBase}</> : null}.
                        <span className="ml-3">{catalogo.length} itens no catálogo.</span>
                        <span className="ml-3">A venda ao lado é referência da LPU.</span>
                    </div>

                    {semCusto.length > 0 && (
                        <div className="mb-3 rounded-md border border-crit/45 bg-crit/10 px-3 py-2.5">
                            <div className="text-sm font-semibold text-crit">
                                {semCusto.length} {semCusto.length === 1 ? 'item marcado está' : 'itens marcados estão'} sem custo
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                A LPU tem custo cadastrado em poucos itens. Sem preencher, o custo da obra sai menor
                                do que é de verdade e o total abaixo passa a mentir.
                            </div>
                        </div>
                    )}

                    {divergentes.length > 0 && (
                        <div className="mb-3 rounded-md border border-warn/50 bg-warn/10 px-3 py-2.5">
                            <div className="text-sm font-semibold text-warn">
                                {divergentes.length} {divergentes.length === 1 ? 'item está' : 'itens estão'} com custo diferente da LPU
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                O custo foi copiado da LPU quando o item foi marcado. Use "Usar custo da LPU" na linha
                                para voltar ao cadastrado, ou mantenha se esta obra foi comprada por outro preço.
                            </div>
                        </div>
                    )}

                    {/* catálogo */}
                    <div className="border border-border overflow-auto max-h-[520px]">
                        <table className="w-full min-w-[1360px] text-sm">
                            <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground">
                                <tr className="text-left text-xs">
                                    <th className="w-12 px-3 py-2.5"><span className="sr-only">Selecionar</span></th>
                                    <th className="w-28 px-3 py-2.5">Código LS</th>
                                    <th className="px-3 py-2.5">Item</th>
                                    <th className="w-32 px-3 py-2.5">Família</th>
                                    <th className="w-16 px-3 py-2.5">Un.</th>
                                    <th className="w-24 px-3 py-2.5 text-right">Qtd.</th>
                                    <th className="w-32 px-3 py-2.5 text-right">Custo LS un.</th>
                                    <th className="w-32 px-3 py-2.5 text-right">Custo total</th>
                                    <th className="w-28 px-3 py-2.5 text-right" title="Valor de venda cadastrado na LPU. Referência, não editável aqui.">Venda un. (ref.)</th>
                                    <th className="w-28 px-3 py-2.5 text-right">Margem</th>
                                    <th className="w-20 px-3 py-2.5 text-right">BDI %</th>
                                    <th className="w-24 px-3 py-2.5 text-right" title="Ajuste interno da LS Office; não aparece no documento do cliente.">Desc. %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiveis.map(item => {
                                    const marcado = draft[item.id];
                                    const total = marcado ? calculateItem(marcado).final : 0;
                                    const custoTotal = marcado ? roundMoney((Number(marcado.quantidade) || 0) * (Number(marcado.custo_unitario) || 0)) : 0;
                                    const vendaTotal = marcado && item.valor_venda ? roundMoney((Number(marcado.quantidade) || 0) * item.valor_venda) : null;
                                    const margem = marcado && vendaTotal != null && custoTotal > 0 ? roundMoney(vendaTotal - custoTotal) : null;
                                    const divergente = marcado && item.custo_ls != null && item.custo_ls > 0
                                        && Math.round(marcado.custo_unitario * 100) !== Math.round(item.custo_ls * 100);
                                    const faltaCusto = marcado && !(marcado.custo_unitario > 0);
                                    return (
                                        <tr key={item.id} className={`border-t border-border/70 ${marcado ? 'bg-primary/5' : 'hover:bg-secondary/30'}`}>
                                            <td className="px-3 py-2 text-center">
                                                <input type="checkbox" checked={Boolean(marcado)} onChange={() => marcar(item)} aria-label={`Selecionar ${item.codigo_item}`} />
                                            </td>
                                            <td className="px-3 py-2 font-id text-xs font-semibold">{item.codigo_item || '—'}</td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium">{item.descricao}</div>
                                                {item.detalhamento && <div className="text-[11px] text-muted-foreground mt-0.5">{item.detalhamento}</div>}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.subtipo || '—'}</td>
                                            <td className="px-3 py-2">{item.unidade}</td>
                                            <td className="px-2 py-2"><input disabled={!marcado} type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={marcado?.quantidade ?? ''} onChange={e => editar(item.id, 'quantidade', e.target.value)} /></td>
                                            <td className="px-2 py-2">
                                                <input disabled={!marcado} type="number" min="0" step="0.01"
                                                    className={`${inputClass} h-8 text-right ${divergente ? 'border-warn/70' : ''} ${faltaCusto ? 'border-crit/60' : ''}`}
                                                    placeholder={item.custo_ls == null ? 'sem custo' : ''}
                                                    value={marcado?.custo_unitario ?? item.custo_ls ?? ''} onChange={e => editar(item.id, 'custo_unitario', e.target.value)} />
                                                {divergente && (
                                                    <button type="button" onClick={() => alinharComABase(item)} title="Usar custo da LPU" className="mt-1 block w-full text-right text-[11px] text-warn hover:underline">
                                                        Usar {fmtMoeda(item.custo_ls!)}
                                                    </button>
                                                )}
                                            </td>
                                            <td className={`px-3 py-2 text-right ${marcado && total ? 'font-semibold' : 'text-muted-foreground'}`}>{marcado && total ? fmtMoeda(total) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.valor_venda ? fmtMoeda(item.valor_venda) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-xs">
                                                {margem == null
                                                    ? <span className="text-muted-foreground">—</span>
                                                    : <span className={margem >= 0 ? 'text-foreground font-semibold' : 'text-crit font-semibold'}>
                                                        {fmtMoeda(margem)}
                                                        {vendaTotal ? <span className="text-muted-foreground font-normal ml-1">{Math.round((margem / vendaTotal) * 100)}%</span> : null}
                                                    </span>}
                                            </td>
                                            <td className="px-2 py-2"><input disabled={!marcado} type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={marcado?.bdi_percent ?? ''} onChange={e => editar(item.id, 'bdi_percent', e.target.value)} /></td>
                                            <td className="px-2 py-2"><input disabled={!marcado} type="number" min="0" max="100" step="0.01" className={`${inputClass} h-8 text-right`} value={marcado?.desconto_interno_percent ?? ''} onChange={e => editar(item.id, 'desconto_interno_percent', e.target.value)} /></td>
                                        </tr>
                                    );
                                })}
                                {visiveis.length === 0 && <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum item encontrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* itens fora da LPU */}
            <div className="mt-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                        <div className="text-sm font-semibold">Itens avulsos</div>
                        <div className="text-xs text-muted-foreground">Para o que não existe na LPU. Entram na mesma cotação.</div>
                    </div>
                    <button type="button" onClick={() => { setSaved(false); setAvulsos(a => [...a, novaAvulsa()]); }} className="h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2">
                        <Plus size={15} aria-hidden /> Adicionar item avulso
                    </button>
                </div>
                {avulsos.length > 0 && (
                    <div className="border border-border overflow-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-secondary text-muted-foreground">
                                <tr className="text-left text-xs">
                                    <th className="w-28 px-3 py-2.5">Código</th>
                                    <th className="px-3 py-2.5">Descrição</th>
                                    <th className="w-20 px-3 py-2.5">Un.</th>
                                    <th className="w-24 px-3 py-2.5 text-right">Qtd.</th>
                                    <th className="w-32 px-3 py-2.5 text-right">Custo un.</th>
                                    <th className="w-24 px-3 py-2.5 text-right">BDI %</th>
                                    <th className="w-28 px-3 py-2.5 text-right">Desc. %</th>
                                    <th className="w-32 px-3 py-2.5 text-right">Total</th>
                                    <th className="w-12 px-3 py-2.5"><span className="sr-only">Ações</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {avulsos.map(l => (
                                    <tr key={l.key} className="border-t border-border/70">
                                        <td className="px-2 py-2"><input aria-label="Código" className={`${inputClass} h-8 font-id`} value={l.codigo_item} onChange={e => editarAvulso(l.key, 'codigo_item', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input aria-label="Descrição" className={`${inputClass} h-8`} value={l.titulo} onChange={e => editarAvulso(l.key, 'titulo', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input aria-label="Unidade" className={`${inputClass} h-8`} value={l.unidade} onChange={e => editarAvulso(l.key, 'unidade', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={l.quantidade} onChange={e => editarAvulso(l.key, 'quantidade', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={l.custo_unitario} onChange={e => editarAvulso(l.key, 'custo_unitario', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={l.bdi_percent} onChange={e => editarAvulso(l.key, 'bdi_percent', e.target.value)} /></td>
                                        <td className="px-2 py-2"><input type="number" min="0" max="100" step="0.01" className={`${inputClass} h-8 text-right`} value={l.desconto_interno_percent} onChange={e => editarAvulso(l.key, 'desconto_interno_percent', e.target.value)} /></td>
                                        <td className="px-3 py-2 text-right font-semibold">{fmtMoeda(calculateItem(l).final)}</td>
                                        <td className="px-2 py-2 text-center">
                                            <button onClick={() => { setSaved(false); setAvulsos(a => a.filter(x => x.key !== l.key)); }} type="button" title="Excluir item avulso" aria-label="Excluir item avulso" className="text-muted-foreground hover:text-crit">
                                                <Trash2 size={15} aria-hidden />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* totais e ações */}
            <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <SummaryValue label="Custo da obra (Cotação LS)" value={totais.final} emphasis />
                    <SummaryValue label="Venda de referência (LPU)" value={referencia} />
                    <SummaryValue
                        label={referencia > 0 ? `Margem sobre a referência (${Math.round(((referencia - totais.final) / referencia) * 100)}%)` : 'Margem sobre a referência'}
                        value={roundMoney(referencia - totais.final)}
                        tone={referencia > 0 && referencia - totais.final < 0 ? 'alert' : undefined} />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                        {selecionados} de {catalogo.length} itens da LPU
                        {avulsos.length > 0 && <span className="ml-3">{avulsos.length} avulso(s)</span>}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {saved && <span className="flex items-center gap-1 text-xs text-ok"><Check size={14} aria-hidden /> Salvo</span>}
                        <button type="button" onClick={salvar} disabled={saving || exporting} className="h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                            <Save size={15} aria-hidden /> {saving ? 'Salvando...' : 'Salvar itens'}
                        </button>
                        <button type="button" onClick={baixar} disabled={saving || exporting || (selecionados === 0 && avulsos.length === 0)} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                            <Download size={15} aria-hidden /> {exporting ? 'Exportando...' : 'Baixar cotação LS'}
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function SummaryValue({ label, value, emphasis = false, tone }: {
    label: string; value: number; emphasis?: boolean; tone?: 'alert';
}) {
    // Dinheiro é neutro; vermelho só quando é alerta (margem negativa).
    return (
        <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            {value ? (
                <div className={`${emphasis ? 'text-lg font-bold' : 'text-sm font-semibold'} mt-0.5 ${tone === 'alert' ? 'text-crit' : ''}`}>
                    {fmtMoeda(value)}
                </div>
            ) : <div className={`${emphasis ? 'text-lg' : 'text-sm'} mt-0.5 text-muted-foreground`}>—</div>}
        </div>
    );
}
