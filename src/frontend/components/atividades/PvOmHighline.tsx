import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Link2, Plus, Save, Search, X } from 'lucide-react';
import { Card, EmptyState, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Operação Highline (14/10/2026): o Orçamento LS é composto pela LPU Operações e
// cada item aponta para um código do cadastro O&M da Highline. Desses vínculos
// nasce a PV O&M Highline — os dois orçamentos vão para o cliente.
// ─────────────────────────────────────────────────────────────────────────────

const Modal = ({ titulo, onFechar, children, largura = 'max-w-4xl' }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: string }) => (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className={`flex max-h-[90vh] w-full ${largura} flex-col rounded-2xl border border-border bg-card`}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-base font-bold">{titulo}</h3>
                <button type="button" onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden /></button>
            </div>
            {children}
        </div>
    </div>
);

export interface ItemDaLpu { id: string; codigo_item: string | null; subtipo: string | null; descricao: string; detalhamento: string | null; unidade: string; valor_venda: number | null }

/** Escolhe itens da LPU da atividade (LPU Operações na operação) para o Orçamento LS. */
export function LpuPickerModal({ atividadeId, onAdicionar, onFechar }: { atividadeId: string; onAdicionar: (itens: ItemDaLpu[]) => void; onFechar: () => void }) {
    const [base, setBase] = useState<{ nome: string } | null>(null);
    const [itens, setItens] = useState<ItemDaLpu[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [busca, setBusca] = useState('');
    const [categoria, setCategoria] = useState('');
    const [marcados, setMarcados] = useState<string[]>([]);
    useEffect(() => {
        (async () => {
            const l = await authFetch(`/api/atividades/${atividadeId}/lpus`).then(r => (r.ok ? r.json() : null));
            if (!l?.custo) return;
            setBase({ nome: l.custo.nome });
            const d = await authFetch(`/api/pricebooks/${l.custo.id}/items?limit=2000`).then(r => (r.ok ? r.json() : []));
            setItens(((Array.isArray(d) ? d : d.items || []) as ItemDaLpu[]).sort((a, b) => (a.codigo_item || '').localeCompare(b.codigo_item || '')));
        })().finally(() => setCarregando(false));
    }, [atividadeId]);
    const categorias = useMemo(() => [...new Set(itens.map(i => i.subtipo || '').filter(Boolean))].sort(), [itens]);
    const termos = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    const visiveis = itens.filter(i => (!categoria || i.subtipo === categoria) && termos.every(t =>
        `${i.codigo_item} ${i.descricao} ${i.detalhamento || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t))).slice(0, 300);
    return (
        <Modal titulo={`Adicionar da LPU${base ? ` — ${base.nome}` : ''}`} onFechar={onFechar}>
            <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
                <label className="relative min-w-60 flex-1">
                    <Search size={14} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input autoFocus aria-label="Buscar item da LPU" placeholder="Buscar por código ou descrição" className={`${inputClass} pl-8`} value={busca} onChange={e => setBusca(e.target.value)} />
                </label>
                <select aria-label="Categoria" className={`${inputClass} w-64`} value={categoria} onChange={e => setCategoria(e.target.value)}>
                    <option value="">Todas as categorias</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                {carregando ? <p className="py-6 text-sm text-muted-foreground">Carregando a LPU…</p>
                    : !base ? <p className="py-6 text-sm text-muted-foreground">Nenhuma LPU de custo encontrada para esta atividade.</p>
                    : visiveis.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhum item encontrado.</p>
                    : visiveis.map(i => {
                        const ok = marcados.includes(i.id);
                        return (
                            <label key={i.id} className={`flex cursor-pointer items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0 ${ok ? 'bg-primary/5' : ''}`}>
                                <input type="checkbox" className="mt-1" checked={ok} onChange={() => setMarcados(v => (ok ? v.filter(x => x !== i.id) : [...v, i.id]))} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-baseline gap-x-2">
                                        <span className="font-id text-xs text-primary">{i.codigo_item}</span>
                                        <strong className="text-sm">{i.descricao}</strong>
                                    </span>
                                    {i.detalhamento && i.detalhamento !== i.descricao && <span className="block text-xs text-muted-foreground">{i.detalhamento}</span>}
                                    <span className="block text-[11px] text-muted-foreground">{i.subtipo}</span>
                                </span>
                                <span className="whitespace-nowrap text-right text-sm">
                                    <strong className="tabular-nums">{i.valor_venda ? fmtMoeda(i.valor_venda) : 'sem preço'}</strong>
                                    <span className="block text-[11px] text-muted-foreground">por {i.unidade}</span>
                                </span>
                            </label>
                        );
                    })}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                <span className="text-xs text-muted-foreground">{marcados.length} selecionado(s){visiveis.length === 300 ? ' · mostrando os 300 primeiros, refine a busca' : ''}</span>
                <div className="flex gap-2">
                    <button type="button" onClick={onFechar} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold">Cancelar</button>
                    <button type="button" disabled={!marcados.length} onClick={() => onAdicionar(itens.filter(i => marcados.includes(i.id)))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Plus size={14} aria-hidden /> Adicionar ao orçamento</button>
                </div>
            </div>
        </Modal>
    );
}

interface Sugestao { codigo: string; descricao: string; motivo: string; score: number }
interface ItemVinculo { id: string; codigo_item: string; titulo: string; unidade: string; quantidade: number; total: number; codigo_vinculo: string | null; sugestoes: Sugestao[] }

/** Liga cada item do Orçamento LS a um código O&M da Highline (com sugestões). */
// Desenho de 14/10/2026: uma linha por item e um único campo de escolha; as
// sugestões e a busca no cadastro só aparecem ao abrir o campo.
export function VinculacaoPvOmModal({ budgetId, aviso, onConcluir, onFechar, textoConcluir = 'Salvar vínculos' }: {
    budgetId: string; aviso?: string; textoConcluir?: string; onConcluir: () => void; onFechar: () => void;
}) {
    const [itens, setItens] = useState<ItemVinculo[]>([]);
    const [catalogo, setCatalogo] = useState<{ codigo: string; descricao: string }[]>([]);
    const [escolha, setEscolha] = useState<Record<string, string>>({});
    const [aberto, setAberto] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [soPendentes, setSoPendentes] = useState(false);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        authFetch(`/api/budgets/${budgetId}/pv-om/vinculos`).then(async r => {
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Erro ao carregar os vínculos');
            setItens(d.itens); setCatalogo(d.catalogo);
            // Sem vínculo ainda: já vem marcada a melhor sugestão forte (LPU ou uso anterior).
            setEscolha(Object.fromEntries(d.itens.map((i: ItemVinculo) => [i.id, i.codigo_vinculo || (i.sugestoes[0]?.score >= 0.95 ? i.sugestoes[0].codigo : '')])));
        }).catch(e => setErro(e.message));
    }, [budgetId]);
    const descricaoDe = useMemo(() => new Map(catalogo.map(c => [c.codigo, c.descricao])), [catalogo]);
    const termos = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    const achados = termos.length ? catalogo.filter(c => termos.every(t => `${c.codigo} ${c.descricao}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t))).slice(0, 30) : [];
    const vinculados = itens.filter(i => escolha[i.id]).length;
    const visiveis = soPendentes ? itens.filter(i => !escolha[i.id]) : itens;
    const escolher = (id: string, codigo: string) => { setEscolha(e => ({ ...e, [id]: codigo })); setAberto(null); setBusca(''); };

    async function salvar() {
        setErro(''); setSalvando(true);
        try {
            const r = await authFetch(`/api/budgets/${budgetId}/pv-om/vinculos`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vinculos: itens.map(i => ({ item_id: i.id, codigo: escolha[i.id] || null })) }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Erro ao salvar os vínculos');
            onConcluir();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    const opcao = (id: string, codigo: string, descricao: string, nota?: string) => (
        <button key={codigo} type="button" onClick={() => escolher(id, codigo)}
            className={`flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-secondary/70 ${escolha[id] === codigo ? 'bg-primary/10' : ''}`}>
            <span className="w-16 shrink-0 font-id font-semibold text-primary">{codigo}</span>
            <span className="min-w-0 flex-1">{descricao}</span>
            {nota && <span className="shrink-0 text-[10px] text-muted-foreground">{nota}</span>}
        </button>
    );

    return (
        <Modal titulo="Vincular à PV O&M Highline" onFechar={onFechar} largura="max-w-5xl">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-xs">
                <span className="font-semibold">{vinculados} de {itens.length} itens vinculados</span>
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary"><span className="block h-full bg-ok" style={{ width: `${itens.length ? (vinculados / itens.length) * 100 : 0}%` }} /></span>
                <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                    <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} /> Só os sem código
                </label>
                {aviso && <p className="w-full text-warn">{aviso}</p>}
            </div>
            <ErrorBanner message={erro} />
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full table-fixed text-sm">
                    <colgroup><col className="w-8" /><col /><col className="w-[44%]" /></colgroup>
                    <thead className="sticky top-0 z-10 bg-card text-left text-[11px] font-semibold text-muted-foreground">
                        <tr className="border-b border-border"><th /><th className="px-2 py-2">Item do Orçamento LS</th><th className="px-2 py-2">Código O&M da Highline</th></tr>
                    </thead>
                    <tbody>
                        {visiveis.map(i => {
                            const atual = escolha[i.id];
                            const sugestoes = i.sugestoes.filter(s => s.codigo !== atual).slice(0, 4);
                            return (
                                <Fragment key={i.id}>
                                <tr className={`align-top ${aberto === i.id ? 'bg-secondary/30' : 'border-b border-border/60'}`}>
                                    <td className="py-3 pl-4"><span className={`mt-1.5 block h-2 w-2 rounded-full ${atual ? 'bg-ok' : 'bg-warn'}`} title={atual ? 'Vinculado' : 'Sem código'} /></td>
                                    <td className="px-2 py-2.5">
                                        <div className="truncate text-sm font-medium" title={i.titulo}><span className="mr-1.5 font-id text-xs text-muted-foreground">{i.codigo_item}</span>{i.titulo}</div>
                                        <div className="text-[11px] text-muted-foreground">{i.quantidade} {i.unidade} · {fmtMoeda(i.total)}</div>
                                    </td>
                                    <td className="px-2 py-2 pr-4">
                                        <button type="button" onClick={() => { setAberto(aberto === i.id ? null : i.id); setBusca(''); }} aria-expanded={aberto === i.id}
                                            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${atual ? 'border-border hover:border-primary/60' : 'border-warn/50 bg-warn/5 hover:border-warn'}`}>
                                            {atual
                                                ? <><span className="font-id font-semibold text-primary">{atual}</span><span className="min-w-0 flex-1 truncate">{descricaoDe.get(atual)}</span></>
                                                : <span className="flex-1 font-semibold text-warn">Escolher código…{i.sugestoes.length ? ` (${i.sugestoes.length} sugestões)` : ''}</span>}
                                            <span aria-hidden className="text-muted-foreground">▾</span>
                                        </button>
                                    </td>
                                </tr>
                                {aberto === i.id && (
                                    <tr className="border-b border-border/60 bg-secondary/30">
                                        <td />
                                        <td colSpan={2} className="px-2 pb-3 pr-4">
                                            <label className="relative block">
                                                <Search size={12} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                <input autoFocus aria-label="Buscar código O&M" placeholder="Buscar no cadastro O&M da Highline (código ou descrição)" className={`${inputClass} h-8 pl-7 text-xs`} value={busca} onChange={e => setBusca(e.target.value)} />
                                            </label>
                                            <div className="mt-1.5 max-h-60 overflow-y-auto rounded-md border border-border bg-card p-1">
                                                {!termos.length && sugestoes.length > 0 && <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold text-muted-foreground">Sugestões</p>}
                                                {!termos.length && sugestoes.map(s => opcao(i.id, s.codigo, s.descricao, s.motivo))}
                                                {termos.length > 0 && achados.map(c => opcao(i.id, c.codigo, c.descricao))}
                                                {termos.length > 0 && !achados.length && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Nada encontrado.</p>}
                                                {!termos.length && !sugestoes.length && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Sem sugestões. Busque no cadastro.</p>}
                                            </div>
                                            {atual && <button type="button" onClick={() => escolher(i.id, '')} className="mt-1 rounded-md px-2.5 py-1 text-xs font-semibold text-crit hover:bg-crit/10">Tirar o vínculo</button>}
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                            );
                        })}
                        {!itens.length && !erro && <tr><td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Carregando…</td></tr>}
                        {itens.length > 0 && !visiveis.length && <tr><td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Todos os itens têm código.</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                <span className="text-[11px] text-muted-foreground">Vários itens podem ir para o mesmo código (somam na PV O&M). Item sem código fica fora da PV.</span>
                <div className="flex gap-2">
                    <button type="button" onClick={onFechar} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold">Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando || !itens.length}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Link2 size={14} aria-hidden /> {salvando ? 'Salvando…' : textoConcluir}</button>
                </div>
            </div>
        </Modal>
    );
}

interface LinhaPv {
    id: string; codigo: string; descricao: string; unidade: string; quantidade: number; valor_unitario: number; total: number;
    origem_preco: string | null; editado: boolean; ultimo_valor: { valor: number; numero: string | null } | null;
    itens_ls: { codigo: string; titulo: string; quantidade: number; unidade: string; total: number }[];
}
interface PvOm { editavel: boolean; numero: string | null; linhas: LinhaPv[]; total_pv: number; total_ls: number; sem_vinculo: { codigo: string; titulo: string }[] }

/** PV O&M Highline: linhas montadas pelos vínculos, com preço editável e histórico. */
export function PvOmHighlineEditor({ budgetId }: { budgetId: string }) {
    const [pv, setPv] = useState<PvOm | null>(null);
    const [edicao, setEdicao] = useState<Record<string, { quantidade: string; valor_unitario: string }>>({});
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [vinculando, setVinculando] = useState(false);
    const [aberta, setAberta] = useState<string | null>(null);
    const [baixando, setBaixando] = useState(false);
    async function carregar() {
        const r = await authFetch(`/api/budgets/${budgetId}/pv-om`);
        const d = await r.json();
        if (!r.ok) { setErro(d.error || 'Erro ao carregar a PV O&M'); return; }
        setPv(d);
        setEdicao(Object.fromEntries(d.linhas.map((l: LinhaPv) => [l.id, { quantidade: String(l.quantidade), valor_unitario: String(l.valor_unitario) }])));
    }
    useEffect(() => { carregar(); }, [budgetId]);
    if (!pv) return <Card title="PV O&M Highline"><ErrorBanner message={erro} /><p className="text-sm text-muted-foreground">{erro ? '' : 'Carregando…'}</p></Card>;

    const alteradas = pv.linhas.filter(l => Number(edicao[l.id]?.quantidade) !== l.quantidade || Number(edicao[l.id]?.valor_unitario) !== l.valor_unitario);
    const totalTela = pv.linhas.reduce((s, l) => s + (Number(edicao[l.id]?.quantidade) || 0) * (Number(edicao[l.id]?.valor_unitario) || 0), 0);
    const diferenca = Math.round((totalTela - pv.total_ls) * 100) / 100;
    async function salvar() {
        setErro(''); setSalvando(true);
        try {
            const r = await authFetch(`/api/budgets/${budgetId}/pv-om/itens`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itens: alteradas.map(l => ({ id: l.id, quantidade: Number(edicao[l.id].quantidade), valor_unitario: Number(edicao[l.id].valor_unitario) })) }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Erro ao salvar a PV O&M');
            await carregar();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    return (
        <Card title="PV O&M Highline — codificação do cliente" action={
            <div className="flex flex-wrap gap-2">
                {pv.editavel && <button type="button" onClick={() => setVinculando(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60"><Link2 size={14} aria-hidden /> Vincular itens do Orçamento LS</button>}
                {/* Excel no layout de importação da Highline (14/10/2026). Sai o que está salvo. */}
                <button type="button" disabled={!pv.linhas.length || alteradas.length > 0 || baixando}
                    title={alteradas.length ? 'Salve a PV O&M antes de baixar' : 'PV O&M no layout de importação da Highline'}
                    onClick={async () => { setErro(''); setBaixando(true); try { await downloadAuthenticatedFile(`/api/budgets/${budgetId}/pv-om/excel`, 'PV_OM.xlsx'); } catch (e: any) { setErro(e.message); } finally { setBaixando(false); } }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                    <Download size={14} aria-hidden /> {baixando ? 'Gerando…' : 'Baixar PV O&M (Excel)'}</button>
            </div>
        }>
            <ErrorBanner message={erro} />
            {pv.sem_vinculo.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs">
                    <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                    <span><strong>{pv.sem_vinculo.length} item(ns) do Orçamento LS sem código O&M</strong> — ficam fora da PV O&M: {pv.sem_vinculo.slice(0, 4).map(s => s.titulo).join('; ')}{pv.sem_vinculo.length > 4 ? '…' : ''}</span>
                </div>
            )}
            {pv.linhas.length === 0 ? (
                <EmptyState text="A PV O&M nasce dos vínculos: cada item do Orçamento LS aponta para um código O&M da Highline."
                    action={pv.editavel ? <button type="button" onClick={() => setVinculando(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Link2 size={14} aria-hidden /> Vincular itens</button> : undefined} />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[900px] table-fixed text-sm">
                        <colgroup><col className="w-24" /><col /><col className="w-16" /><col className="w-24" /><col className="w-36" /><col className="w-32" /></colgroup>
                        <thead>
                            <tr className="border-b border-border bg-secondary/30 text-left text-xs font-semibold text-muted-foreground">
                                <th className="px-3 py-2.5">Código O&M</th><th className="px-3 py-2.5">Descrição Highline</th><th className="px-3 py-2.5">Unid.</th>
                                <th className="px-3 py-2.5 text-right">Qtd</th><th className="px-3 py-2.5 text-right">Valor unitário</th><th className="px-3 py-2.5 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pv.linhas.map(l => {
                                const e = edicao[l.id] || { quantidade: '', valor_unitario: '' };
                                const total = (Number(e.quantidade) || 0) * (Number(e.valor_unitario) || 0);
                                return (
                                    <tr key={l.id} className="border-b border-border/60 align-top last:border-b-0">
                                        <td className="px-3 py-2 font-id text-xs font-semibold text-primary">{l.codigo}</td>
                                        <td className="px-3 py-2">
                                            <div className="text-sm">{l.descricao}</div>
                                            <button type="button" onClick={() => setAberta(aberta === l.id ? null : l.id)} className="text-[11px] font-semibold text-primary hover:underline">
                                                {l.itens_ls.length} item(ns) do Orçamento LS
                                            </button>
                                            {aberta === l.id && (
                                                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                                    {l.itens_ls.map((i, k) => <li key={k}><span className="font-id">{i.codigo}</span> {i.titulo} — {i.quantidade} {i.unidade} · {fmtMoeda(i.total)}</li>)}
                                                </ul>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-xs">{l.unidade}</td>
                                        <td className="px-2 py-1.5"><input disabled={!pv.editavel} aria-label={`Quantidade ${l.codigo}`} type="number" min={0} step="any" className={`${inputClass} text-right`}
                                            value={e.quantidade} onChange={ev => setEdicao(x => ({ ...x, [l.id]: { ...e, quantidade: ev.target.value } }))} /></td>
                                        <td className="px-2 py-1.5">
                                            <input disabled={!pv.editavel} aria-label={`Valor unitário ${l.codigo}`} type="number" min={0} step="0.01" className={`${inputClass} text-right`}
                                                value={e.valor_unitario} onChange={ev => setEdicao(x => ({ ...x, [l.id]: { ...e, valor_unitario: ev.target.value } }))} />
                                            <div className="mt-0.5 text-right text-[10px] text-muted-foreground" title="De onde veio o preço">{l.origem_preco}</div>
                                            {l.ultimo_valor && Math.abs(l.ultimo_valor.valor - Number(e.valor_unitario)) > 0.001 && pv.editavel && (
                                                <button type="button" onClick={() => setEdicao(x => ({ ...x, [l.id]: { ...e, valor_unitario: String(l.ultimo_valor!.valor) } }))}
                                                    className="block w-full text-right text-[10px] font-semibold text-primary hover:underline">Usar último valor: {fmtMoeda(l.ultimo_valor.valor)}{l.ultimo_valor.numero ? ` (${l.ultimo_valor.numero})` : ''}</button>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoeda(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-border bg-secondary/20">
                                <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold">Total da PV O&M</td>
                                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{fmtMoeda(totalTela)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
            {pv.linhas.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${Math.abs(diferenca) > 0.009 ? 'font-semibold text-warn' : 'text-muted-foreground'}`}>
                        {Math.abs(diferenca) > 0.009
                            ? <><AlertTriangle size={14} aria-hidden /> Orçamento LS: {fmtMoeda(pv.total_ls)} · diferença de {fmtMoeda(diferenca)}</>
                            : <><CheckCircle2 size={14} aria-hidden className="text-ok" /> Fecha com o Orçamento LS ({fmtMoeda(pv.total_ls)})</>}
                    </span>
                    {pv.editavel && (
                        <button type="button" onClick={salvar} disabled={!alteradas.length || salvando}
                            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                            <Save size={14} aria-hidden /> {salvando ? 'Salvando…' : 'Salvar PV O&M'}
                        </button>
                    )}
                </div>
            )}
            {vinculando && <VinculacaoPvOmModal budgetId={budgetId} onFechar={() => setVinculando(false)} onConcluir={() => { setVinculando(false); carregar(); }} />}
        </Card>
    );
}
