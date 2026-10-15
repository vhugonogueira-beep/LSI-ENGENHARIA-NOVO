import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { inputClass } from './ui';
import { fmtMoeda } from './constants';
import { authFetch } from '../../lib/authFetch';
import type { ItemDaLpu } from './PvOmHighline';

// ─────────────────────────────────────────────────────────────────────────────
// Itens da LPU no Orçamento LS da operação (14/10/2026): a LPU inteira em tabela,
// no mesmo desenho do catálogo da PV Highline — marcar, quantidade, valor padrão
// (preço vigente da LPU), desconto interno, BDI e total. As linhas marcadas são
// as linhas do Orçamento LS ligadas ao item da LPU (source_pricebook_item_id).
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaCatalogo {
    chave: string;
    source_pricebook_item_id?: string | null;
    quantidade: number;
    valor_unitario: number;
    desconto_interno_percent?: number;
    bdi_percent?: number;
}

const r2 = (v: number) => (Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0);
/** Mesma conta do servidor: desconto interno sobre o valor, depois o BDI. */
export function valorUnitarioFinal(l: { valor_unitario: number; desconto_interno_percent?: number; bdi_percent?: number }) {
    const d = Math.min(100, Math.max(0, Number(l.desconto_interno_percent) || 0));
    const bdi = Math.max(0, Number(l.bdi_percent) || 0);
    return r2(r2(Number(l.valor_unitario) * (1 - d / 100)) * (1 + bdi / 100));
}
function totais(l: LinhaCatalogo) {
    const q = Math.max(0, Number(l.quantidade) || 0);
    const bdi = Math.max(0, Number(l.bdi_percent) || 0);
    const semDesconto = r2(q * r2(Number(l.valor_unitario) * (1 + bdi / 100)));
    const final = r2(q * valorUnitarioFinal(l));
    return { semDesconto, final, economia: r2(semDesconto - final) };
}

