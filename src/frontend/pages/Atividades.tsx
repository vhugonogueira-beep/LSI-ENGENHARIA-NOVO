import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, LayoutGrid, List as ListIcon, Paperclip, FolderPlus, Trash2, AlertTriangle } from 'lucide-react';
import {
    STATUS_OPERACIONAL, TIPOS_DEMANDA, TIPOS_DEMANDA_LABEL, SUBTIPOS_OPERACAO, SUBTIPOS_OPERACAO_LABEL,
    TIPOS_OBRA, TIPOS_SITE_HIGHLINE, UFS, normalizarUf, SHARINGS, OPERADORAS, OPERADORA_COLOR, MODELO_OPERACAO_LABEL, modeloOperacaoPadrao, modelosPermitidos,
    REGIOES, REGIAO_LABEL, regiaoPorUf, fmtMoeda, StatusPill,
} from '../components/atividades/constants';
import AtividadeCockpit from '../components/atividades/AtividadeCockpit';
import MunicipioInput from '../components/cadastros/MunicipioInput';
import { useEhAdmin } from '../lib/permissoes';

interface Atividade {
    id: string;
    codigo: string;
    titulo: string;
    tipo_demanda: string;
    subtipo_demanda?: string | null;
    tipo_obra?: string | null;
    tipo_site_highline?: string | null;
    modelo_operacao: string;
    sharing: string;
    operadora?: string | null;
    estado?: string | null;
    municipio?: string | null;
    status_operacional: string;
    status_comercial: string;
    valor_contrato?: number | null;
    id_site_sharing?: string | null;
    id_site_operadora?: string | null;
    responsavel?: string | null;
    gestor?: string | null;
    acionamento_id?: string | null;
    data_fim_planejada?: string | null;
    // Campos da "Carteira" (GET /api/atividades/carteira) — Blueprint LSI
    fornecedor_principal?: string | null;
    po?: { id: string; numero?: string | null; status: string } | null;
    avanco_percentual?: number;
    custo_pago?: number;
    saldo?: number;
    status_documental: string;
    documentos_total?: number;
    documentos_ok?: number;
    documentos_pendentes?: number;
    documentos_correcao?: number;
    documentos_percentual?: number;
    comprovantes_pendentes?: number;
}

const FORM_INIT = {
    titulo: '', tipo_demanda: 'IMPLANTACAO', subtipo_demanda: '', tipo_obra: '', tipo_site_highline: '', tipo_atividade: '',
    modelo_operacao: modeloOperacaoPadrao('IMPLANTACAO'), sharing: 'HIGHLINE', operadora: 'VIVO', contrato: '',
    estado: '', municipio: '', id_site_sharing: '', id_site_operadora: '', valor_contrato: '', valor_orcado: '',
    responsavel: '', descricao: '',
};

const KANBAN_ORDEM = ['PLANEJAMENTO', 'AGUARDANDO_LIBERACAO', 'EM_EXECUCAO', 'CONCLUIDA', 'ON_HOLD'];

// Recortes rápidos da carteira. "Em aberto" é tudo que ainda não terminou,
// inclusive o que está em ON_HOLD — obra parada continua sendo compromisso.
const hojeISO = () => new Date().toISOString().slice(0, 10);
const atrasada = (a: Atividade) => Boolean(a.data_fim_planejada) && a.status_operacional !== 'CONCLUIDA'
    && String(a.data_fim_planejada).slice(0, 10) < hojeISO();
const SITUACOES: { id: string; label: string; teste: (a: Atividade) => boolean }[] = [
    { id: 'TODAS', label: 'Todas', teste: () => true },
    { id: 'ABERTAS', label: 'Em aberto', teste: a => a.status_operacional !== 'CONCLUIDA' },
    { id: 'EM_EXECUCAO', label: 'Em execução', teste: a => a.status_operacional === 'EM_EXECUCAO' },
    { id: 'ATRASADAS', label: 'Atrasadas', teste: atrasada },
    { id: 'ON_HOLD', label: 'On hold', teste: a => a.status_operacional === 'ON_HOLD' },
    { id: 'SEM_PO', label: 'Sem PO', teste: a => !a.po && a.status_operacional !== 'CONCLUIDA' },
    // Pagamento solicitado/pago sem comprovante anexado — independe do status da obra.
    { id: 'COMPROVANTE_PENDENTE', label: 'Comprovante pendente', teste: a => (a.comprovantes_pendentes || 0) > 0 },
    { id: 'CONCLUIDAS', label: 'Concluídas', teste: a => a.status_operacional === 'CONCLUIDA' },
];
const FILTROS_INIT = { situacao: 'TODAS', tipo: '', subtipo: '', uf: '', regiao: '', sharing: '', operadora: '', gestor: '' };
const FILTROS_KEY = 'ls_atividades_filtros';

function lerFiltros(): typeof FILTROS_INIT {
    try { return { ...FILTROS_INIT, ...JSON.parse(localStorage.getItem(FILTROS_KEY) || '{}') }; } catch { return FILTROS_INIT; }
}
const PO_STATUS_COLOR: Record<string, string> = { AGUARDANDO: '#94a3b8', RECEBIDA: '#f59e0b', VALIDADA: '#1768D5', LIBERADA: '#22c55e' };

