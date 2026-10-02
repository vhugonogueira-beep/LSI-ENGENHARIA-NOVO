import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, LayoutGrid, List as ListIcon, Paperclip, FolderPlus, Trash2, AlertTriangle, HardHat } from 'lucide-react';
import {
    STATUS_OPERACIONAL, TIPOS_DEMANDA, TIPOS_DEMANDA_LABEL, SUBTIPOS_OPERACAO, SUBTIPOS_OPERACAO_LABEL,
    TIPOS_OBRA, TIPOS_SITE_HIGHLINE, UFS, normalizarUf, SHARINGS, OPERADORAS, MODELO_OPERACAO_LABEL, modeloOperacaoPadrao, modelosPermitidos,
    REGIOES, REGIAO_LABEL, regiaoPorUf, fmtMoeda, StatusPill,
} from '../components/atividades/constants';
import AtividadeCockpit from '../components/atividades/AtividadeCockpit';
import PageHeader from '../components/PageHeader';
import { AreaChip, OperadoraChip, SharingNome } from '../components/atividades/ui';
import { CHIP, TEXTO, SOLIDO, VEU, FAIXA, TOPO, TOM_STATUS, TOM_AREA, TOM_MODULO, tomDe, type Tom } from '../lib/cores';
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
const SITUACOES: { id: string; label: string; teste: (a: Atividade) => boolean; tom?: Tom }[] = [
    { id: 'TODAS', label: 'Todas', teste: () => true },
    { id: 'ABERTAS', label: 'Em aberto', tom: 'indigo', teste: a => a.status_operacional !== 'CONCLUIDA' },
    { id: 'EM_EXECUCAO', label: 'Em execução', tom: 'blue', teste: a => a.status_operacional === 'EM_EXECUCAO' },
    { id: 'ATRASADAS', label: 'Atrasadas', tom: 'rose', teste: atrasada },
    { id: 'ON_HOLD', label: 'On hold', tom: 'violet', teste: a => a.status_operacional === 'ON_HOLD' },
    { id: 'SEM_PO', label: 'Sem PO', tom: 'amber', teste: a => !a.po && a.status_operacional !== 'CONCLUIDA' },
    // Pagamento solicitado/pago sem comprovante anexado — independe do status da obra.
    { id: 'COMPROVANTE_PENDENTE', label: 'Comprovante pendente', tom: 'amber', teste: a => (a.comprovantes_pendentes || 0) > 0 },
    { id: 'CONCLUIDAS', label: 'Concluídas', tom: 'green', teste: a => a.status_operacional === 'CONCLUIDA' },
];
const FILTROS_INIT = { situacao: 'TODAS', tipo: '', subtipo: '', uf: '', regiao: '', sharing: '', operadora: '', gestor: '' };
const FILTROS_KEY = 'ls_atividades_filtros';