export default function CatalogoLpuOrcamento<T extends LinhaCatalogo>({ atividadeId, linhas, editavel, onAlternar, onMudar }: {
    atividadeId: string;
    linhas: T[];
    editavel: boolean;
    /** Marca (cria a linha a partir do item da LPU) ou desmarca (remove a linha). */
    onAlternar: (item: ItemDaLpu, marcar: boolean) => void;
    onMudar: (chave: string, campo: 'quantidade' | 'valor_unitario' | 'desconto_interno_percent' | 'bdi_percent', valor: number) => void;
}) {
    const [base, setBase] = useState<{ nome: string; motivo?: string } | null>(null);
    const [itens, setItens] = useState<ItemDaLpu[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [busca, setBusca] = useState('');
    const [categoria, setCategoria] = useState('');
    const [soSelecionados, setSoSelecionados] = useState(false);
    useEffect(() => {
        (async () => {
            const l = await authFetch(`/api/atividades/${atividadeId}/lpus`).then(r => (r.ok ? r.json() : null));
            if (!l?.custo) return;
            setBase({ nome: l.custo.nome, motivo: l.custo.motivo });
            const d = await authFetch(`/api/pricebooks/${l.custo.id}/items?limit=2000`).then(r => (r.ok ? r.json() : []));
            setItens(((Array.isArray(d) ? d : d.items || []) as ItemDaLpu[]).sort((a, b) => (a.codigo_item || '').localeCompare(b.codigo_item || '')));
        })().finally(() => setCarregando(false));
    }, [atividadeId]);

    const porItem = useMemo(() => new Map(linhas.filter(l => l.source_pricebook_item_id).map(l => [l.source_pricebook_item_id!, l])), [linhas]);
    const categorias = useMemo(() => [...new Set(itens.map(i => i.subtipo || '').filter(Boolean))].sort(), [itens]);
    const comPreco = itens.filter(i => (i.valor_venda || 0) > 0).length;
    const termos = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    const visiveis = itens.filter(i => (!categoria || i.subtipo === categoria) && (!soSelecionados || porItem.has(i.id))
        && termos.every(t => `${i.codigo_item} ${i.descricao} ${i.detalhamento || ''} ${i.subtipo || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)));
    const selecionadas = itens.filter(i => porItem.has(i.id)).map(i => porItem.get(i.id)!);
    const soma = selecionadas.reduce((s, l) => { const t = totais(l); return { semDesconto: s.semDesconto + t.semDesconto, economia: s.economia + t.economia, final: s.final + t.final }; }, { semDesconto: 0, economia: 0, final: 0 });
    // Preço copiado da LPU quando o item foi marcado: se a LPU mudou, avisa.
    const divergentes = itens.filter(i => { const l = porItem.get(i.id); return l && (i.valor_venda || 0) > 0 && Math.round(l.valor_unitario * 100) !== Math.round((i.valor_venda || 0) * 100); });

    if (carregando) return <div className="py-8 text-center text-sm text-muted-foreground">Carregando a LPU…</div>;
    if (!base) return <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Nenhuma LPU de custo encontrada para esta atividade (área + cliente). Os itens podem ser importados ou digitados abaixo.</div>;

    const num = (v: number | undefined) => (v ? String(v) : '');
    return (
        <div>
            <p className="mb-2 text-sm font-semibold">Itens do orçamento ({base.nome})</p>
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                    <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className={`${inputClass} pl-9`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar código, descrição ou categoria" aria-label="Buscar item da LPU" />
                </div>
                <select aria-label="Categoria da LPU" className={`${inputClass} lg:w-64`} value={categoria} onChange={e => setCategoria(e.target.value)}>
                    <option value="">Todas as categorias</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-3 text-sm">
                    <input type="checkbox" checked={soSelecionados} onChange={e => setSoSelecionados(e.target.checked)} /> Selecionados
                </label>
            </div>
            <div className="mb-3 text-xs text-muted-foreground">Valores padrão: {base.nome}, preço vigente da LPU · {comPreco} de {itens.length} itens com valor padrão</div>

            {divergentes.length > 0 && editavel && (
                <div className="mb-3 rounded-md border border-warn/50 bg-warn/10 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-[280px] flex-1">
                            <div className="text-sm font-semibold text-warn">{divergentes.length} {divergentes.length === 1 ? 'item está' : 'itens estão'} com preço diferente da LPU</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">O preço foi copiado da LPU quando o item foi marcado. Atualize se quiser o valor vigente — ou mantenha, se este orçamento foi negociado com outro preço.</div>
                        </div>
                        <button type="button" onClick={() => divergentes.forEach(i => onMudar(porItem.get(i.id)!.chave, 'valor_unitario', i.valor_venda || 0))}
                            className="rounded-md border border-warn/60 px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/15">Atualizar todos pela LPU</button>
                    </div>
                </div>
            )}

            <div className="max-h-[520px] overflow-auto border border-border">
                <table className="w-full min-w-[1080px] text-sm">
                    <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground">
                        <tr className="text-left text-xs">
                            <th className="w-12 px-3 py-2.5"><span className="sr-only">Selecionar</span></th>
                            <th className="w-28 px-3 py-2.5">Código</th>
                            <th className="px-3 py-2.5">Serviço / descrição</th>
                            <th className="w-20 px-3 py-2.5">Unidade</th>
                            <th className="w-24 px-3 py-2.5 text-right">Quantidade</th>
                            <th className="w-32 px-3 py-2.5 text-right">Valor padrão</th>
                            <th className="w-28 px-3 py-2.5 text-right" title="Ajuste interno da LS Office; não aparece no documento do cliente.">Desconto interno %</th>
                            <th className="w-24 px-3 py-2.5 text-right">BDI %</th>
                            <th className="w-32 px-3 py-2.5 text-right">Total final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visiveis.map(i => {
                            const l = porItem.get(i.id);
                            const t = l ? totais(l) : null;
                            const diverge = l && (i.valor_venda || 0) > 0 && Math.round(l.valor_unitario * 100) !== Math.round((i.valor_venda || 0) * 100);
                            const campo = (c: 'quantidade' | 'valor_unitario' | 'desconto_interno_percent' | 'bdi_percent', valor: string, extra = '') => (
                                <input disabled={!l || !editavel} type="number" min="0" step={c === 'quantidade' ? 'any' : '0.01'} aria-label={`${c} ${i.codigo_item}`}
                                    className={`${inputClass} h-8 text-right ${extra}`} value={valor}
                                    onChange={e => l && onMudar(l.chave, c, Math.max(0, Number(e.target.value) || 0))} />
                            );
                            return (
                                <tr key={i.id} className={`border-t border-border/70 ${l ? 'bg-primary/5' : 'hover:bg-secondary/30'}`}>
                                    <td className="px-3 py-2 text-center"><input type="checkbox" disabled={!editavel} checked={!!l} onChange={() => onAlternar(i, !l)} aria-label={`Selecionar ${i.codigo_item}`} /></td>
                                    <td className="px-3 py-2 font-id text-xs font-semibold">{i.codigo_item}</td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium">{i.descricao}</div>
                                        {i.detalhamento && i.detalhamento !== i.descricao && <div className="mt-0.5 text-xs text-muted-foreground">{i.detalhamento}</div>}
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">{i.subtipo}</div>
                                    </td>
                                    <td className="px-3 py-2">{i.unidade}</td>
                                    <td className="px-2 py-2">{campo('quantidade', l ? String(l.quantidade) : '')}</td>
                                    <td className="px-2 py-2">
                                        {campo('valor_unitario', l ? String(l.valor_unitario) : (i.valor_venda ? String(i.valor_venda) : ''), diverge ? 'border-warn/70' : '')}
                                        {diverge && editavel && <button type="button" onClick={() => onMudar(l!.chave, 'valor_unitario', i.valor_venda || 0)} className="mt-1 block w-full text-right text-[11px] text-warn hover:underline">Atualizar para {fmtMoeda(i.valor_venda || 0)}</button>}
                                    </td>
                                    <td className="px-2 py-2">{campo('desconto_interno_percent', l ? num(l.desconto_interno_percent) : '')}</td>
                                    <td className="px-2 py-2">{campo('bdi_percent', l ? num(l.bdi_percent) : '')}</td>
                                    <td className={`px-3 py-2 text-right ${t?.final ? 'font-semibold' : 'text-muted-foreground'}`}>{t?.final ? fmtMoeda(t.final) : '—'}</td>
                                </tr>
                            );
                        })}
                        {visiveis.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Nenhum item encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Resumo rotulo="Valor sem desconto" valor={soma.semDesconto} />
                <Resumo rotulo="Economia interna" valor={soma.economia} tom="text-ok" />
                <Resumo rotulo="Total dos itens da LPU" valor={soma.final} destaque />
                <div className="self-end text-xs text-muted-foreground">{selecionadas.length} de {itens.length} itens selecionados</div>
            </div>
        </div>
    );
}

function Resumo({ rotulo, valor, destaque = false, tom = '' }: { rotulo: string; valor: number; destaque?: boolean; tom?: string }) {
    return (
        <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{rotulo}</div>
            {valor ? <div className={`${destaque ? 'text-lg font-bold' : 'text-sm font-semibold'} mt-0.5 ${tom}`}>{fmtMoeda(r2(valor))}</div>
                : <div className={`${destaque ? 'text-lg' : 'text-sm'} mt-0.5 text-muted-foreground`}>—</div>}
        </div>
    );
}
