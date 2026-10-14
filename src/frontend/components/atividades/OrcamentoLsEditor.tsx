import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Library, Link2, Paperclip, Plus, RotateCcw, Save, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react';
import { Card, EmptyState, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { LpuPickerModal, VinculacaoPvOmModal, type ItemDaLpu } from './PvOmHighline';
import { escopoPadrao, gerarPdfOrcamentoLs, gruposDoOrcamento, separarServico, totalItem, type DadosPdfOrcamentoLs } from './gerarPdfOrcamentoLs';

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
    /** Grupo do resumo do investimento (Mobilização, Serviços...). Vazio = sem grupo. Gravado em BudgetItem.bloco. */
    grupo: string;
    titulo: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    /** Item vindo da LPU (14/10/2026): de onde saiu, para a sugestão de vínculo. */
    source_pricebook_item_id?: string | null;
    /** Operação Highline: código O&M da Highline a que o item corresponde na PV O&M. */
    codigo_vinculo?: string | null;
}
/** bloco gravado antes do campo Grupo existir. */
const BLOCO_SEM_GRUPO = ['ORCAMENTO_LS', 'OUTROS'];

/**
 * Código do item gerado pela ordem (12/10/2026): 01, 02… ou, com grupos, 01.1, 01.2,
 * 02.1… (grupo na ordem em que aparece). Código que veio do arquivo importado fica;
 * os automáticos antigos (LS-001) são renumerados.
 */