function lerFiltros(): typeof FILTROS_INIT {
    try { return { ...FILTROS_INIT, ...JSON.parse(localStorage.getItem(FILTROS_KEY) || '{}') }; } catch { return FILTROS_INIT; }
}
/** Tom do status operacional da atividade (faixa, pílula, kanban, barra). */
const tomStatus = (status: string) => tomDe(TOM_STATUS, status);
const PO_STATUS_TOM: Record<string, string> = { AGUARDANDO: 'text-muted-foreground', RECEBIDA: 'text-warn', VALIDADA: 'text-primary', LIBERADA: 'text-ok' };

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
            <PageHeader icone={HardHat} tom={TOM_MODULO.atividades} titulo="Atividades"
                descricao="Centro operacional de implantação e operação"
                acoes={
                    <button
                        onClick={() => { setForm(FORM_INIT); setErro(''); setShowForm(true); }}
                        className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-medium shadow-sm"
                    >
                        <Plus size={16} aria-hidden /> Nova atividade
                    </button>
                } />

            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
                    <input
                        type="text" placeholder="Buscar por código, título ou site..." aria-label="Buscar atividades"
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <select value={documentFilter} onChange={e => setDocumentFilter(e.target.value)} aria-label="Filtrar por documentação" className="h-10 px-3 border border-border rounded-lg bg-card text-sm">
                    <option value="TODAS">Toda documentação</option>
                    <option value="PENDENTES">Com pendências</option>
                    <option value="COMPLETAS">Documentação completa</option>
                    <option value="CORRECAO">Necessita correção</option>
                </select>
                <div className="flex gap-1 bg-secondary/40 rounded-lg p-1">
                    <button onClick={() => setView('lista')} className={`p-2 rounded-md ${view === 'lista' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Ver em lista" aria-label="Ver em lista" aria-pressed={view === 'lista'}>
                        <ListIcon size={16} aria-hidden />
                    </button>
                    <button onClick={() => setView('kanban')} className={`p-2 rounded-md ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Ver em kanban" aria-label="Ver em kanban" aria-pressed={view === 'kanban'}>
                        <LayoutGrid size={16} aria-hidden />
                    </button>
                    <button onClick={() => setView('projetos')} className={`px-2.5 py-2 rounded-md text-xs font-semibold ${view === 'projetos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Projetos — atividades agrupadas num orçamento só" aria-pressed={view === 'projetos'}>
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
                            // Com contagem, cada recorte leva a cor do que significa:
                            // tingido quando inativo, cheio quando escolhido.
                            const tom = total > 0 ? s.tom : undefined;
                            const estilo = tom
                                ? (ativo ? `border border-transparent ${SOLIDO[tom]} text-background` : `${CHIP[tom]} hover:brightness-110`)
                                : ativo ? 'border border-primary bg-primary text-primary-foreground'
                                    : 'border border-border text-muted-foreground hover:text-foreground';
                            return (
                                <button key={s.id} type="button" aria-pressed={ativo} onClick={() => setFiltro('situacao', s.id)}
                                    className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${estilo}`}>
                                    {s.label} <span className={`tabular-nums ${ativo ? 'opacity-90' : 'opacity-70'}`}>{total || '—'}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Recortes por tipo, lugar e responsável */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1 rounded-lg bg-secondary/40 p-0.5">
                            {[['', 'Todos os tipos'], ...TIPOS_DEMANDA.map(t => [t, TIPOS_DEMANDA_LABEL[t] || t])].map(([id, label]) => (
                                <button key={id} onClick={() => setFiltros(f => ({ ...f, tipo: id, subtipo: id === 'OPERACAO' ? f.subtipo : '' }))}
                                    aria-pressed={filtros.tipo === id}
                                    className={`h-7 rounded-md px-2.5 text-xs font-semibold ${filtros.tipo === id
                                        ? (id ? `${SOLIDO[tomDe(TOM_AREA, id)]} text-background` : 'bg-primary text-primary-foreground')
                                        : id ? `${TEXTO[tomDe(TOM_AREA, id)]} hover:bg-secondary/60` : 'text-muted-foreground hover:text-foreground'}`}>
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
                        <select className="h-8 rounded-lg border border-border bg-background px-2 text-xs" aria-label="Projeto de destino"
                            value={projetoAlvo} onChange={e => setProjetoAlvo(e.target.value)}>
                            <option value="">— novo projeto —</option>
                            {projetos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.titulo}</option>)}
                        </select>
                        {!projetoAlvo && (
                            <input autoFocus className="h-8 w-72 rounded-lg border border-border bg-background px-2 text-xs"
                                value={novoProjeto} onChange={e => setNovoProjeto(e.target.value)}
                                placeholder="Nome do projeto — ex.: Vistoria de Energia OI" aria-label="Nome do novo projeto"/>
                        )}
                        <button onClick={agruparSelecionadas} disabled={agrupando}
                            className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                            {agrupando ? 'Agrupando...' : 'Agrupar'}
                        </button>
                        <button onClick={() => setSelecionadas([])} className="h-8 px-2 text-xs text-muted-foreground">Cancelar</button>
                    </div>
                )}
                {/* Contagem e limpeza ficam presas à tabela que descrevem, não soltas à direita dos filtros. */}
                <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
                    <span><strong className="font-semibold text-foreground tabular-nums">{filtradas.length}</strong> de {atividades.length} atividade(s)</span>
                    {filtrosAtivos > 0 && (
                        <button onClick={limparFiltros} className="h-7 px-2 text-xs font-semibold text-primary hover:underline">
                            Limpar filtros ({filtrosAtivos})
                        </button>
                    )}
                </div>
                <div className="bg-card border border-border rounded-xl overflow-x-auto">
                    {/* Plano de colunas fixo: a largura não depende mais do conteúdo de
                        cada linha, então as colunas não viram ilhas em monitor largo. */}
                    <table className="w-full table-fixed min-w-[1040px] text-[13px]">
                        <colgroup>
                            <col className="w-11" />
                            <col className="w-[24%]" />
                            <col className="w-[22%]" />
                            <col />
                            <col className="w-36" />
                            <col className="w-28" />
                            <col className="w-32" />
                        </colgroup>
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground bg-secondary/40 border-b border-border whitespace-nowrap">
                                <th className="px-3 py-2.5 align-middle w-8">
                                    <input type="checkbox" title="Selecionar todas as visíveis" aria-label="Selecionar todas as atividades visíveis"
                                        checked={filtradas.length > 0 && filtradas.every(a => selecionadas.includes(a.id))}
                                        onChange={e => setSelecionadas(e.target.checked ? filtradas.map(a => a.id) : [])}/>
                                </th>
                                <th className="px-3 py-2.5 align-middle font-medium">Site</th>
                                <th className="px-3 py-2.5 align-middle font-medium">Cliente e operadora</th>
                                <th className="px-3 py-2.5 align-middle font-medium">Status e pendências</th>
                                <th className="px-3 py-2.5 align-middle font-medium">Avanço</th>
                                <th className="px-3 py-2.5 align-middle font-medium text-right">Saldo</th>
                                <th className="px-3 py-2.5 align-middle"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
                            )}
                            {filtradas.map(a => {
                                const avanco = Math.min(100, Math.max(0, a.avanco_percentual ?? 0));
                                const local = [normalizarUf(a.estado) || a.estado, a.municipio].filter(Boolean).join(' / ');
                                const gestor = a.gestor || a.responsavel;
                                const tom = tomStatus(a.status_operacional);
                                return (
                                    <tr key={a.id} className={`border-b border-border/60 last:border-b-0 border-l-4 ${FAIXA[tom]} hover:bg-secondary/20 transition-colors`}>
                                        <td className="px-3 py-3 align-top">
                                            <input type="checkbox" checked={selecionadas.includes(a.id)}
                                                aria-label={`Selecionar ${a.id_site_sharing || a.codigo}`}
                                                onChange={e => setSelecionadas(v => e.target.checked ? [...v, a.id] : v.filter(id => id !== a.id))}/>
                                        </td>
                                        {/* O Site ID é a âncora da linha: é por ele que a obra é chamada. */}
                                        <td className="px-3 py-3 align-top">
                                            {a.id_site_sharing
                                                ? <div className="font-id text-base font-semibold leading-tight text-foreground" title={a.titulo}>{a.id_site_sharing}</div>
                                                : <div className="text-sm text-muted-foreground" title={a.titulo}>Sem Site ID</div>}
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                {a.id_site_operadora && <span className="font-id">{a.id_site_operadora}</span>}
                                                <span className="font-id">{a.codigo}</span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                <AreaChip tipo={a.tipo_demanda} />
                                                {local && <span>{local}</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            {/* Sharing e operadora na mesma linha, como o Site ID ao lado:
                                                a primeira linha de cada coluna é a que se lê de relance. */}
                                            <div className="flex flex-wrap items-center gap-2 leading-tight">
                                                <SharingNome sharing={a.sharing} />
                                                {a.operadora && <span className="text-xs"><OperadoraChip operadora={a.operadora} /></span>}
                                            </div>
                                            {a.fornecedor_principal && <div className="mt-1.5 truncate text-xs text-muted-foreground" title={a.fornecedor_principal}>{a.fornecedor_principal}</div>}
                                            {gestor && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={`Gestor ${gestor}`}>Gestor {gestor}</div>}
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <StatusPill status={a.status_operacional} map={STATUS_OPERACIONAL} />
                                            <PendenciasDaLinha a={a} onAnexarPO={() => { setPoModalId(a.id); setPoForm({ numero: '', pdf_url: '' }); }} />
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            {/* Verde ao chegar em 100%: a conclusão é a leitura mais
                                                importante da coluna. O número ao lado garante que a
                                                informação não dependa só da cor. */}
                                            {avanco > 0 ? (
                                                <div className="flex items-center gap-2 pt-1">
                                                    <div className="h-1.5 flex-1 min-w-[52px] rounded-full bg-[hsl(var(--progress-track))] overflow-hidden">
                                                        <div className={`h-full rounded-full ${SOLIDO[avanco >= 100 ? 'green' : tom]}`} style={{ width: `${avanco}%` }} />
                                                    </div>
                                                    <span className="text-xs font-medium w-9 text-right tabular-nums">{Math.round(avanco)}%</span>
                                                </div>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                                            <SaldoDaLinha a={a} />
                                        </td>
                                        <td className="px-3 py-3 align-top">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button type="button" onClick={() => setSelecionadaId(a.id)}
                                                    className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary/60 whitespace-nowrap">
                                                    Abrir
                                                </button>
                                                {ehAdmin && (
                                                    <button type="button" onClick={() => setExcluindo(a)}
                                                        aria-label="Excluir atividade" title="Excluir atividade"
                                                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                                        <Trash2 size={14} aria-hidden />
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
                            <div key={p.id} className={`rounded-xl border border-border border-l-4 ${FAIXA[TOM_MODULO.atividades]} bg-card overflow-hidden`}>
                                <button onClick={() => setProjetoAberto(aberto ? null : p)}
                                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-primary/[0.04]">
                                    <span className={`font-id text-xs ${TEXTO[TOM_MODULO.atividades]}`}>{p.codigo}</span>
                                    <strong className="text-sm">{p.titulo}</strong>
                                    <span className="text-[11px] text-muted-foreground">{r.atividades ?? (p.atividades?.length || 0)} atividade(s)</span>
                                    <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                                        <span className="text-muted-foreground">Receita <Valor v={r.receita} /></span>
                                        <span className="text-muted-foreground">Contratado <Valor v={r.custo_comprometido} /></span>
                                        <span className="text-muted-foreground">Adiantado <Valor v={r.adiantado} /></span>
                                        {/* Enquanto sobrar dinheiro sem dono, a margem por
                                            atividade está incompleta — e é isso que o âmbar diz. */}
                                        {(r.a_ratear || 0) > 0
                                            ? <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn">A ratear {fmtMoeda(r.a_ratear)}</span>
                                            : (r.rateado || 0) > 0 && <span className="rounded-full bg-ok/15 px-2 py-0.5 font-semibold text-ok">Rateado {fmtMoeda(r.rateado)}</span>}
                                    </span>
                                </button>
                                {aberto && (
                                    <div className="border-t border-border">
                                        {(p.atividades || []).map((a: any) => {
                                            // A listagem do projeto pode não trazer status/área; aí
                                            // completa com a linha da carteira, se ela estiver lá.
                                            const daCarteira = atividades.find(x => x.id === a.id);
                                            const status: string | undefined = a.status_operacional || daCarteira?.status_operacional;
                                            const area: string | undefined = a.tipo_demanda || daCarteira?.tipo_demanda;
                                            return (
                                            <button key={a.id} onClick={() => setSelecionadaId(a.id)}
                                                className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-2.5 text-left text-xs last:border-b-0 hover:bg-secondary/30 ${status ? `border-l-4 ${FAIXA[tomStatus(status)]}` : ''}`}>
                                                <span className={`font-id text-xs ${TEXTO[TOM_MODULO.atividades]}`}>{a.codigo}</span>
                                                <span>{a.titulo}</span>
                                                {status && <StatusPill status={status} map={STATUS_OPERACIONAL} />}
                                                <AreaChip tipo={area} />
                                                {a.site && <span className="font-id text-xs text-muted-foreground">{a.site}</span>}
                                                <span className="ml-auto flex items-center gap-x-4 text-[11px] text-muted-foreground">
                                                    <span>Contratado <Valor v={a.custo_comprometido} /></span>
                                                    {(a.custo_rateado || 0) > 0 && <span>Rateado <Valor v={a.custo_rateado} /></span>}
                                                </span>
                                            </button>
                                            );
                                        })}
                                        {(p.atividades || []).length === 0 && (
                                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">Projeto sem atividades. Agrupe pela visão de Lista.</div>
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
                        const tom = tomStatus(statusId);
                        return (
                            <div key={statusId} className="min-w-[280px] w-[280px] flex-shrink-0 bg-card border border-border rounded-xl overflow-hidden">
                                <div className={`px-3.5 py-2.5 ${VEU[tom]} border-t-2 ${TOPO[tom]} border-b border-b-border flex items-center justify-between`}>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${SOLIDO[tom]}`} aria-hidden />
                                        <span className={`text-xs font-semibold ${TEXTO[tom]}`}>{info.label}</span>
                                    </div>
                                    <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${cards.length ? CHIP[tom] : 'text-muted-foreground'}`}
                                        title={`${cards.length} atividade(s)`}>
                                        {cards.length || '—'}
                                    </span>
                                </div>
                                <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                                    {cards.length === 0 && (
                                        <div className="m-1 rounded-lg border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground/80">Nenhuma atividade</div>
                                    )}
                                    {cards.map(a => {
                                        const doc = Math.min(100, a.documentos_percentual || 0);
                                        return (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => setSelecionadaId(a.id)}
                                                className={`text-left bg-secondary/40 hover:bg-secondary/70 border border-border border-l-4 ${FAIXA[tom]} rounded-lg p-3 transition-colors`}
                                            >
                                                {a.id_site_sharing
                                                    ? <div className="font-id text-base font-semibold leading-tight">{a.id_site_sharing}</div>
                                                    : <div className="text-sm text-muted-foreground">Sem Site ID</div>}
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                    {a.id_site_operadora && <span className="font-id">{a.id_site_operadora}</span>}
                                                    <SharingNome sharing={a.sharing} />
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                    <AreaChip tipo={a.tipo_demanda} />
                                                    <OperadoraChip operadora={a.operadora} />
                                                </div>
                                                <div className="mt-1.5 text-sm leading-snug">{a.titulo}</div>
                                                <div className="mt-0.5 font-id text-[11px] text-muted-foreground">{a.codigo}</div>
                                                <PendenciasDaLinha a={a} />
                                                {a.tipo_demanda === 'IMPLANTACAO' && (a.documentos_total || 0) > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-border/70">
                                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                                            <span>Documentação {a.documentos_ok || 0}/{a.documentos_total}</span>
                                                            <span className="tabular-nums">{doc}%</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-[hsl(var(--progress-track))] overflow-hidden">
                                                            <div className={`h-full rounded-full ${(a.documentos_correcao || 0) > 0 ? 'bg-crit' : doc >= 100 ? 'bg-ok' : 'bg-primary'}`} style={{ width: `${doc}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
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
                            <h3 className="text-base font-bold flex items-center gap-2"><FolderPlus size={16} aria-hidden /> Anexar PO</h3>
                            <button type="button" onClick={() => setPoModalId(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden /></button>
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
                            <h3 className="text-lg font-bold">Nova atividade</h3>
                            <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden /></button>
                        </div>
                        {erro && <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">{erro}</div>}
                        <form onSubmit={handleSave} className="flex flex-col gap-4">
                            <Field label="Título *">
                                <input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                                    placeholder="Ex: Implantação BTS — PAPUP2064" className="input" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Tipo de demanda *">
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
                                <Field label="Subtipo de operação">
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
                                <Field label="Tipo de obra">
                                    <select value={form.tipo_obra} onChange={e => setForm(f => ({ ...f, tipo_obra: e.target.value }))} className="input">
                                        <option value="">—</option>
                                        {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Field>
                            </div>
                            {form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' && (
                                <Field label="Tipo de site Highline *">
                                    <select required value={form.tipo_site_highline} onChange={e => setForm(f => ({ ...f, tipo_site_highline: e.target.value }))} className="input">
                                        <option value="">Selecione...</option>
                                        {TIPOS_SITE_HIGHLINE.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Modelo de operação">
                                <select value={form.modelo_operacao} disabled={modelosPermitidos(form.tipo_demanda).length === 1}
                                    onChange={e => setForm(f => ({ ...f, modelo_operacao: e.target.value }))} className="input">
                                    {modelosPermitidos(form.tipo_demanda).map(m => <option key={m} value={m}>{MODELO_OPERACAO_LABEL[m]}</option>)}
                                </select>
                            </Field>
                            <p className="text-[11px] text-muted-foreground -mt-2">
                                {form.tipo_demanda === 'IMPLANTACAO'
                                    ? 'Implantação sempre segue o fluxo completo (Mediante Aprovação).'
                                    : 'Preenchido automaticamente a partir do tipo de demanda — pode trocar manualmente para exceções.'}
                            </p>
                            <Field label="Tipo de atividade">
                                <input value={form.tipo_atividade} onChange={e => setForm(f => ({ ...f, tipo_atividade: e.target.value }))}
                                    placeholder="Ex: Instalação de antena, SPDA, obra civil..." className="input" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Site ID sharing *">
                                    <input value={form.id_site_sharing} onChange={e => setForm(f => ({ ...f, id_site_sharing: e.target.value }))}
                                        placeholder="Ex: PAPUP2064" required className="input" />
                                </Field>
                                <Field label="Site ID operadora *">
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
                            <Field label="Descrição e escopo">
                                <textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="input resize-y" />
                            </Field>
                            <div className="flex justify-end gap-2.5 mt-2">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary/50">Cancelar</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                                    {saving ? 'Criando...' : 'Criar atividade'}
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

/**
 * O que a atividade está devendo, em uma linha cada. Pendente primeiro: é a
 * primeira coisa que se lê depois do status. Sem pendência, não mostra nada.
 */
function PendenciasDaLinha({ a, onAnexarPO }: { a: Atividade; onAnexarPO?: () => void }) {
    const itens: { texto: string; tom: 'warn' | 'crit'; titulo?: string }[] = [];
    if (atrasada(a)) itens.push({ texto: 'Prazo vencido', tom: 'crit', titulo: `Término planejado em ${String(a.data_fim_planejada).slice(0, 10).split('-').reverse().join('/')}` });
    const correcao = a.documentos_correcao || 0;
    if (correcao > 0) itens.push({ texto: `${correcao} ${correcao === 1 ? 'documento' : 'documentos'} em correção`, tom: 'crit' });
    const docsPend = a.documentos_pendentes || 0;
    if (docsPend > 0) itens.push({ texto: `${docsPend} ${docsPend === 1 ? 'documento pendente' : 'documentos pendentes'}`, tom: 'warn' });
    const comp = a.comprovantes_pendentes || 0;
    if (comp > 0) itens.push({ texto: `${comp} ${comp === 1 ? 'comprovante pendente' : 'comprovantes pendentes'}`, tom: 'warn', titulo: 'Pagamento solicitado ou pago sem comprovante anexado' });
    const semPO = !a.po && a.status_operacional !== 'CONCLUIDA';
    if (!itens.length && !semPO && !a.po) return null;
    return (
        <div className="mt-1.5 flex flex-col gap-0.5 text-xs">
            {itens.map(i => (
                <span key={i.texto} title={i.titulo} className={`flex items-center gap-1 font-medium ${i.tom === 'crit' ? 'text-crit' : 'text-warn'}`}>
                    <AlertTriangle size={12} aria-hidden className="shrink-0" />{i.texto}
                </span>
            ))}
            {a.po ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                    PO <span className={`font-id ${PO_STATUS_TOM[a.po.status] || ''}`} title={`PO ${a.po.status.toLowerCase()}`}>{a.po.numero || a.po.status.toLowerCase()}</span>
                </span>
            ) : semPO && (
                onAnexarPO ? (
                    <button type="button" onClick={onAnexarPO}
                        className="flex w-fit items-center gap-1 font-medium text-warn hover:underline">
                        <Paperclip size={12} aria-hidden /> Sem PO. Anexar PO
                    </button>
                ) : <span className="flex items-center gap-1 font-medium text-warn"><Paperclip size={12} aria-hidden />Sem PO</span>
            )}
        </div>
    );
}

/** Saldo neutro; vermelho só quando o custo passou do contrato. Sem contrato, "—". */
function SaldoDaLinha({ a }: { a: Atividade }) {
    if (!a.valor_contrato) {
        return <span className="text-muted-foreground" title={a.custo_pago ? `Sem contrato. Custo pago: ${fmtMoeda(a.custo_pago)}` : 'Sem contrato'}>—</span>;
    }
    const saldo = a.saldo ?? (a.valor_contrato - (a.custo_pago ?? 0));
    return (
        <span className={`font-medium tabular-nums ${saldo < 0 ? 'text-crit' : 'text-foreground'}`}
            title={`Contrato: ${fmtMoeda(a.valor_contrato)}\nCusto pago: ${a.custo_pago ? fmtMoeda(a.custo_pago) : '—'}`}>
            {fmtMoeda(saldo)}
        </span>
    );
}

/** Valor de projeto: zero é ausência, sai como "—". */
function Valor({ v, tom }: { v?: number | null; tom?: string }) {
    if (!v) return <span className="text-muted-foreground">—</span>;
    return <strong className={tom || 'text-foreground'}>{fmtMoeda(v)}</strong>;
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
                    <AlertTriangle size={16} className="text-destructive" aria-hidden /> Excluir atividade
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                    {atividade.id_site_sharing && <span className="font-id text-foreground mr-3">{atividade.id_site_sharing}</span>}
                    <span className="font-id mr-3">{atividade.codigo}</span>
                    <strong className="text-foreground">{atividade.titulo}</strong>
                </p>

                <div className="text-xs bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
                    Serão apagados junto: cronograma, APC, RFI, registro de execução, documentação com os
                    arquivos, POs com os PDFs anexados e as contratações de fornecedor.
                    Orçamentos vinculados não são apagados — apenas desvinculados.
                </div>

                <label htmlFor="motivo-exclusao" className="text-xs font-semibold text-muted-foreground">Motivo da exclusão</label>
                <textarea
                    id="motivo-exclusao"
                    rows={3}
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Ex.: atividade criada em duplicidade; a correta é a ATV-2026-014."
                    className="w-full mt-1 bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-y"
                />
                {curto && motivo.length > 0 && (
                    <div className="text-[11px] text-warn mt-1">Descreva com pelo menos 10 caracteres.</div>
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
