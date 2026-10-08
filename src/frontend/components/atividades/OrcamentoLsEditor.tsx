import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Paperclip, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { Card, EmptyState, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento LS — o preço ao cliente montado no modelo da LS, alternativa à PV
// Highline (decisão de 08/10/2026). Os itens podem vir de um orçamento pronto
// (Excel ou PDF): o sistema lê, mostra para conferência e, ao confirmar, eles
// viram os itens deste orçamento. O arquivo original fica guardado.
//
// É um grupo próprio de itens (origem ORCAMENTO_LS), separado do custo da
// Cotação LS e do catálogo da PV — salvar um não apaga o outro.
// ─────────────────────────────────────────────────────────────────────────────

interface Linha {
    chave: string;
    codigo_item: string;
    titulo: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
}
interface ItemLido extends Omit<Linha, 'chave'> { total: number; origem: string; divergente: boolean }
interface Leitura {
    formato: 'EXCEL' | 'PDF';
    itens: ItemLido[];
    soma_itens: number;
    total_documento: number | null;
    avisos: string[];
    arquivo: string;
}
interface Importado { nome: string; nome_original: string; tamanho: number; enviado_em: string }

let seq = 0;
const novaChave = () => `l${++seq}`;
const totalLinha = (l: { quantidade: number; valor_unitario: number }) => Math.round(l.quantidade * l.valor_unitario * 100) / 100;

export default function OrcamentoLsEditor({ budgetId, editavel, onMudou }: {
    budgetId: string;
    /** Só em rascunho; enviado ao cliente, fica de leitura. */
    editavel: boolean;
    onMudou?: () => void;
}) {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [salvas, setSalvas] = useState('');
    const [versao, setVersao] = useState({ versao_atual: 1, updated_at: '' });
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [lendo, setLendo] = useState(false);
    const [leitura, setLeitura] = useState<Leitura | null>(null);
    const [importados, setImportados] = useState<Importado[]>([]);
    const arquivoRef = useRef<HTMLInputElement>(null);

    const carregar = useCallback(async () => {
        const [b, a] = await Promise.all([
            authFetch(`/api/budgets/${budgetId}`).then(r => r.json()),
            authFetch(`/api/budgets/${budgetId}/importados`).then(r => (r.ok ? r.json() : [])),
        ]);
        const itens: Linha[] = (b.items || [])
            .filter((i: any) => i.origem_item === 'ORCAMENTO_LS')
            .map((i: any) => ({ chave: novaChave(), codigo_item: i.codigo_item, titulo: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
        setLinhas(itens);
        setSalvas(JSON.stringify(itens.map(({ chave, ...r }) => r)));
        setVersao({ versao_atual: b.versao_atual, updated_at: b.updated_at });
        setImportados(a);
    }, [budgetId]);
    useEffect(() => { carregar().catch(e => setErro(e.message)).finally(() => setCarregando(false)); }, [carregar]);

    const total = useMemo(() => linhas.reduce((s, l) => s + totalLinha(l), 0), [linhas]);
    const alterado = JSON.stringify(linhas.map(({ chave, ...r }) => r)) !== salvas;

    async function salvar(lista: Linha[] = linhas) {
        setErro('');
        const invalida = lista.find(l => !l.titulo.trim() || !(l.quantidade > 0) || l.valor_unitario < 0);
        if (invalida) { setErro('Todo item precisa de descrição, quantidade maior que zero e valor unitário.'); return false; }
        setSalvando(true);
        try {
            const r = await authFetch(`/api/budgets/${budgetId}/items`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versaoAtual: versao.versao_atual, expectedUpdatedAt: versao.updated_at, scope: 'orcamento_ls',
                    items: lista.map((l, i) => ({
                        codigo_item: l.codigo_item || `LS-${String(i + 1).padStart(3, '0')}`, titulo: l.titulo.trim(), unidade: l.unidade || 'un',
                        quantidade: l.quantidade, valor_unitario: l.valor_unitario, bdi_percent: 0, bloco: 'ORCAMENTO_LS', ordem: i,
                    })),
                }),
            });
            const corpo = await r.json();
            if (!r.ok) throw new Error(corpo.error || 'Erro ao salvar o orçamento');
            await carregar();
            onMudou?.();
            return true;
        } catch (e: any) {
            setErro(e.message);
            return false;
        } finally {
            setSalvando(false);
        }
    }

    async function lerArquivo(arquivo: File) {
        setErro('');
        setLendo(true);
        try {
            const dados = new FormData();
            dados.append('arquivo', arquivo);
            const r = await authFetch(`/api/budgets/${budgetId}/importar`, { method: 'POST', body: dados });
            const corpo = await r.json();
            if (!r.ok) throw new Error(corpo.error || 'Não foi possível ler o arquivo');
            setLeitura(corpo);
            setImportados(await authFetch(`/api/budgets/${budgetId}/importados`).then(x => (x.ok ? x.json() : [])));
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setLendo(false);
        }
    }

    const mudar = (chave: string, campo: keyof Linha, valor: string) => setLinhas(ls => ls.map(l => l.chave !== chave ? l
        : { ...l, [campo]: campo === 'quantidade' || campo === 'valor_unitario' ? Math.max(0, Number(valor.replace(',', '.')) || 0) : valor }));

    if (carregando) return <Card title="Orçamento LS"><p className="text-sm text-muted-foreground">Carregando…</p></Card>;

    return (
        <Card title="Orçamento LS — preço ao cliente" action={
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadAuthenticatedFile(`/api/budgets/${budgetId}/export/excel?grupo=preco_cliente`, 'orcamento-ls.xlsx')}
                    disabled={!linhas.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60 disabled:opacity-40">
                    <Download size={14} aria-hidden /> Baixar Excel
                </button>
                {editavel && (
                    <button type="button" onClick={() => arquivoRef.current?.click()} disabled={lendo}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                        <Upload size={14} aria-hidden /> {lendo ? 'Lendo arquivo…' : 'Importar orçamento (Excel ou PDF)'}
                    </button>
                )}
            </div>
        }>
            <input ref={arquivoRef} type="file" hidden accept=".xlsx,.xls,.xlsm,.pdf"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) lerArquivo(f); }} />
            <ErrorBanner message={erro} />

            {linhas.length === 0 ? (
                <EmptyState text="Nenhum item no Orçamento LS. Importe um orçamento pronto (Excel ou PDF) ou adicione os itens à mão."
                    action={editavel ? <button type="button" onClick={() => setLinhas([{ chave: novaChave(), codigo_item: '', titulo: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }])}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60"><Plus size={14} aria-hidden /> Adicionar item</button> : undefined} />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[820px] table-fixed text-sm">
                        <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-24" /><col className="w-36" /><col className="w-36" /><col className="w-10" /></colgroup>
                        <thead>
                            <tr className="border-b border-border bg-secondary/30 text-left text-xs font-semibold text-muted-foreground">
                                <th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Descrição</th><th className="px-3 py-2.5">Unid.</th>
                                <th className="px-3 py-2.5 text-right">Qtd</th><th className="px-3 py-2.5 text-right">Valor unitário</th><th className="px-3 py-2.5 text-right">Total</th><th />
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map(l => (
                                <tr key={l.chave} className="border-b border-border/60 last:border-b-0">
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Código" className={`${inputClass} font-id text-xs`} value={l.codigo_item} onChange={e => mudar(l.chave, 'codigo_item', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Descrição" className={inputClass} value={l.titulo} onChange={e => mudar(l.chave, 'titulo', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Unidade" className={inputClass} value={l.unidade} onChange={e => mudar(l.chave, 'unidade', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Quantidade" type="number" min={0} step="any" className={`${inputClass} text-right`} value={l.quantidade} onChange={e => mudar(l.chave, 'quantidade', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Valor unitário" type="number" min={0} step="0.01" className={`${inputClass} text-right`} value={l.valor_unitario} onChange={e => mudar(l.chave, 'valor_unitario', e.target.value)} /></td>
                                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtMoeda(totalLinha(l))}</td>
                                    <td className="px-1 py-1.5 text-center">
                                        {editavel && <button type="button" onClick={() => setLinhas(ls => ls.filter(x => x.chave !== l.chave))} aria-label="Remover item" title="Remover item" className="rounded p-1.5 text-muted-foreground hover:bg-crit/10 hover:text-crit"><Trash2 size={14} aria-hidden /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-border bg-secondary/20">
                                <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold">Total do Orçamento LS</td>
                                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{fmtMoeda(total)}</td><td />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {editavel && linhas.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setLinhas(ls => [...ls, { chave: novaChave(), codigo_item: '', titulo: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }])}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60"><Plus size={14} aria-hidden /> Adicionar item</button>
                    <button type="button" onClick={() => salvar()} disabled={!alterado || salvando}
                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                        <Save size={14} aria-hidden /> {salvando ? 'Salvando…' : alterado ? 'Salvar Orçamento LS' : 'Salvo'}
                    </button>
                </div>
            )}

            {importados.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Arquivos importados</p>
                    <ul className="flex flex-col gap-1">
                        {importados.map(a => (
                            <li key={a.nome}>
                                <button type="button" onClick={() => downloadAuthenticatedFile(`/api/budgets/${budgetId}/importados/${encodeURIComponent(a.nome)}`, a.nome_original)}
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                                    <Paperclip size={12} aria-hidden /> {a.nome_original}
                                    <span className="text-muted-foreground">· {new Date(a.enviado_em).toLocaleString('pt-BR')}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {leitura && (
                <RevisaoLeitura leitura={leitura} temItens={linhas.length > 0} salvando={salvando}
                    onFechar={() => setLeitura(null)}
                    onConfirmar={async (itens, modo) => {
                        const novos: Linha[] = itens.map(i => ({ chave: novaChave(), codigo_item: i.codigo_item, titulo: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
                        const lista = modo === 'SUBSTITUIR' ? novos : [...linhas, ...novos];
                        if (await salvar(lista)) setLeitura(null);
                    }} />
            )}
        </Card>
    );
}

/** Conferência do que foi lido: a pessoa ajusta, desmarca o que não é item e confirma. */
function RevisaoLeitura({ leitura, temItens, salvando, onFechar, onConfirmar }: {
    leitura: Leitura;
    temItens: boolean;
    salvando: boolean;
    onFechar: () => void;
    onConfirmar: (itens: ItemLido[], modo: 'SUBSTITUIR' | 'ADICIONAR') => void;
}) {
    const [itens, setItens] = useState(() => leitura.itens.map(i => ({ ...i, incluir: true })));
    const escolhidos = itens.filter(i => i.incluir);
    const soma = escolhidos.reduce((s, i) => s + totalLinha(i), 0);
    const mudar = (idx: number, campo: string, valor: any) => setItens(ls => ls.map((l, i) => (i !== idx ? l : { ...l, [campo]: valor })));

    return (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-revisao" onClick={e => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 id="titulo-revisao" className="flex items-center gap-2 text-base font-bold"><FileSpreadsheet size={18} aria-hidden /> Confira o orçamento lido</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {leitura.formato === 'PDF' ? 'PDF' : 'Excel'} · {leitura.itens.length} item(ns) encontrados. Ajuste o que precisar e desmarque o que não for item.
                        </p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {leitura.avisos.map((a, i) => (
                        <p key={i} className="mb-2 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> {a}
                        </p>
                    ))}
                    {itens.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum item reconhecido no arquivo.</p>
                    ) : (
                        <table className="mt-2 w-full table-fixed text-sm">
                            <colgroup><col className="w-10" /><col /><col className="w-20" /><col className="w-24" /><col className="w-32" /><col className="w-32" /></colgroup>
                            <thead>
                                <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                                    <th className="px-2 py-2" aria-label="Incluir" /><th className="px-2 py-2">Descrição</th><th className="px-2 py-2">Unid.</th>
                                    <th className="px-2 py-2 text-right">Qtd</th><th className="px-2 py-2 text-right">Valor unitário</th><th className="px-2 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itens.map((i, idx) => (
                                    <tr key={idx} className={`border-b border-border/60 ${i.incluir ? '' : 'opacity-40'} ${i.divergente ? 'bg-warn/10' : ''}`}>
                                        <td className="px-2 py-1.5 text-center"><input type="checkbox" aria-label="Incluir item" className="accent-primary" checked={i.incluir} onChange={e => mudar(idx, 'incluir', e.target.checked)} /></td>
                                        <td className="px-2 py-1.5">
                                            <input aria-label="Descrição" className={inputClass} value={i.titulo} onChange={e => mudar(idx, 'titulo', e.target.value)} />
                                            <span className="mt-0.5 block text-[11px] text-muted-foreground">{i.codigo_item ? `${i.codigo_item} · ` : ''}{i.origem}{i.divergente ? ' · total do arquivo diferente de qtd × unitário' : ''}</span>
                                        </td>
                                        <td className="px-2 py-1.5"><input aria-label="Unidade" className={inputClass} value={i.unidade} onChange={e => mudar(idx, 'unidade', e.target.value)} /></td>
                                        <td className="px-2 py-1.5"><input aria-label="Quantidade" type="number" step="any" className={`${inputClass} text-right`} value={i.quantidade} onChange={e => mudar(idx, 'quantidade', Number(e.target.value) || 0)} /></td>
                                        <td className="px-2 py-1.5"><input aria-label="Valor unitário" type="number" step="0.01" className={`${inputClass} text-right`} value={i.valor_unitario} onChange={e => mudar(idx, 'valor_unitario', Number(e.target.value) || 0)} /></td>
                                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtMoeda(totalLinha(i))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <footer className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
                    <div className="text-sm">
                        <strong className="tabular-nums">{escolhidos.length}</strong> item(ns) · <strong className="tabular-nums">{fmtMoeda(soma)}</strong>
                        {leitura.total_documento != null && <span className="ml-2 text-xs text-muted-foreground">total no documento: {fmtMoeda(leitura.total_documento)}</span>}
                    </div>
                    <button type="button" onClick={onFechar} className="ml-auto h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary/60">Cancelar</button>
                    {temItens && (
                        <button type="button" disabled={!escolhidos.length || salvando} onClick={() => onConfirmar(escolhidos, 'ADICIONAR')}
                            className="h-9 rounded-lg border border-primary/60 px-4 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-40">Adicionar aos itens atuais</button>
                    )}
                    <button type="button" disabled={!escolhidos.length || salvando} onClick={() => onConfirmar(escolhidos, 'SUBSTITUIR')}
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                        {salvando ? 'Salvando…' : temItens ? 'Substituir os itens do orçamento' : 'Usar estes itens no orçamento'}
                    </button>
                </footer>
            </div>
        </div>
    );
}