export function codigosDosItens(linhas: { codigo_item: string; grupo: string }[]) {
    const comGrupo = linhas.some(l => l.grupo.trim());
    const ordemGrupo = new Map<string, number>();
    const contagem = new Map<string, number>();
    return linhas.map((l, i) => {
        const c = l.codigo_item.trim();
        if (c && !/^(LS|ITEM)-\d+$/i.test(c) && !/^\d{2}(\.\d+)?$/.test(c)) return c;
        if (!comGrupo) return String(i + 1).padStart(2, '0');
        const g = l.grupo.trim() || '—';
        if (!ordemGrupo.has(g)) ordemGrupo.set(g, ordemGrupo.size + 1);
        contagem.set(g, (contagem.get(g) || 0) + 1);
        return `${String(ordemGrupo.get(g)).padStart(2, '0')}.${contagem.get(g)}`;
    });
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
const totalLinha = totalItem;

export default function OrcamentoLsEditor({ budgetId, editavel, onMudou, atividade, titulo = 'Orçamento LS — preço ao cliente', grupo = 'ORCAMENTO_LS', vinculoHighline = false }: {
    budgetId: string;
    /** Operação Highline (14/10/2026): cada item vincula a um código O&M; o PDF pede o vínculo antes. */
    vinculoHighline?: boolean;
    /** Grupo de itens que este editor mostra e grava: Orçamento LS ou a PV da sharing (13/10/2026). */
    grupo?: 'ORCAMENTO_LS' | 'PV_CLIENTE';
    /** "PV Sites — preço ao cliente" nas atividades fora da Highline (13/10/2026). */
    titulo?: string;
    /** Dados do site e do cliente que vão no PDF. */
    atividade?: AtividadeDetalhe;
    /** Só em rascunho; enviado ao cliente, fica de leitura. */
    editavel: boolean;
    onMudou?: () => void;
}) {
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [salvas, setSalvas] = useState('');
    const [linhasSalvas, setLinhasSalvas] = useState<Linha[]>([]);
    const [versao, setVersao] = useState({ versao_atual: 1, updated_at: '' });
    const [meta, setMeta] = useState({ assunto: '', vigencia_dias: 30, numero: '' });
    const [gerandoPdf, setGerandoPdf] = useState(false);
    const [escolhendoLpu, setEscolhendoLpu] = useState(false);
    const [vinculando, setVinculando] = useState<null | 'avulso' | 'pdf'>(null);
    // Agente de IA (14/10/2026): revisa as descrições e escreve a partir dos comentários.
    const [ia, setIa] = useState<{ disponivel: boolean; modelo: string } | null>(null);
    const [revisando, setRevisando] = useState(false);
    const [revisao, setRevisao] = useState<RevisaoIa | null>(null);
    const [descrevendo, setDescrevendo] = useState<Linha | null>(null);
    useEffect(() => { fetch('/api/ia/status').then(r => (r.ok ? r.json() : null)).then(setIa).catch(() => setIa(null)); }, []);
    const contextoIa = { tipo_site: atividade?.tipo_obra || null, sharing: atividade?.sharing || null, tipo_demanda: atividade?.tipo_demanda || null, escopo: meta.assunto || atividade?.titulo || null };

    async function revisarComIa() {
        setErro(''); setRevisando(true);
        try {
            const itens = linhas.map((l, indice) => {
                const [servico, descricao] = separarServico(l.titulo);
                return { indice, codigo: l.codigo_item, servico, descricao, unidade: l.unidade, quantidade: l.quantidade };
            });
            const r = await authFetch('/api/ia/orcamento/revisar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ budget_id: budgetId, itens, contexto: contextoIa }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Erro ao revisar com a IA');
            // A revisão aponta para as linhas pela chave, para não errar se a lista mudar.
            setRevisao({ ...d, chaves: linhas.map(l => l.chave) });
        } catch (e: any) { setErro(e.message); } finally { setRevisando(false); }
    }

    /** Aplica uma sugestão na linha (serviço e descrição vivem juntos no título). */
    function aplicarSugestao(chave: string, campo: string, texto: string) {
        setLinhas(ls => ls.map(l => {
            if (l.chave !== chave) return l;
            if (campo === 'unidade') return { ...l, unidade: texto };
            const [servico, descricao] = separarServico(l.titulo);
            const novoServico = campo === 'servico' ? texto : servico;
            const novaDescricao = campo === 'descricao' ? texto : descricao;
            return { ...l, titulo: novaDescricao ? `${novoServico} — ${novaDescricao}` : novoServico };
        }));
    }
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
            .filter((i: any) => i.origem_item === grupo)
            .map((i: any) => ({ chave: novaChave(), codigo_item: i.codigo_item, grupo: BLOCO_SEM_GRUPO.includes(i.bloco) ? '' : (i.bloco || ''), titulo: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, source_pricebook_item_id: i.source_pricebook_item_id || null, codigo_vinculo: i.codigo_vinculo || null }));
        setLinhas(itens);
        setLinhasSalvas(itens);
        setSalvas(JSON.stringify(itens.map(({ chave, ...r }) => r)));
        setVersao({ versao_atual: b.versao_atual, updated_at: b.updated_at });
        setMeta({ assunto: b.assunto || '', vigencia_dias: b.vigencia_dias || 30, numero: b.numero || '' });
        setImportados(a);
    }, [budgetId, grupo]);
    useEffect(() => { carregar().catch(e => setErro(e.message)).finally(() => setCarregando(false)); }, [carregar]);

    const total = useMemo(() => linhas.reduce((s, l) => s + totalLinha(l), 0), [linhas]);
    const codigosTela = useMemo(() => codigosDosItens(linhas), [linhas]);
    const alterado = JSON.stringify(linhas.map(({ chave, ...r }) => r)) !== salvas;

    async function salvar(lista: Linha[] = linhas) {
        setErro('');
        const invalida = lista.find(l => !l.titulo.trim() || !(l.quantidade > 0) || l.valor_unitario < 0);
        if (invalida) { setErro('Todo item precisa de descrição, quantidade maior que zero e valor unitário.'); return false; }
        setSalvando(true);
        const codigos = codigosDosItens(lista);
        try {
            const r = await authFetch(`/api/budgets/${budgetId}/items`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versaoAtual: versao.versao_atual, expectedUpdatedAt: versao.updated_at, scope: grupo === 'PV_CLIENTE' ? 'pv_cliente' : 'orcamento_ls',
                    items: lista.map((l, i) => ({
                        codigo_item: codigos[i], titulo: l.titulo.trim(), unidade: l.unidade || 'un',
                        quantidade: l.quantidade, valor_unitario: l.valor_unitario, bdi_percent: 0, bloco: l.grupo.trim() || 'ORCAMENTO_LS', ordem: i,
                        source_pricebook_item_id: l.source_pricebook_item_id || null, codigo_vinculo: l.codigo_vinculo || null,
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

    function descartar() {
        setErro('');
        setLinhas(linhasSalvas.map(l => ({ ...l })));
    }

    async function excluirTodos() {
        if (!confirm(`Excluir os ${linhasSalvas.length || linhas.length} item(ns) deste orçamento? O total do orçamento volta a zero. Os arquivos importados continuam guardados.`)) return;
        await salvar([]);
    }

    async function excluirArquivo(a: Importado) {
        if (!confirm(`Excluir o arquivo "${a.nome_original}"? Os itens já usados no orçamento continuam.`)) return;
        setErro('');
        const r = await authFetch(`/api/budgets/${budgetId}/importados/${encodeURIComponent(a.nome)}`, { method: 'DELETE' });
        if (!r.ok) { setErro((await r.json().catch(() => ({}))).error || 'Erro ao excluir o arquivo'); return; }
        setImportados(lista => lista.filter(x => x.nome !== a.nome));
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

    /** Itens escolhidos na LPU viram linhas: categoria como grupo, preço de venda da LPU. */
    function adicionarDaLpu(itens: ItemDaLpu[]) {
        setLinhas(ls => [...ls, ...itens.map(i => ({
            chave: novaChave(), codigo_item: '', grupo: i.subtipo || '',
            titulo: i.detalhamento && i.detalhamento.trim() && i.detalhamento.trim() !== i.descricao.trim() ? `${i.descricao} — ${i.detalhamento}` : i.descricao,
            unidade: i.unidade || 'un', quantidade: 1, valor_unitario: i.valor_venda || 0, source_pricebook_item_id: i.id, codigo_vinculo: null,
        }))]);
        setEscolhendoLpu(false);
    }
    const semVinculo = linhasSalvas.filter(l => !l.codigo_vinculo).length;
    /** Operação Highline: antes do PDF, os itens sem código O&M passam pela vinculação. */
    function pedirPdf() {
        if (vinculoHighline && editavel && semVinculo > 0) { setVinculando('pdf'); return; }
        setGerandoPdf(true);
    }

    const mudar = (chave: string, campo: keyof Linha, valor: string) => setLinhas(ls => ls.map(l => l.chave !== chave ? l
        : { ...l, [campo]: campo === 'quantidade' || campo === 'valor_unitario' ? Math.max(0, Number(valor.replace(',', '.')) || 0) : valor }));

    if (carregando) return <Card title={titulo}><p className="text-sm text-muted-foreground">Carregando…</p></Card>;

    return (
        <Card title={titulo} action={
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadAuthenticatedFile(`/api/budgets/${budgetId}/export/excel?grupo=preco_cliente`, 'orcamento-ls.xlsx')}
                    disabled={!linhas.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60 disabled:opacity-40">
                    <Download size={14} aria-hidden /> Baixar Excel
                </button>
                {editavel && (
                    <button type="button" onClick={revisarComIa} disabled={!ia?.disponivel || !linhas.length || revisando}
                        title={!ia?.disponivel ? 'IA ainda não configurada: falta a chave da API no servidor' : 'A IA lê as descrições e sugere correções e melhorias'}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 text-xs font-semibold text-violet-400 hover:bg-violet-500/10 disabled:opacity-40">
                        <Sparkles size={14} aria-hidden /> {revisando ? 'Revisando…' : 'Revisar com IA'}
                    </button>
                )}
                {vinculoHighline && editavel && (
                    <button type="button" onClick={() => setVinculando('avulso')} disabled={!linhasSalvas.length || alterado}
                        title={alterado ? 'Salve as alterações antes de vincular' : 'Ligar cada item a um código O&M da Highline (PV O&M)'}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60 disabled:opacity-40">
                        <Link2 size={14} aria-hidden /> Vincular à PV O&M{semVinculo ? ` (${semVinculo} sem código)` : ''}
                    </button>
                )}
                <button type="button" onClick={pedirPdf} disabled={!linhasSalvas.length || alterado}
                    title={alterado ? 'Salve as alterações antes de gerar o PDF' : 'Orçamento no modelo executivo da LS'}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60 disabled:opacity-40">
                    <FileText size={14} aria-hidden /> Gerar PDF
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
            <p className="mb-3 text-xs text-muted-foreground">
                Número do orçamento: {meta.numero
                    ? <span className="font-id font-semibold text-foreground">{meta.numero}</span>
                    : 'gerado pelo sistema no primeiro PDF ou ao abrir a negociação'} · Rev. {String(versao.versao_atual).padStart(2, '0')}
            </p>

            {linhas.length === 0 ? (
                <EmptyState text="Nenhum item ainda. Importe um orçamento pronto (Excel ou PDF) ou adicione os itens à mão."
                    action={editavel ? <div className="flex flex-wrap justify-center gap-2">
                        {atividade && <button type="button" onClick={() => setEscolhendoLpu(true)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Library size={14} aria-hidden /> Adicionar da LPU</button>}
                        <button type="button" onClick={() => setLinhas([{ chave: novaChave(), codigo_item: '', grupo: '', titulo: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }])}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60"><Plus size={14} aria-hidden /> Adicionar item</button></div> : undefined} />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[980px] table-fixed text-sm">
                        <colgroup><col className="w-28" /><col className="w-40" /><col /><col className="w-20" /><col className="w-24" /><col className="w-36" /><col className="w-36" /><col className={editavel ? 'w-20' : 'w-10'} /></colgroup>
                        <thead>
                            <tr className="border-b border-border bg-secondary/30 text-left text-xs font-semibold text-muted-foreground">
                                <th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5" title="Agrupa os itens no resumo do PDF">Grupo</th><th className="px-3 py-2.5">Descrição</th><th className="px-3 py-2.5">Unid.</th>
                                <th className="px-3 py-2.5 text-right">Qtd</th><th className="px-3 py-2.5 text-right">Valor unitário</th><th className="px-3 py-2.5 text-right">Total</th><th />
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map((l, idx) => (
                                <tr key={l.chave} className="border-b border-border/60 last:border-b-0">
                                    <td className="px-3 py-1.5 font-id text-xs text-muted-foreground" title="Gerado pela ordem dos itens">{codigosTela[idx]}</td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Grupo" list={`grupos-${budgetId}`} placeholder="Sem grupo" className={inputClass} value={l.grupo} onChange={e => mudar(l.chave, 'grupo', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Descrição" className={inputClass} value={l.titulo} onChange={e => mudar(l.chave, 'titulo', e.target.value)} />
                                        {vinculoHighline && <div className={`mt-0.5 flex items-center gap-1 text-[10px] ${l.codigo_vinculo ? 'text-muted-foreground' : 'text-warn'}`}><Link2 size={10} aria-hidden />{l.codigo_vinculo ? `PV O&M: ${l.codigo_vinculo}` : 'sem código O&M'}</div>}</td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Unidade" className={inputClass} value={l.unidade} onChange={e => mudar(l.chave, 'unidade', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Quantidade" type="number" min={0} step="any" className={`${inputClass} text-right`} value={l.quantidade} onChange={e => mudar(l.chave, 'quantidade', e.target.value)} /></td>
                                    <td className="px-2 py-1.5"><input disabled={!editavel} aria-label="Valor unitário" type="number" min={0} step="0.01" className={`${inputClass} text-right`} value={l.valor_unitario} onChange={e => mudar(l.chave, 'valor_unitario', e.target.value)} /></td>
                                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtMoeda(totalLinha(l))}</td>
                                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
                                        {editavel && <button type="button" onClick={() => setDescrevendo(l)} disabled={!ia?.disponivel} aria-label="Escrever a descrição com IA"
                                            title={ia?.disponivel ? 'Escrever a descrição com IA a partir dos seus comentários' : 'IA ainda não configurada: falta a chave da API no servidor'}
                                            className="mr-1 rounded-md border border-border p-1.5 text-violet-400 hover:border-violet-500/50 hover:bg-violet-500/10 disabled:opacity-40"><Wand2 size={14} aria-hidden /></button>}
                                        {editavel && <button type="button" onClick={() => setLinhas(ls => ls.filter(x => x.chave !== l.chave))} aria-label="Remover item" title="Remover item" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-crit/50 hover:bg-crit/10 hover:text-crit"><Trash2 size={14} aria-hidden /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-border bg-secondary/20">
                                <td colSpan={6} className="px-3 py-2.5 text-right text-sm font-semibold">Total</td>
                                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{fmtMoeda(total)}</td><td />
                            </tr>
                        </tfoot>
                    </table>
                    <datalist id={`grupos-${budgetId}`}>
                        {[...new Set([...linhas.map(l => l.grupo.trim()).filter(Boolean), 'Mobilização', 'Serviços', 'Infra elétrica - fornecimento e instalação'])].map(g => <option key={g} value={g} />)}
                    </datalist>
                </div>
            )}

            {editavel && (linhas.length > 0 || linhasSalvas.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setLinhas(ls => [...ls, { chave: novaChave(), codigo_item: '', grupo: '', titulo: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }])}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60"><Plus size={14} aria-hidden /> Adicionar item</button>
                    {atividade && (
                        <button type="button" onClick={() => setEscolhendoLpu(true)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60"><Library size={14} aria-hidden /> Adicionar da LPU</button>
                    )}
                    {linhasSalvas.length > 0 && (
                        <button type="button" onClick={excluirTodos} disabled={salvando}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-crit/40 px-3 text-sm font-semibold text-crit hover:bg-crit/10 disabled:opacity-40">
                            <Trash2 size={14} aria-hidden /> Excluir todos os itens
                        </button>
                    )}
                    {/* Estado de gravação sempre dito em texto: "Salvo" apagado parecia botão quebrado. */}
                    <span className={`ml-auto inline-flex items-center gap-1.5 text-xs ${alterado ? 'font-semibold text-warn' : 'text-muted-foreground'}`}>
                        {alterado ? <><AlertTriangle size={14} aria-hidden /> Alterações não salvas</> : <><CheckCircle2 size={14} aria-hidden className="text-ok" /> Tudo salvo</>}
                    </span>
                    {alterado && (
                        <button type="button" onClick={descartar} disabled={salvando}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60 disabled:opacity-40">
                            <RotateCcw size={14} aria-hidden /> Descartar alterações
                        </button>
                    )}
                    <button type="button" onClick={() => salvar()} disabled={!alterado || salvando}
                        title={alterado ? 'Gravar as alterações' : 'Nada mudou desde o último salvamento'}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
                        <Save size={14} aria-hidden /> {salvando ? 'Salvando…' : 'Salvar alterações'}
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
                                {editavel && (
                                    <button type="button" onClick={() => excluirArquivo(a)} aria-label={`Excluir o arquivo ${a.nome_original}`} title="Excluir arquivo"
                                        className="ml-2 inline-flex rounded p-1 align-middle text-muted-foreground hover:bg-crit/10 hover:text-crit"><Trash2 size={12} aria-hidden /></button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {revisao && (
                <RevisaoIaModal revisao={revisao} linhas={linhas} onAplicar={aplicarSugestao} onFechar={() => setRevisao(null)} modelo={ia?.modelo} />
            )}
            {descrevendo && (
                <DescreverIaModal linha={descrevendo} contexto={contextoIa} budgetId={budgetId}
                    onUsar={(servico, descricao, unidade) => {
                        const chave = descrevendo.chave;
                        setLinhas(ls => ls.map(l => (l.chave !== chave ? l : { ...l, titulo: descricao ? `${servico} — ${descricao}` : servico, unidade: unidade || l.unidade })));
                        setDescrevendo(null);
                    }}
                    onFechar={() => setDescrevendo(null)} />
            )}

            {escolhendoLpu && atividade && <LpuPickerModal atividadeId={atividade.id} onAdicionar={adicionarDaLpu} onFechar={() => setEscolhendoLpu(false)} />}
            {vinculando && (
                <VinculacaoPvOmModal budgetId={budgetId}
                    aviso={vinculando === 'pdf' ? `Antes do PDF: ${semVinculo} item(ns) ainda sem código O&M. Na operação Highline vão os dois orçamentos — o Orçamento LS e a PV O&M.` : undefined}
                    textoConcluir={vinculando === 'pdf' ? 'Salvar e gerar o PDF' : 'Salvar vínculos'}
                    onFechar={() => setVinculando(null)}
                    onConcluir={async () => { const depois = vinculando === 'pdf'; setVinculando(null); await carregar(); onMudou?.(); if (depois) setGerandoPdf(true); }} />
            )}
            {gerandoPdf && (
                <ModalPdf budgetId={budgetId} atividade={atividade} meta={meta} revisao={versao.versao_atual}
                    itens={linhasSalvas} onFechar={() => setGerandoPdf(false)} onNumero={n => setMeta(m => ({ ...m, numero: n }))} />
            )}

            {leitura && (
                <RevisaoLeitura leitura={leitura} temItens={linhas.length > 0} salvando={salvando}
                    onFechar={() => setLeitura(null)}
                    onConfirmar={async (itens, modo) => {
                        const novos: Linha[] = itens.map(i => ({ chave: novaChave(), codigo_item: i.codigo_item, grupo: i.grupo || '', titulo: i.titulo, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
                        const lista = modo === 'SUBSTITUIR' ? novos : [...linhas, ...novos];
                        if (await salvar(lista)) setLeitura(null);
                    }} />
            )}
        </Card>
    );
}

interface SugestaoIa { indice: number; campo: 'servico' | 'descricao' | 'unidade'; atual: string; sugerido: string; motivo: string; tipo: string }
interface RevisaoIa { sugestoes: SugestaoIa[]; observacoes: string[]; chaves: string[] }
const CAMPO_IA: Record<string, string> = { servico: 'Serviço', descricao: 'Descrição', unidade: 'Unidade' };
const TIPO_IA: Record<string, string> = { ortografia: 'Português', clareza: 'Clareza', unidade: 'Unidade', padrao: 'Padrão LS' };

/** Sugestões da IA, item a item: aceitar ou ignorar. Nada muda sem aceitar; depois, salvar. */
function RevisaoIaModal({ revisao, linhas, onAplicar, onFechar, modelo }: {
    revisao: RevisaoIa; linhas: Linha[]; onAplicar: (chave: string, campo: string, texto: string) => void; onFechar: () => void; modelo?: string;
}) {
    const [decididas, setDecididas] = useState<Record<number, 'aceita' | 'ignorada'>>({});
    const pendentes = revisao.sugestoes.map((s, i) => ({ s, i })).filter(({ i }) => !decididas[i]);
    const aceitar = (s: SugestaoIa, i: number) => { const chave = revisao.chaves[s.indice]; if (chave) onAplicar(chave, s.campo, s.sugerido); setDecididas(d => ({ ...d, [i]: 'aceita' })); };
    const aceitas = Object.values(decididas).filter(v => v === 'aceita').length;
    return (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-ia" onClick={e => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 id="titulo-ia" className="flex items-center gap-2 text-base font-bold"><Sparkles size={18} aria-hidden className="text-violet-400" /> Revisão com IA</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{revisao.sugestoes.length} sugestão(ões){modelo ? ` · ${modelo}` : ''}. Aceite o que fizer sentido; depois salve o orçamento.</p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    {revisao.observacoes.length > 0 && (
                        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-4 py-3 text-xs">
                            <p className="mb-1 font-semibold text-violet-400">Sobre o orçamento como um todo</p>
                            <ul className="list-disc space-y-0.5 pl-4">{revisao.observacoes.map((o, i) => <li key={i}>{o}</li>)}</ul>
                        </div>
                    )}
                    {!revisao.sugestoes.length && <p className="text-sm text-ok">Nenhuma correção sugerida: os itens já estão claros e no padrão.</p>}
                    {revisao.sugestoes.map((s, i) => {
                        const linha = linhas.find(l => l.chave === revisao.chaves[s.indice]);
                        const decisao = decididas[i];
                        return (
                            <div key={i} className={`rounded-lg border px-4 py-3 ${decisao ? 'border-border opacity-60' : 'border-border'}`}>
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-id text-muted-foreground">Item {s.indice + 1}{linha?.codigo_item ? ` · ${linha.codigo_item}` : ''}</span>
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{CAMPO_IA[s.campo]}</span>
                                    <span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-400">{TIPO_IA[s.tipo] || s.tipo}</span>
                                    <span className="text-muted-foreground">{s.motivo}</span>
                                </div>
                                <div className="grid gap-2 text-sm sm:grid-cols-2">
                                    <div><p className="text-[11px] text-muted-foreground">Atual</p><p className={s.atual ? 'line-through decoration-crit/60' : 'italic text-muted-foreground'}>{s.atual || 'vazio'}</p></div>
                                    <div><p className="text-[11px] text-muted-foreground">Sugerido</p><p className="font-medium">{s.sugerido}</p></div>
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                    {decisao ? <span className="text-xs font-semibold text-muted-foreground">{decisao === 'aceita' ? 'Aceita' : 'Ignorada'}</span> : (<>
                                        <button type="button" onClick={() => setDecididas(d => ({ ...d, [i]: 'ignorada' }))} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">Ignorar</button>
                                        <button type="button" onClick={() => aceitar(s, i)} className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Aceitar</button>
                                    </>)}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                    <span className="text-xs text-muted-foreground">{aceitas ? `${aceitas} aceita(s) — feche e clique em Salvar alterações` : 'A IA pode errar: confira antes de aceitar.'}</span>
                    <div className="flex gap-2">
                        {pendentes.length > 1 && <button type="button" onClick={() => pendentes.forEach(({ s, i }) => aceitar(s, i))} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60">Aceitar todas ({pendentes.length})</button>}
                        <button type="button" onClick={onFechar} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Concluir</button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

/** Descrição a partir dos comentários de quem orça. */
function DescreverIaModal({ linha, contexto, budgetId, onUsar, onFechar }: {
    linha: Linha; contexto: Record<string, unknown>; budgetId: string;
    onUsar: (servico: string, descricao: string, unidade: string) => void; onFechar: () => void;
}) {
    const [servicoAtual, descricaoAtual] = separarServico(linha.titulo);
    const [comentario, setComentario] = useState(descricaoAtual || servicoAtual || '');
    const [resultado, setResultado] = useState<{ servico: string; descricao: string; unidade: string } | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    async function gerar() {
        setErro(''); setCarregando(true);
        try {
            const r = await authFetch('/api/ia/orcamento/descrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ budget_id: budgetId, comentario, servico: servicoAtual, unidade: linha.unidade, contexto }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Erro ao gerar a descrição');
            setResultado(d);
        } catch (e: any) { setErro(e.message); } finally { setCarregando(false); }
    }
    return (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-ia-desc" onClick={e => e.stopPropagation()}
                className="w-full max-w-xl rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 id="titulo-ia-desc" className="flex items-center gap-2 text-base font-bold"><Wand2 size={18} aria-hidden className="text-violet-400" /> Escrever com IA</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">Conte do seu jeito o que será feito: medidas, materiais, local. A IA escreve no padrão da LS.</p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>
                <div className="space-y-3 px-5 py-4">
                    <ErrorBanner message={erro} />
                    <textarea rows={4} className={inputClass} value={comentario} onChange={e => setComentario(e.target.value)}
                        placeholder="Ex.: radier 3x3, concreto 25 MPa, base dos equipamentos, conforme projeto" />
                    {resultado && (
                        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
                            <p className="text-[11px] text-muted-foreground">Serviço</p><p className="font-semibold">{resultado.servico}</p>
                            <p className="mt-2 text-[11px] text-muted-foreground">Descrição</p><p>{resultado.descricao}</p>
                            {resultado.unidade && <><p className="mt-2 text-[11px] text-muted-foreground">Unidade sugerida</p><p>{resultado.unidade}</p></>}
                        </div>
                    )}
                </div>
                <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <button type="button" onClick={gerar} disabled={carregando || comentario.trim().length < 3}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 text-sm font-semibold text-violet-400 hover:bg-violet-500/10 disabled:opacity-40">
                        <Sparkles size={14} aria-hidden /> {carregando ? 'Escrevendo…' : resultado ? 'Gerar de novo' : 'Gerar descrição'}
                    </button>
                    <button type="button" disabled={!resultado} onClick={() => resultado && onUsar(resultado.servico, resultado.descricao, resultado.unidade)}
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Usar este texto</button>
                </footer>
            </div>
        </div>
    );
}

/**
 * Campos do PDF que o sistema não tem: número, condições comerciais. Ficam
 * lembrados neste navegador por orçamento, para a próxima revisão sair igual.
 */
function ModalPdf({ budgetId, atividade, meta, revisao, itens, onFechar, onNumero }: {
    budgetId: string;
    atividade?: AtividadeDetalhe;
    meta: { assunto: string; vigencia_dias: number; numero: string };
    revisao: number;
    itens: Linha[];
    onFechar: () => void;
    onNumero: (numero: string) => void;
}) {
    const chaveStorage = `ls_orcamento_pdf_${budgetId}`;
    const [f, setF] = useState(() => {
        const base = {
            escopo: meta.assunto || atividade?.descricao || atividade?.titulo || '',
            responsavel: '', pagamento: '', prazo_execucao: '', validade_dias: meta.vigencia_dias,
            escopos: {} as Record<string, string>,
        };
        try { return { ...base, ...JSON.parse(localStorage.getItem(chaveStorage) || '{}') }; } catch { return base; }
    });
    const [erro, setErro] = useState('');
    const grupos = useMemo(() => gruposDoOrcamento(itens.map(({ chave, ...i }) => i)), [itens]);
    const mudar = (campo: string) => (e: { target: { value: string } }) => setF((x: typeof f) => ({ ...x, [campo]: e.target.value }));

    const [gerando, setGerando] = useState(false);
    async function gerar() {
        try { localStorage.setItem(chaveStorage, JSON.stringify(f)); } catch { /* sem storage: só não lembra */ }
        // Número gerado pelo sistema na primeira vez; nas seguintes volta o mesmo.
        setGerando(true); setErro('');
        let numero = meta.numero;
        try {
            const r = await authFetch(`/api/budgets/${budgetId}/numero`, { method: 'POST' });
            const corpo = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(corpo.error || 'Erro ao gerar o número do orçamento');
            numero = corpo.numero;
            if (numero !== meta.numero) onNumero(numero);
        } catch (e: any) { setErro(e.message); setGerando(false); return; }
        const local = [atividade?.municipio, atividade?.estado].filter(Boolean).join('-');
        const dados: DadosPdfOrcamentoLs = {
            numero, escopo: f.escopo,
            contratante: atividade?.sharing || atividade?.contratante?.nome || '',
            site: atividade?.id_site_sharing || atividade?.codigo || '',
            local,
            acionamento: atividade?.data_abertura ? new Date(atividade.data_abertura).toLocaleDateString('pt-BR') : '',
            revisao,
            responsavel: f.responsavel, pagamento: f.pagamento, prazo_execucao: f.prazo_execucao,
            validade_dias: Number(f.validade_dias) || meta.vigencia_dias,
            itens: itens.map(({ chave, ...i }) => i),
            escopos: f.escopos || {},
        };
        try { gerarPdfOrcamentoLs(dados); onFechar(); } catch (e: any) { setErro(e.message || 'Erro ao gerar o PDF'); } finally { setGerando(false); }
    }

    const campo = (rotulo: string, nome: string, extra?: { placeholder?: string; tipo?: string; largo?: boolean }) => (
        <label className={`block ${extra?.largo ? 'sm:col-span-2' : ''}`}>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</span>
            <input type={extra?.tipo || 'text'} value={(f as any)[nome]} onChange={mudar(nome)} placeholder={extra?.placeholder || 'A definir'} className={inputClass} />
        </label>
    );

    return (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-pdf-ls" onClick={e => e.stopPropagation()}
                className="flex max-h-[94vh] w-full max-w-xl flex-col rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 id="titulo-pdf-ls" className="flex items-center gap-2 text-base font-bold"><FileText size={18} aria-hidden /> Gerar orçamento em PDF</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Modelo executivo da LS · {atividade?.id_site_sharing || 'site'} · Rev. {String(revisao).padStart(2, '0')} · {itens.length} item(ns). Campo vazio sai como "A definir".
                        </p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>
                <div className="grid flex-1 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
                    <div className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Número do orçamento</span>
                        <p className={`flex h-[38px] items-center rounded-lg border border-border bg-secondary/30 px-3 text-sm ${meta.numero ? 'font-id font-semibold' : 'text-muted-foreground'}`}>
                            {meta.numero || 'Gerado ao confirmar'}
                        </p>
                    </div>
                    {campo('Validade (dias)', 'validade_dias', { tipo: 'number' })}
                    {campo('Escopo (título do orçamento)', 'escopo', { placeholder: 'Ex.: Remanejamento RF, civil e elétrica', largo: true })}
                    {campo('Responsável LS Office', 'responsavel')}
                    {campo('Pagamento', 'pagamento', { placeholder: 'Ex.: 30 dias após medição' })}
                    {campo('Prazo de execução', 'prazo_execucao', { placeholder: 'Ex.: 20 dias corridos', largo: true })}
                    <div className="sm:col-span-2 border-t border-border pt-3">
                        <p className="text-xs font-semibold">Resumo do investimento</p>
                        {(
                            <div className="mt-2 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    A página 1 mostra só a soma de cada grupo; o detalhe linha por linha vai na página 2. Escreva o escopo ou um comentário de cada grupo.
                                    {grupos.length === 1 && grupos[0].nome === 'Serviços' && ' Para separar em grupos, preencha a coluna Grupo no editor.'}
                                </p>
                                {grupos.map(g => (
                                    <label key={g.nome} className="block">
                                        <span className="mb-1 flex justify-between text-xs font-medium text-muted-foreground"><span>{g.nome}</span><span className="tabular-nums">{fmtMoeda(g.valor)}</span></span>
                                        <textarea rows={2} className={inputClass} value={f.escopos?.[g.nome] || ''} placeholder={escopoPadrao(g.itens)}
                                            onChange={e => setF((x: typeof f) => ({ ...x, escopos: { ...(x.escopos || {}), [g.nome]: e.target.value } }))} />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {erro && <div className="px-5"><ErrorBanner message={erro} /></div>}
                <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <button type="button" onClick={onFechar} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60">Cancelar</button>
                    <button type="button" onClick={gerar} disabled={gerando}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        <FileText size={14} aria-hidden /> {gerando ? 'Gerando…' : 'Gerar PDF'}
                    </button>
                </footer>
            </div>
        </div>
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
