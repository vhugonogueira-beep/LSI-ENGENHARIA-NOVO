import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, Save, Search } from 'lucide-react';
import { Card, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';

interface CatalogItem {
    templateRow: number;
    category: string;
    code: string;
    description: string;
    unit: string;
    quantityRule?: { min: number; max: number; integer?: boolean } | null;
    defaultUnitPrice?: number | null;
    priceSource?: string | null;
    priceDetail?: string | null;
}

interface CatalogContext {
    uf?: string | null;
    priceSource?: string | null;
    pricedItems?: number | null;
    totalItems?: number | null;
}

interface SavedItem {
    id: string;
    highline_template_row?: number | null;
    quantidade: number;
    valor_unitario: number;
    desconto_interno_percent?: number | null;
    bdi_percent: number;
    total_linha: number;
    ativo: boolean;
}

interface DraftItem {
    quantidade: number;
    valor_unitario: number;
    desconto_interno_percent: number;
    bdi_percent: number;
}

interface BudgetDetail {
    versao_atual: number;
    updated_at: string;
    items: SavedItem[];
}

interface ItemTotals {
    withoutDiscount: number;
    internalSavings: number;
    final: number;
}

interface HighlineBudgetEditorProps {
    budgetId: string;
    targetValue?: number | null;
    targetLabel?: string;
}

function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateItem(item: Pick<DraftItem, 'quantidade' | 'valor_unitario' | 'desconto_interno_percent' | 'bdi_percent'>): ItemTotals {
    const quantity = Math.max(0, Number(item.quantidade) || 0);
    const standardValue = roundMoney(Math.max(0, Number(item.valor_unitario) || 0));
    const discount = Math.min(100, Math.max(0, Number(item.desconto_interno_percent) || 0));
    const bdi = Math.max(0, Number(item.bdi_percent) || 0);

    const unitWithoutDiscount = roundMoney(standardValue * (1 + bdi / 100));
    const discountedUnit = roundMoney(standardValue * (1 - discount / 100));
    const finalUnit = roundMoney(discountedUnit * (1 + bdi / 100));
    const withoutDiscount = roundMoney(quantity * unitWithoutDiscount);
    const final = roundMoney(quantity * finalUnit);

    return {
        withoutDiscount,
        internalSavings: roundMoney(withoutDiscount - final),
        final,
    };
}

function addTotals(left: ItemTotals, right: ItemTotals): ItemTotals {
    return {
        withoutDiscount: roundMoney(left.withoutDiscount + right.withoutDiscount),
        internalSavings: roundMoney(left.internalSavings + right.internalSavings),
        final: roundMoney(left.final + right.final),
    };
}

const EMPTY_TOTALS: ItemTotals = { withoutDiscount: 0, internalSavings: 0, final: 0 };

export default function HighlineBudgetEditor({ budgetId, targetValue, targetLabel }: HighlineBudgetEditorProps) {
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [catalogContext, setCatalogContext] = useState<CatalogContext | null>(null);
    const [budget, setBudget] = useState<BudgetDetail | null>(null);
    const [draft, setDraft] = useState<Record<number, DraftItem>>({});
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('TODOS');
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState('');
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [catalogResponse, budgetResponse] = await Promise.all([
                fetch(`/api/budgets/highline-pv/catalog?budgetId=${encodeURIComponent(budgetId)}`),
                fetch(`/api/budgets/${budgetId}`),
            ]);
            if (!catalogResponse.ok || !budgetResponse.ok) throw new Error('Não foi possível carregar os itens do orçamento');
            const catalogData = await catalogResponse.json();
            const budgetData: BudgetDetail = await budgetResponse.json();
            const initial: Record<number, DraftItem> = {};
            for (const item of budgetData.items || []) {
                if (item.highline_template_row == null) continue;
                initial[item.highline_template_row] = {
                    quantidade: item.quantidade,
                    valor_unitario: item.valor_unitario,
                    desconto_interno_percent: item.desconto_interno_percent ?? 0,
                    bdi_percent: item.bdi_percent,
                };
            }
            setCatalog(catalogData.items || []);
            setCategories(catalogData.categories || []);
            setCatalogContext(catalogData.context || null);
            setBudget(budgetData);
            setDraft(initial);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [budgetId]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return catalog.filter(item => {
            if (category !== 'TODOS' && item.category !== category) return false;
            if (selectedOnly && !draft[item.templateRow]) return false;
            if (!term) return true;
            return `${item.code} ${item.description} ${item.category}`.toLocaleLowerCase('pt-BR').includes(term);
        });
    }, [catalog, category, draft, search, selectedOnly]);

    const catalogTotals = useMemo(() => Object.values(draft)
        .reduce((acc, item) => addTotals(acc, calculateItem(item)), EMPTY_TOTALS), [draft]);

    // Um item selecionado guarda o preço do momento em que foi marcado. Se a base
    // mudou depois, o orçamento fica com o valor antigo — e sem aviso ninguém nota.
    const divergentes = useMemo(() => {
        const linhas: { item: CatalogItem; noOrcamento: number; naBase: number }[] = [];
        for (const item of catalog) {
            const atual = draft[item.templateRow];
            const base = item.defaultUnitPrice;
            if (!atual || base == null || !(base > 0)) continue;
            if (Math.round(atual.valor_unitario * 100) !== Math.round(base * 100)) {
                linhas.push({ item, noOrcamento: atual.valor_unitario, naBase: base });
            }
        }
        return linhas;
    }, [catalog, draft]);

    const divergentePorLinha = useMemo(
        () => new Map(divergentes.map(d => [d.item.templateRow, d])),
        [divergentes],
    );

    function alinharComABase(rows?: number[]) {
        const alvo = rows ?? divergentes.map(d => d.item.templateRow);
        if (alvo.length === 0) return;
        setSaved(false);
        setDraft(current => {
            const next = { ...current };
            for (const row of alvo) {
                const base = catalog.find(c => c.templateRow === row)?.defaultUnitPrice;
                if (next[row] && base != null) next[row] = { ...next[row], valor_unitario: base };
            }
            return next;
        });
    }

    const targetComparison = useMemo(() => {
        const target = Number(targetValue);
        if (!Number.isFinite(target) || target <= 0) return null;
        return {
            target,
            difference: roundMoney(catalogTotals.final - target),
        };
    }, [catalogTotals.final, targetValue]);

    const contextDescription = useMemo(() => {
        if (!catalogContext) return '';
        const parts: string[] = [];
        if (catalogContext.uf) parts.push(`UF ${catalogContext.uf}`);
        if (catalogContext.priceSource) parts.push(catalogContext.priceSource);
        if (catalogContext.pricedItems != null && catalogContext.totalItems != null) {
            parts.push(`${catalogContext.pricedItems} de ${catalogContext.totalItems} itens com valor padrão`);
        }
        return parts.join(' · ');
    }, [catalogContext]);

    function toggleItem(item: CatalogItem) {
        setSaved(false);
        setDraft(current => {
            const next = { ...current };
            if (next[item.templateRow]) delete next[item.templateRow];
            else next[item.templateRow] = {
                quantidade: item.quantityRule?.min && item.quantityRule.min > 0 ? item.quantityRule.min : 1,
                valor_unitario: item.defaultUnitPrice ?? 0,
                desconto_interno_percent: 0,
                bdi_percent: 0,
            };
            return next;
        });
    }

    function updateItem(row: number, field: keyof DraftItem, rawValue: string) {
        const value = Number(rawValue);
        const validValue = Number.isFinite(value) && value >= 0 ? value : 0;
        const normalizedValue = field === 'desconto_interno_percent'
            ? Math.min(100, validValue)
            : validValue;
        setSaved(false);
        setDraft(current => ({
            ...current,
            [row]: { ...current[row], [field]: normalizedValue },
        }));
    }

    async function saveItems(): Promise<boolean> {
        if (!budget) return false;
        setSaving(true);
        setError('');
        try {
            const items = catalog
                .filter(item => draft[item.templateRow])
                .map(item => ({
                    highline_template_row: item.templateRow,
                    quantidade: draft[item.templateRow].quantidade,
                    valor_unitario: draft[item.templateRow].valor_unitario,
                    desconto_interno_percent: draft[item.templateRow].desconto_interno_percent,
                    bdi_percent: draft[item.templateRow].bdi_percent,
                    ativo: true,
                    ordem: item.templateRow,
                }));
            const response = await fetch(`/api/budgets/${budgetId}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items,
                    versaoAtual: budget.versao_atual,
                    expectedUpdatedAt: budget.updated_at,
                    scope: 'catalog',
                }),
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao salvar os itens');
            setBudget(await response.json());
            setSaved(true);
            return true;
        } catch (e: any) {
            setError(e.message);
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function exportPv() {
        setExporting('pv');
        setError('');
        try {
            const ok = await saveItems();
            if (!ok) return;
            const response = await fetch(`/api/budgets/${budgetId}/export/pv-highline`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'Erro ao exportar o orçamento');
            }
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="?([^";]+)"?/i);
            const filename = match?.[1] || `PV_HIGHLINE_${budgetId}.xlsm`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setExporting('');
        }
    }

    if (loading) return <Card title="Itens do orçamento"><div className="py-8 text-center text-sm text-muted-foreground">Carregando catálogo Highline...</div></Card>;

    return (
        <Card title="Itens do orçamento · Catálogo Highline">
            <ErrorBanner message={error} />
            <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-0">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        className={`${inputClass} pl-9`}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar código, descrição ou atividade"
                    />
                </div>
                <select className={`${inputClass} lg:w-64`} value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="TODOS">Todas as atividades</option>
                    {categories.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <label className="h-10 px-3 flex items-center gap-2 border border-border bg-background text-sm whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />
                    Selecionados
                </label>
            </div>
            {contextDescription && (
                <div className="mb-3 text-xs text-muted-foreground">Valores padrão: {contextDescription}</div>
            )}

            {divergentes.length > 0 && (
                <div className="mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[280px]">
                            <div className="text-sm font-semibold text-amber-500">
                                {divergentes.length} {divergentes.length === 1 ? 'item está' : 'itens estão'} com preço diferente da base
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                O preço foi copiado da base quando o item foi marcado e não acompanha alterações
                                posteriores. Atualize se quiser o valor vigente — ou mantenha, se este orçamento
                                foi negociado com outro preço.
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => alinharComABase()}
                            className="rounded-md border border-amber-500/60 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/15"
                        >
                            Atualizar todos pela base
                        </button>
                    </div>
                </div>
            )}

            <div className="border border-border overflow-auto max-h-[520px]">
                <table className="w-full min-w-[1080px] text-sm">
                    <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground">
                        <tr className="text-left text-xs">
                            <th className="w-12 px-3 py-2.5"></th>
                            <th className="w-24 px-3 py-2.5">Código</th>
                            <th className="px-3 py-2.5">Atividade / descrição</th>
                            <th className="w-20 px-3 py-2.5">Unidade</th>
                            <th className="w-24 px-3 py-2.5 text-right">Quantidade</th>
                            <th className="w-32 px-3 py-2.5 text-right">Valor padrão</th>
                            <th className="w-28 px-3 py-2.5 text-right" title="Ajuste interno da LS Office; este percentual não é exibido no documento do cliente.">Desconto interno %</th>
                            <th className="w-24 px-3 py-2.5 text-right">BDI %</th>
                            <th className="w-32 px-3 py-2.5 text-right">Total final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(item => {
                            const selected = draft[item.templateRow];
                            const total = selected ? calculateItem(selected).final : 0;
                            const divergencia = divergentePorLinha.get(item.templateRow);
                            return (
                                <tr key={item.templateRow} className={`border-t border-border/70 ${selected ? 'bg-primary/5' : 'hover:bg-secondary/30'}`}>
                                    <td className="px-3 py-2 text-center">
                                        <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleItem(item)} aria-label={`Selecionar ${item.code}`} />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs font-semibold">{item.code}</td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium">{item.description}</div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">{item.category}</div>
                                    </td>
                                    <td className="px-3 py-2">{item.unit}</td>
                                    <td className="px-2 py-2"><input disabled={!selected} type="number" min={item.quantityRule?.min ?? 0} max={item.quantityRule?.max} step={item.quantityRule?.integer ? 1 : 0.01} className={`${inputClass} h-8 text-right`} value={selected?.quantidade ?? ''} onChange={e => updateItem(item.templateRow, 'quantidade', e.target.value)} title={item.quantityRule ? `Faixa: ${item.quantityRule.min} a ${item.quantityRule.max}` : undefined} /></td>
                                    <td className="px-2 py-2">
                                        <input disabled={!selected} type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right ${divergencia ? 'border-amber-500/70' : ''}`} value={selected?.valor_unitario ?? item.defaultUnitPrice ?? ''} onChange={e => updateItem(item.templateRow, 'valor_unitario', e.target.value)} />
                                        {divergencia ? (
                                            <button
                                                type="button"
                                                onClick={() => alinharComABase([item.templateRow])}
                                                className="mt-1 block w-full text-right text-[10px] text-amber-500 hover:underline"
                                                title={`Base: ${fmtMoeda(divergencia.naBase)}${item.priceDetail ? ` · ${item.priceDetail}` : ''}`}
                                            >
                                                base {fmtMoeda(divergencia.naBase)} · atualizar
                                            </button>
                                        ) : selected && item.priceDetail ? (
                                            <div className="mt-1 text-right text-[10px] text-muted-foreground truncate" title={item.priceDetail}>{item.priceSource}</div>
                                        ) : null}
                                    </td>
                                    <td className="px-2 py-2"><input disabled={!selected} type="number" min="0" max="100" step="0.01" className={`${inputClass} h-8 text-right`} value={selected?.desconto_interno_percent ?? ''} onChange={e => updateItem(item.templateRow, 'desconto_interno_percent', e.target.value)} title="Uso interno da LS Office; não aparece no documento enviado ao cliente." /></td>
                                    <td className="px-2 py-2"><input disabled={!selected} type="number" min="0" step="0.01" className={`${inputClass} h-8 text-right`} value={selected?.bdi_percent ?? ''} onChange={e => updateItem(item.templateRow, 'bdi_percent', e.target.value)} /></td>
                                    <td className="px-3 py-2 text-right font-semibold">{selected ? fmtMoeda(total) : '—'}</td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Nenhum item encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 space-y-3">
                <div className={`grid grid-cols-2 gap-3 ${targetComparison ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
                    <SummaryValue label="Valor sem desconto" value={catalogTotals.withoutDiscount} />
                    <SummaryValue label="Economia interna" value={catalogTotals.internalSavings} tone="success" />
                    <SummaryValue label="Total final" value={catalogTotals.final} emphasis />
                    {targetComparison && (
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground truncate" title={targetLabel || 'Referência'}>{targetLabel || 'Referência'}</div>
                            <div className="text-sm font-semibold mt-0.5">{fmtMoeda(targetComparison.target)}</div>
                            <div className={`text-xs mt-0.5 ${targetComparison.difference <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {targetComparison.difference === 0
                                    ? 'Total final igual à referência'
                                    : `${fmtMoeda(Math.abs(targetComparison.difference))} ${targetComparison.difference < 0 ? 'abaixo' : 'acima'}`}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                        {Object.keys(draft).length} de {catalog.length} itens selecionados
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {saved && <span className="flex items-center gap-1 text-xs text-emerald-500"><Check size={14} /> Salvo</span>}
                        <button onClick={saveItems} disabled={saving || Boolean(exporting)} className="h-9 px-3 border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                            <Save size={15} /> {saving ? 'Salvando...' : 'Salvar itens'}
                        </button>
                        <button onClick={exportPv} disabled={saving || Boolean(exporting) || !Object.values(draft).some(item => item.quantidade > 0)} className="h-9 px-3 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                            <Download size={15} /> {exporting === 'pv' ? 'Exportando...' : 'PV Highline'}
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function SummaryValue({ label, value, emphasis = false, tone }: {
    label: string;
    value: number;
    emphasis?: boolean;
    tone?: 'success';
}) {
    return (
        <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`${emphasis ? 'text-lg font-bold' : 'text-sm font-semibold'} mt-0.5 ${tone === 'success' ? 'text-emerald-500' : ''}`}>
                {fmtMoeda(value)}
            </div>
        </div>
    );
}