// `vistaInicial` existe para o item "Pipeline" da sidebar abrir esta mesma tela
// em kanban — antes ele apontava para uma tela separada sobre o modelo Demanda,
// que é o cadastro antigo e mostrava outros números.
export default function Atividades({ vistaInicial = 'lista' }: { vistaInicial?: 'lista' | 'kanban' } = {}) {
    const [atividades, setAtividades] = useState<Atividade[]>([]);
    const [loading, setLoading] = useState(true);
    const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
    const [view, setView] = useState<'lista' | 'kanban' | 'projetos'>(vistaInicial);
    // Projeto: vinte e cinco vistorias mandadas no mesmo orçamento são um
    // pedido só. O agrupamento acontece sobre atividades JÁ lançadas, que é o
    // caso real — elas já têm cronograma, pagamento e histórico.
    const [projetos, setProjetos] = useState<any[]>([]);
    const [selecionadas, setSelecionadas] = useState<string[]>([]);
    const [agrupando, setAgrupando] = useState(false);
    const [novoProjeto, setNovoProjeto] = useState('');
    const [projetoAlvo, setProjetoAlvo] = useState('');
    const [projetoAberto, setProjetoAberto] = useState<any | null>(null);
    const [search, setSearch] = useState('');
    const [documentFilter, setDocumentFilter] = useState('TODAS');
    // Excluir é só do administrador (o backend confere de novo).
    const ehAdmin = useEhAdmin();
    // Lembrado por usuário neste navegador: quem cuida só do Norte abre já no Norte.
    const [filtros, setFiltros] = useState(lerFiltros);
    useEffect(() => { try { localStorage.setItem(FILTROS_KEY, JSON.stringify(filtros)); } catch { /* sem storage, só não lembra */ } }, [filtros]);
    const setFiltro = (campo: keyof typeof FILTROS_INIT, valor: string) => setFiltros(f => ({ ...f, [campo]: valor }));
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(FORM_INIT);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState('');
    const [excluindo, setExcluindo] = useState<any | null>(null);
    const [poModalId, setPoModalId] = useState<string | null>(null);
    const [poForm, setPoForm] = useState({ numero: '', pdf_url: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/atividades/carteira');
            setAtividades(await r.json());
        } catch {
            setErro('Não foi possível carregar as atividades. Verifique se o backend está rodando.');
        } finally {
            setLoading(false);
        }
    }, []);

    const carregarProjetos = useCallback(async () => {
        try {
            const r = await fetch('/api/acionamentos');
            if (!r.ok) return;
            const lista = await r.json();
            // O consolidado de cada projeto vem do endpoint financeiro: é ele
            // que sabe somar o rateado, que não existe na listagem simples.
            const comNumeros = await Promise.all(lista.map(async (p: any) => {
                const f = await fetch(`/api/acionamentos/${p.id}/financeiro`);
                return f.ok ? { ...p, ...(await f.json()) } : p;
            }));
            setProjetos(comNumeros);
        } catch { /* a tela de projetos apenas fica vazia */ }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (view === 'projetos') carregarProjetos(); }, [view, carregarProjetos]);

    /** Agrupa as atividades marcadas num projeto — novo ou existente. */
    async function agruparSelecionadas() {
        if (!selecionadas.length) return;
        setErro('');
        setAgrupando(true);
        try {
            let alvo = projetoAlvo;
            if (!alvo) {
                const titulo = novoProjeto.trim();
                if (!titulo) { setErro('Dê um nome ao projeto ou escolha um existente'); return; }
                const r = await fetch('/api/acionamentos', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo }),
                });
                if (!r.ok) throw new Error((await r.json()).error || 'Erro ao criar o projeto');
                alvo = (await r.json()).id;
            }
            // O endpoint recebe a lista FINAL do projeto: quem já estava e
            // continua, mais as novas. Mandar só as novas tiraria as antigas.
            const atual = projetos.find(p => p.id === alvo);
            const jaNoProjeto = (atual?.atividades || []).map((a: any) => a.id);
            const finais = [...new Set([...jaNoProjeto, ...selecionadas])];

            const r2 = await fetch(`/api/acionamentos/${alvo}/atividades`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ atividade_ids: finais }),
            });
            if (!r2.ok) throw new Error((await r2.json()).error || 'Erro ao agrupar');
            setSelecionadas([]);
            setNovoProjeto('');
            setProjetoAlvo('');
            await Promise.all([load(), carregarProjetos()]);
        } catch (e: any) { setErro(e.message); }
        finally { setAgrupando(false); }
    }

    // Excluir a atividade apaga toda a cadeia ligada a ela — por isso pede motivo e é
    // restrito a administrador (o backend confere de novo).
    async function confirmarExclusao(motivo: string) {
        if (!excluindo) return;
        setErro('');
        let usuario: any = null;
        try { usuario = JSON.parse(localStorage.getItem('ls_auth_user') || 'null'); } catch { usuario = null; }

        const r = await fetch(`/api/atividades/${excluindo.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                motivo,
                autor: usuario ? { nome: usuario.nome, email: usuario.email, role: usuario.role } : undefined,
            }),
        });
        if (!r.ok) {
            setErro((await r.json()).error || 'Erro ao excluir a atividade');
            setExcluindo(null);
            return;
        }
        setExcluindo(null);
        await load();
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setErro('');
        try {
            const payload = {
                ...form,
                subtipo_demanda: form.tipo_demanda === 'OPERACAO' ? (form.subtipo_demanda || null) : null,
                tipo_obra: form.tipo_obra || null,
                tipo_site_highline: form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO'
                    ? (form.tipo_site_highline || null)
                    : null,
                tipo_atividade: form.tipo_atividade || null,
                operadora: form.operadora || null,
                contrato: form.contrato || null,
                estado: normalizarUf(form.estado) || null,
                municipio: form.municipio || null,
                id_site_sharing: form.id_site_sharing || null,
                id_site_operadora: form.id_site_operadora || null,
                valor_contrato: form.valor_contrato ? parseFloat(form.valor_contrato) : null,
                valor_orcado: form.valor_orcado ? parseFloat(form.valor_orcado) : null,
                responsavel: form.responsavel || null,
                descricao: form.descricao || null,
            };
            const r = await fetch('/api/atividades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao criar atividade');
            const nova = await r.json();
            setShowForm(false);
            setForm(FORM_INIT);
            await load();
            setSelecionadaId(nova.id);
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function anexarPO(e: React.FormEvent) {
        e.preventDefault();
        if (!poModalId) return;
        setSaving(true);
        setErro('');
        try {
            const r = await fetch('/api/pos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ atividade_id: poModalId, numero: poForm.numero || null, pdf_url: poForm.pdf_url || null }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao anexar PO');
            setPoModalId(null);
            setPoForm({ numero: '', pdf_url: '' });
            await load();
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setSaving(false);
        }
    }

    if (selecionadaId) {
        return (
            <AtividadeCockpit
                atividadeId={selecionadaId}
                onBack={() => { setSelecionadaId(null); load(); }}
            />
        );
    }

    // Todos os filtros menos a situação — os contadores dos chips de situação
    // saem daqui, para dizer quantas sobrariam ao clicar em cada um.
    const situacaoAtual = SITUACOES.find(s => s.id === filtros.situacao) || SITUACOES[0];
    const semSituacao = atividades.filter(a => {
        const termo = search.toLowerCase();
        const matchesSearch = a.titulo.toLowerCase().includes(termo)
            || a.codigo.toLowerCase().includes(termo)
            || (a.municipio || '').toLowerCase().includes(termo)
            || (a.id_site_sharing || '').toLowerCase().includes(termo)
            || (a.id_site_operadora || '').toLowerCase().includes(termo);
        const matchesDocuments = documentFilter === 'TODAS'
            || (documentFilter === 'PENDENTES' && (a.documentos_pendentes || 0) > 0)
            || (documentFilter === 'COMPLETAS' && (a.documentos_total || 0) > 0 && a.documentos_pendentes === 0)
            || (documentFilter === 'CORRECAO' && (a.documentos_correcao || 0) > 0);
        const uf = normalizarUf(a.estado);
        return matchesSearch && matchesDocuments
            && (!filtros.tipo || a.tipo_demanda === filtros.tipo)
            && (!filtros.subtipo || a.subtipo_demanda === filtros.subtipo)
            && (!filtros.uf || uf === filtros.uf)
            && (!filtros.regiao || regiaoPorUf(uf) === filtros.regiao)
            && (!filtros.sharing || a.sharing === filtros.sharing)
            && (!filtros.operadora || a.operadora === filtros.operadora)
            && (!filtros.gestor || (a.gestor || a.responsavel || '') === filtros.gestor);
    });
    const filtradas = semSituacao.filter(situacaoAtual.teste);

    // As listas dos filtros mostram só o que existe na carteira, com a contagem.
    const contar = (valores: (string | null | undefined)[]) => {
        const m = new Map<string, number>();
        for (const v of valores) if (v) m.set(v, (m.get(v) || 0) + 1);
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    };
    const ufsNaCarteira = contar(atividades
        .filter(a => !filtros.regiao || regiaoPorUf(a.estado) === filtros.regiao)
        .map(a => normalizarUf(a.estado)));
    const gestoresNaCarteira = contar(atividades.map(a => a.gestor || a.responsavel));
    const filtrosAtivos = (Object.keys(FILTROS_INIT) as (keyof typeof FILTROS_INIT)[])
        .filter(k => filtros[k] !== FILTROS_INIT[k]).length + (documentFilter !== 'TODAS' ? 1 : 0) + (search ? 1 : 0);
    const limparFiltros = () => { setFiltros(FILTROS_INIT); setDocumentFilter('TODAS'); setSearch(''); };
    const filtroSelect = 'h-8 rounded-lg border border-border bg-card px-2 text-xs';

    return (
        <div className="p-8 text-foreground">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold">Atividades</h2>
                    <p className="text-muted-foreground mt-1">Centro operacional de implantação e operação</p>
                </div>
                <button
                    onClick={() => { setForm(FORM_INIT); setErro(''); setShowForm(true); }}
                    className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-medium shadow-sm"
                >
                    <Plus size={18} /> Nova Atividade
                </button>
            </div>

            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text" placeholder="Buscar por código, título ou site..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <select value={documentFilter} onChange={e => setDocumentFilter(e.target.value)} className="h-10 px-3 border border-border rounded-lg bg-card text-sm">
                    <option value="TODAS">Toda documentação</option>
                    <option value="PENDENTES">Com pendências</option>
                    <option value="COMPLETAS">Documentação completa</option>
                    <option value="CORRECAO">Necessita correção</option>
                </select>
                <div className="flex gap-1 bg-secondary/40 rounded-lg p-1">
                    <button onClick={() => setView('lista')} className={`p-2 rounded-md ${view === 'lista' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Lista (Carteira)">
                        <ListIcon size={16} />
                    </button>
                    <button onClick={() => setView('kanban')} className={`p-2 rounded-md ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Kanban">
                        <LayoutGrid size={16} />
                    </button>
                    <button onClick={() => setView('projetos')} className={`px-2.5 py-2 rounded-md text-[11px] font-semibold ${view === 'projetos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Projetos — atividades agrupadas num orçamento só">
                        Projetos
                    </button>
                </div>
            </div>

            {view !== 'projetos' && (
                <div className="mb-5 space-y-2.5">
                    {/* Situação: recortes rápidos, com quantas atividades cada um mostraria */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {SITUACOES.map(s => {
                            const total = semSituacao.filter(s.teste).length;
                            const ativo = filtros.situacao === s.id;
                            const alerta = (s.id === 'ATRASADAS' || s.id === 'COMPROVANTE_PENDENTE') && total > 0;
                            return (
                                <button key={s.id} onClick={() => setFiltro('situacao', s.id)}
                                    className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${ativo
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : alerta ? 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                                            : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                    {s.label} <span className={ativo ? 'opacity-80' : 'opacity-60'}>{total}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Recortes por tipo, lugar e responsável */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1 rounded-lg bg-secondary/40 p-0.5">
                            {[['', 'Todos os tipos'], ...TIPOS_DEMANDA.map(t => [t, TIPOS_DEMANDA_LABEL[t] || t])].map(([id, label]) => (
                                <button key={id} onClick={() => setFiltros(f => ({ ...f, tipo: id, subtipo: id === 'OPERACAO' ? f.subtipo : '' }))}
                                    className={`h-7 rounded-md px-2.5 text-xs font-semibold ${filtros.tipo === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        {filtros.tipo === 'OPERACAO' && (
                            <select value={filtros.subtipo} onChange={e => setFiltro('subtipo', e.target.value)} className={filtroSelect}>
                                <option value="">Todo subtipo</option>
                                {SUBTIPOS_OPERACAO.map(s => <option key={s} value={s}>{SUBTIPOS_OPERACAO_LABEL[s]}</option>)}
                            </select>
                        )}
                        <select value={filtros.regiao} onChange={e => setFiltros(f => ({ ...f, regiao: e.target.value, uf: e.target.value && regiaoPorUf(f.uf) !== e.target.value ? '' : f.uf }))} className={filtroSelect}>
                            <option value="">Toda região</option>
                            {REGIOES.map(r => <option key={r} value={r}>{REGIAO_LABEL[r]}</option>)}
                        </select>
                        <select value={filtros.uf} onChange={e => setFiltro('uf', e.target.value)} className={filtroSelect}>
                            <option value="">Toda UF</option>
                            {ufsNaCarteira.map(([uf, n]) => <option key={uf} value={uf}>{uf} ({n})</option>)}
                        </select>
                        <select value={filtros.sharing} onChange={e => setFiltro('sharing', e.target.value)} className={filtroSelect}>
                            <option value="">Todo sharing</option>
                            {SHARINGS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={filtros.operadora} onChange={e => setFiltro('operadora', e.target.value)} className={filtroSelect}>
                            <option value="">Toda operadora</option>
                            {OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        {gestoresNaCarteira.length > 0 && (
                            <select value={filtros.gestor} onChange={e => setFiltro('gestor', e.target.value)} className={filtroSelect}>
                                <option value="">Todo gestor</option>
                                {gestoresNaCarteira.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
                            </select>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                            {filtradas.length} de {atividades.length} atividade(s)
                        </span>
                        {filtrosAtivos > 0 && (
                            <button onClick={limparFiltros} className="h-8 px-2 text-xs font-semibold text-primary hover:underline">
                                Limpar filtros ({filtrosAtivos})
                            </button>
                        )}
                    </div>
                </div>
            )}

            {erro && !showForm && !poModalId && (
                <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">{erro}</div>
            )}

            {loading ? (
                <div className="text-center py-16 text-muted-foreground">Carregando atividades...</div>
            ) : view === 'lista' ? (
                <>
                {selecionadas.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3.5 py-2.5">
                        <span className="text-[13px] font-semibold">{selecionadas.length} atividade(s) selecionada(s)</span>
                        <span className="text-[11px] text-muted-foreground">agrupar em</span>
                        <select className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]"
                            value={projetoAlvo} onChange={e => setProjetoAlvo(e.target.value)}>
                            <option value="">— novo projeto —</option>
                            {projetos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.titulo}</option>)}
                        </select>
                        {!projetoAlvo && (
                            <input autoFocus className="h-8 w-72 rounded-lg border border-border bg-background px-2 text-[12px]"
                                value={novoProjeto} onChange={e => setNovoProjeto(e.target.value)}
                                placeholder="Nome do projeto — ex.: Vistoria de Energia OI"/>
                        )}
                        <button onClick={agruparSelecionadas} disabled={agrupando}
                            className="h-8 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-60">
                            {agrupando ? 'Agrupando...' : 'Agrupar'}
                        </button>
                        <button onClick={() => setSelecionadas([])} className="h-8 px-2 text-[12px] text-muted-foreground">Cancelar</button>
                    </div>
                )}
                <div className="bg-card border border-border rounded-xl overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-left text-[11px] text-muted-foreground bg-secondary/40 border-b border-border whitespace-nowrap">
                                <th className="px-2 py-2.5 align-middle w-8">
                                    <input type="checkbox" title="Selecionar todas as visíveis"
                                        checked={filtradas.length > 0 && filtradas.every(a => selecionadas.includes(a.id))}
                                        onChange={e => setSelecionadas(e.target.checked ? filtradas.map(a => a.id) : [])}/>
                                </th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Site ID Sharing / Operadora</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Cliente / Sharing</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Operadora</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Fornecedor</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Gestor</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">PO</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Status</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold">Documentação</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold text-right">Budget</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold text-right">Custo</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold text-right">Saldo</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold min-w-[104px]">Avanço</th>
                                <th className="px-2.5 py-2.5 align-middle font-semibold"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.length === 0 && (
                                <tr><td colSpan={14} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
                            )}
                            {filtradas.map(a => {
                                const opColor = OPERADORA_COLOR[a.operadora || ''] || '#94a3b8';
                                const saldo = a.saldo ?? ((a.valor_contrato ?? 0) - (a.custo_pago ?? 0));
                                return (
                                    <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/20 transition-colors align-top">
                                        <td className="px-2 py-3 align-middle">
                                            <input type="checkbox" checked={selecionadas.includes(a.id)}
                                                onChange={e => setSelecionadas(v => e.target.checked ? [...v, a.id] : v.filter(id => id !== a.id))}/>
                                        </td>
                                        <td className="px-2.5 py-3 align-middle">
                                            <div className="font-bold text-primary">{a.id_site_sharing || '—'}</div>
                                            <div className="text-[11px] font-medium text-foreground/70">{a.id_site_operadora || '—'}</div>
                                            <div className="text-[11px] text-muted-foreground">{[normalizarUf(a.estado) || a.estado, a.municipio].filter(Boolean).join(' / ') || '—'}</div>
                                            <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                {TIPOS_DEMANDA_LABEL[a.tipo_demanda] || a.tipo_demanda}
                                            </span>
                                        </td>
                                        <td className="px-2.5 py-3 align-middle font-semibold text-primary whitespace-nowrap">{a.sharing}</td>
                                        <td className="px-2.5 py-3 align-middle">
                                            {a.operadora && <span className="text-xs font-bold" style={{ color: opColor }}>{a.operadora}</span>}
                                        </td>
                                        <td className="px-2.5 py-3 align-middle text-xs">{a.fornecedor_principal || <span className="text-muted-foreground">—</span>}</td>
                                        <td className="px-2.5 py-3 align-middle text-xs font-semibold whitespace-nowrap">{a.responsavel || '—'}</td>
                                        <td className="px-2.5 py-3 align-middle">
                                            {a.po ? (
                                                <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: `${PO_STATUS_COLOR[a.po.status]}22`, color: PO_STATUS_COLOR[a.po.status] }}>
                                                    {a.po.numero || a.po.status}
                                                </span>
                                            ) : (
                                                <button onClick={() => { setPoModalId(a.id); setPoForm({ numero: '', pdf_url: '' }); }}
                                                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/40 whitespace-nowrap">
                                                    <Paperclip size={11} /> Anexar PO
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-2.5 py-3 align-middle">
                                            <StatusPill status={a.status_operacional} map={STATUS_OPERACIONAL} />
                                            {(a.comprovantes_pendentes || 0) > 0 && (
                                                <div className="mt-1 text-[10px] font-semibold text-amber-500" title="Pagamento solicitado ou pago sem comprovante anexado">
                                                    {a.comprovantes_pendentes} comprovante(s) pendente(s)
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-2.5 py-3 align-middle min-w-[92px]">
                                            <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                                                <span className={(a.documentos_correcao || 0) > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
                                                    {(a.documentos_correcao || 0) > 0 ? `${a.documentos_correcao} em correção` : `${a.documentos_ok || 0}/${a.documentos_total || 0}`}
                                                </span>
                                                <span className="font-semibold">{a.documentos_percentual || 0}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-[hsl(var(--progress-track))] overflow-hidden">
                                                <div className={`h-full rounded-full ${(a.documentos_correcao || 0) > 0 ? 'bg-red-600' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, a.documentos_percentual || 0)}%` }} />
                                            </div>
                                        </td>
                                        <td className="px-2.5 py-3 align-middle text-right font-semibold whitespace-nowrap">{fmtMoeda(a.valor_contrato)}</td>
                                        <td className="px-2.5 py-3 align-middle text-right whitespace-nowrap" style={{ color: '#f59e0b' }}>{fmtMoeda(a.custo_pago)}</td>
                                        <td className="px-2.5 py-3 align-middle text-right font-semibold whitespace-nowrap" style={{ color: saldo < 0 ? '#ef4444' : '#22c55e' }}>{fmtMoeda(saldo)}</td>
                                        <td className="px-2.5 py-3 align-middle w-32 min-w-[104px]">
                                            {/* Verde ao chegar em 100%: a conclusao e a leitura mais
                                                importante da coluna. O numero ao lado garante que a
                                                informacao nao dependa so da cor. */}
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 flex-1 min-w-[52px] rounded-full bg-[hsl(var(--progress-track))] overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-[width] duration-300 ${(a.avanco_percentual ?? 0) >= 100 ? 'bg-emerald-600' : 'bg-primary'}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, a.avanco_percentual ?? 0))}%` }}
                                                    />
                                                </div>
                                                <span className="text-[11px] font-semibold text-foreground w-9 text-right tabular-nums">{Math.round(a.avanco_percentual ?? 0)}%</span>
                                            </div>
                                        </td>
                                        <td className="px-2.5 py-3 align-middle">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button onClick={() => setSelecionadaId(a.id)} className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">Abrir →</button>
                                                {ehAdmin && (
                                                    <button onClick={() => setExcluindo(a)} title="Excluir atividade"
                                                        className="text-muted-foreground hover:text-destructive p-1">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            ) : view === 'projetos' ? (
                <div className="flex flex-col gap-3">
                    {projetos.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                            Nenhum projeto ainda. Na visão de Lista, marque as atividades e use <strong className="text-foreground">Agrupar</strong>.
                        </div>
                    )}
                    {projetos.map(p => {
                        const r = p.resumo || {};
                        const aberto = projetoAberto?.id === p.id;
                        return (
                            <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
                                <button onClick={() => setProjetoAberto(aberto ? null : p)}
                                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-primary/[0.04]">
                                    <span className="font-mono text-[11px] text-muted-foreground">{p.codigo}</span>
                                    <strong className="text-sm">{p.titulo}</strong>
                                    <span className="text-[11px] text-muted-foreground">{r.atividades ?? (p.atividades?.length || 0)} atividade(s)</span>
                                    <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                                        <span className="text-muted-foreground">receita <strong className="text-foreground">{fmtMoeda(r.receita || 0)}</strong></span>
                                        <span className="text-muted-foreground">contratado <strong className="text-foreground">{fmtMoeda(r.custo_comprometido || 0)}</strong></span>
                                        <span className="text-muted-foreground">adiantado <strong className="text-foreground">{fmtMoeda(r.adiantado || 0)}</strong></span>
                                        {/* Enquanto sobrar dinheiro sem dono, a margem por
                                            atividade está incompleta — e é isso que o âmbar diz. */}
                                        {(r.a_ratear || 0) > 0
                                            ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-500">a ratear {fmtMoeda(r.a_ratear)}</span>
                                            : (r.rateado || 0) > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-500">rateado {fmtMoeda(r.rateado)}</span>}
                                    </span>
                                </button>
                                {aberto && (
                                    <div className="border-t border-border">
                                        {(p.atividades || []).map((a: any) => (
                                            <button key={a.id} onClick={() => setSelecionadaId(a.id)}
                                                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-2.5 text-left text-[12px] last:border-0 hover:bg-secondary/30">
                                                <span className="font-mono text-[11px] text-primary">{a.codigo}</span>
                                                <span>{a.titulo}</span>
                                                {a.site && <span className="text-[11px] text-muted-foreground">{a.site}</span>}
                                                <span className="ml-auto text-[11px] text-muted-foreground">
                                                    contratado <strong className="text-foreground">{fmtMoeda(a.custo_comprometido || 0)}</strong>
                                                    {(a.custo_rateado || 0) > 0 && <> · rateado <strong className="text-emerald-500">{fmtMoeda(a.custo_rateado)}</strong></>}
                                                </span>
                                            </button>
                                        ))}
                                        {(p.atividades || []).length === 0 && (
                                            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Projeto sem atividades. Agrupe pela visão de Lista.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {KANBAN_ORDEM.map(statusId => {
                        const cards = filtradas.filter(a => a.status_operacional === statusId);
                        const info = STATUS_OPERACIONAL[statusId];
                        return (
                            <div key={statusId} className="min-w-[280px] w-[280px] flex-shrink-0 bg-card border border-border rounded-xl overflow-hidden">
                                <div className="px-3.5 py-2.5 bg-secondary/60 border-b border-border flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
                                        <span className="text-xs font-bold tracking-wide text-muted-foreground">{info.label.toUpperCase()}</span>
                                    </div>
                                    <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: `${info.color}22`, color: info.color }}>
                                        {cards.length}
                                    </span>
                                </div>
                                <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                                    {cards.length === 0 && (
                                        <div className="text-center py-6 text-xs text-muted-foreground">Nenhuma atividade</div>
                                    )}
                                    {cards.map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => setSelecionadaId(a.id)}
                                            className="text-left bg-secondary/40 hover:bg-secondary/70 border border-border rounded-lg p-3 transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">{a.sharing}</span>
                                                {a.id_site_sharing && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.id_site_sharing}</span>
                                                )}
                                                {a.id_site_operadora && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.id_site_operadora}</span>
                                                )}
                                            </div>
                                            <div className="text-sm font-semibold leading-snug mb-1">{a.titulo}</div>
                                            <div className="text-[11px] text-muted-foreground font-mono mb-2">{a.codigo}</div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">{TIPOS_DEMANDA_LABEL[a.tipo_demanda] || a.tipo_demanda}</span>
                                                {a.valor_contrato != null && <span className="font-semibold">{fmtMoeda(a.valor_contrato)}</span>}
                                            </div>
                                            {a.tipo_demanda === 'IMPLANTACAO' && (
                                                <div className="mt-2 pt-2 border-t border-border/70">
                                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                                        <span>Documentação {a.documentos_ok || 0}/{a.documentos_total || 0}</span>
                                                        <span>{a.documentos_percentual || 0}%</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-[hsl(var(--progress-track))] overflow-hidden">
                                                        <div className={`h-full rounded-full ${(a.documentos_correcao || 0) > 0 ? 'bg-red-600' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, a.documentos_percentual || 0)}%` }} />
                                                    </div>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {poModalId && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9500] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-bold flex items-center gap-2"><FolderPlus size={18} /> Anexar PO</h3>
                            <button onClick={() => setPoModalId(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                        </div>
                        {erro && <div className="mb-3 p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">{erro}</div>}
                        <form onSubmit={anexarPO} className="flex flex-col gap-3">
                            <Field label="Número da PO">
                                <input value={poForm.numero} onChange={e => setPoForm(f => ({ ...f, numero: e.target.value }))} className="input" placeholder="Ex: PO-7788 / 2026" />
                            </Field>
                            <Field label="URL do PDF">
                                <input value={poForm.pdf_url} onChange={e => setPoForm(f => ({ ...f, pdf_url: e.target.value }))} className="input" placeholder="https://..." />
                            </Field>
                            <div className="flex justify-end gap-2 mt-2">
                                <button type="button" onClick={() => setPoModalId(null)} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary/50">Cancelar</button>
                                <button type="submit" disabled={saving} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                                    {saving ? 'Salvando...' : 'Anexar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-7">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold">Nova Atividade</h3>
                            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
                        </div>
                        {erro && <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">{erro}</div>}
                        <form onSubmit={handleSave} className="flex flex-col gap-4">
                            <Field label="Título *">
                                <input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                                    placeholder="Ex: Implantação BTS — PAPUP2064" className="input" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Tipo de Demanda *">
                                    <select
                                        value={form.tipo_demanda}
                                        onChange={e => {
                                            const novoTipo = e.target.value;
                                            setForm(f => ({ ...f, tipo_demanda: novoTipo, modelo_operacao: modeloOperacaoPadrao(novoTipo), subtipo_demanda: '' }));
                                        }}
                                        className="input"
                                    >
                                        {TIPOS_DEMANDA.map(t => <option key={t} value={t}>{TIPOS_DEMANDA_LABEL[t]}</option>)}
                                    </select>
                                </Field>
                                <Field label="Sharing / Detentora *">
                                    <select value={form.sharing} onChange={e => setForm(f => ({ ...f, sharing: e.target.value }))} className="input">
                                        {SHARINGS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </Field>
                            </div>
                            {form.tipo_demanda === 'OPERACAO' && (
                                <Field label="Subtipo de Operação">
                                    <select value={form.subtipo_demanda} onChange={e => setForm(f => ({ ...f, subtipo_demanda: e.target.value }))} className="input">
                                        <option value="">—</option>
                                        {SUBTIPOS_OPERACAO.map(s => <option key={s} value={s}>{SUBTIPOS_OPERACAO_LABEL[s]}</option>)}
                                    </select>
                                </Field>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Operadora">
                                    <select value={form.operadora} onChange={e => setForm(f => ({ ...f, operadora: e.target.value }))} className="input">
                                        {OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </Field>
                                <Field label="Tipo de Obra">
                                    <select value={form.tipo_obra} onChange={e => setForm(f => ({ ...f, tipo_obra: e.target.value }))} className="input">
                                        <option value="">—</option>
                                        {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Field>
                            </div>
                            {form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' && (
                                <Field label="Tipo de Site Highline *">
                                    <select required value={form.tipo_site_highline} onChange={e => setForm(f => ({ ...f, tipo_site_highline: e.target.value }))} className="input">
                                        <option value="">Selecione...</option>
                                        {TIPOS_SITE_HIGHLINE.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Modelo de Operação">
                                <select value={form.modelo_operacao} disabled={modelosPermitidos(form.tipo_demanda).length === 1}
                                    onChange={e => setForm(f => ({ ...f, modelo_operacao: e.target.value }))} className="input">
                                    {modelosPermitidos(form.tipo_demanda).map(m => <option key={m} value={m}>{MODELO_OPERACAO_LABEL[m]}</option>)}
                                </select>
                            </Field>
                            <p className="text-[11px] text-muted-foreground -mt-2">
                                {form.tipo_demanda === 'IMPLANTACAO'
                                    ? 'Implantação sempre segue o fluxo completo (Mediante Aprovação).'
                                    : 'Preenchido automaticamente a partir do Tipo de Demanda — pode trocar manualmente para exceções.'}
                            </p>
                            <Field label="Tipo de Atividade">
                                <input value={form.tipo_atividade} onChange={e => setForm(f => ({ ...f, tipo_atividade: e.target.value }))}
                                    placeholder="Ex: Instalação de antena, SPDA, obra civil..." className="input" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Site ID Sharing *">
                                    <input value={form.id_site_sharing} onChange={e => setForm(f => ({ ...f, id_site_sharing: e.target.value }))}
                                        placeholder="Ex: PAPUP2064" required className="input" />
                                </Field>
                                <Field label="Site ID Operadora *">
                                    <input value={form.id_site_operadora} onChange={e => setForm(f => ({ ...f, id_site_operadora: e.target.value }))}
                                        placeholder="Ex: PAPCJ001" required className="input" />
                                </Field>
                            </div>
                            <Field label="Contrato">
                                <input value={form.contrato} onChange={e => setForm(f => ({ ...f, contrato: e.target.value }))} className="input" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={`UF${form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' ? ' *' : ''}`}>
                                    <select
                                        value={form.estado}
                                        onChange={e => setForm(f => ({ ...f, estado: e.target.value, municipio: e.target.value === f.estado ? f.municipio : '' }))}
                                        required={form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO'}
                                        className="input"
                                    >
                                        <option value="">— Selecione —</option>
                                        {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
                                    </select>
                                </Field>
                                <Field label="Município">
                                    <MunicipioInput uf={form.estado} value={form.municipio} className="input"
                                        onChange={nome => setForm(f => ({ ...f, municipio: nome }))} />
                                </Field>
                            </div>
                            {/* Valor de contrato e custo orçado não entram na abertura: nascem
                                do orçamento/negociação e são editados depois, no cockpit. */}
                            <Field label="Responsável / Gestor">
                                <input value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} className="input" />
                            </Field>
                            <Field label="Descrição / Escopo">
                                <textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="input resize-y" />
                            </Field>
                            <div className="flex justify-end gap-2.5 mt-2">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary/50">Cancelar</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                                    {saving ? 'Criando...' : 'Criar Atividade'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {excluindo && (
                <ModalExcluirAtividade
                    atividade={excluindo}
                    onConfirmar={confirmarExclusao}
                    onFechar={() => setExcluindo(null)}
                />
            )}

            <style>{`.input { width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 13px; outline: none; } .input:focus { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.3); }`}</style>
        </div>
    );
}

// Exclusão apaga cronograma, APC, RFI, execução, documentação, POs e contratações da
// atividade — o modal deixa isso explícito e exige justificativa.
function ModalExcluirAtividade({ atividade, onConfirmar, onFechar }: {
    atividade: any;
    onConfirmar: (motivo: string) => void;
    onFechar: () => void;
}) {
    const [motivo, setMotivo] = useState('');
    const curto = motivo.trim().length < 10;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={onFechar}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} className="text-destructive" /> Excluir atividade
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                    <strong className="text-foreground">{atividade.codigo} · {atividade.titulo}</strong>
                    {atividade.id_site_sharing ? ` — ${atividade.id_site_sharing}` : ''}
                </p>

                <div className="text-xs bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
                    Serão apagados junto: cronograma, APC, RFI, registro de execução, documentação com os
                    arquivos, POs com os PDFs anexados e as contratações de fornecedor.
                    Orçamentos vinculados não são apagados — apenas desvinculados.
                </div>

                <label className="text-xs font-semibold text-muted-foreground">Motivo da exclusão</label>
                <textarea
                    rows={3}
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Ex.: atividade criada em duplicidade; a correta é a ATV-2026-014."
                    className="w-full mt-1 bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-y"
                />
                {curto && motivo.length > 0 && (
                    <div className="text-[11px] text-amber-500 mt-1">Descreva com pelo menos 10 caracteres.</div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onFechar} className="text-xs font-semibold border border-border rounded px-3 py-2 hover:bg-secondary">
                        Voltar
                    </button>
                    <button onClick={() => onConfirmar(motivo)} disabled={curto}
                        className="text-xs font-semibold bg-destructive text-destructive-foreground rounded px-3 py-2 hover:opacity-90 disabled:opacity-40">
                        Excluir definitivamente
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}
