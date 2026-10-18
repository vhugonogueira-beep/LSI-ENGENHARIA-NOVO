import TipoObraCampo, { TIPOS_SITE_PV_HIGHLINE, tipoSiteDaEstrutura } from '../components/atividades/TipoObraCampo';
import { comAtual, useListasClientes } from '../lib/clientesCadastro';
import PagamentosDoProjeto from '../components/atividades/PagamentosDoProjeto';
import { Fragment, useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, LayoutGrid, List as ListIcon, Paperclip, FolderPlus, Trash2, AlertTriangle, HardHat, MapPin, ChevronDown, ChevronRight, FolderOpen, Wallet, Pencil, FolderMinus, Check, CornerDownRight, ArrowUpRight } from 'lucide-react';
import {
    STATUS_OPERACIONAL, TIPOS_DEMANDA, TIPOS_DEMANDA_LABEL, SUBTIPOS_OPERACAO, SUBTIPOS_OPERACAO_LABEL,
    UFS, normalizarUf, MODELO_OPERACAO_LABEL, modeloOperacaoPadrao, modelosPermitidos,
    REGIOES, REGIAO_LABEL, regiaoPorUf, fmtMoeda, StatusPill,
} from '../components/atividades/constants';
import AtividadeCockpit from '../components/atividades/AtividadeCockpit';
import PageHeader from '../components/PageHeader';
import { FiltroPainel, FiltroLinha, GRADE_8, CAMPO, ALTERNADOR, SEGMENTO } from '../components/FiltroPainel';
import { SITUACAO_META, rotuloMes } from '../components/atividades/MetaFaturamentoCard';
import { AreaChip, OperadoraChip, SharingNome } from '../components/atividades/ui';
import { CHIP, TEXTO, SOLIDO, VEU, FAIXA, TOPO, TOM_STATUS, TOM_MODULO, tomDe, type Tom } from '../lib/cores';
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
    // Meta de faturamento (18/10/2026)
    meta_faturamento_mes?: string | null;
    meta_faturamento_valor?: number | null;
    meta_situacao?: string;
    meta_faturado?: number;
    meta_adiamentos?: number;
}

const FORM_INIT = {
    titulo: '', tipo_demanda: 'IMPLANTACAO', subtipo_demanda: '', tipo_obra: '', tipo_atividade: '',
    modelo_operacao: modeloOperacaoPadrao('IMPLANTACAO'), sharing: 'HIGHLINE', operadora: 'VIVO', contrato: '',
    estado: '', municipio: '', id_site_sharing: '', id_site_operadora: '', valor_contrato: '', valor_orcado: '',
    responsavel: '', descricao: '', acionamento_id: '',
};

/** Últimos valores distintos já cadastrados (mais recentes primeiro). */
function ultimosValores(lista: any[], campo: string, qtd = 5): string[] {
    const ordenadas = [...lista].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const vistos = new Set<string>();
    const saida: string[] = [];
    for (const a of ordenadas) {
        const v = String(a[campo] || '').trim();
        if (!v || vistos.has(v.toLowerCase())) continue;
        vistos.add(v.toLowerCase());
        saida.push(v);
        if (saida.length === qtd) break;
    }
    return saida;
}

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
    { id: 'COMPROVANTE_PENDENTE', label: 'Sem comprovante', tom: 'amber', teste: a => (a.comprovantes_pendentes || 0) > 0 },
    { id: 'CONCLUIDAS', label: 'Concluídas', tom: 'green', teste: a => a.status_operacional === 'CONCLUIDA' },
];
const FILTROS_INIT = { situacao: 'TODAS', meta: '', tipo: '', subtipo: '', uf: '', regiao: '', sharing: '', operadora: '', gestor: '' };
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
    const { sharings, operadoras } = useListasClientes();
    const [atividades, setAtividades] = useState<Atividade[]>([]);
    const [loading, setLoading] = useState(true);
    // Vindo de outra tela (ex.: Orçamentos → Abrir): abre direto a atividade pedida.
    const [selecionadaId, setSelecionadaId] = useState<string | null>(() => {
        try { const id = sessionStorage.getItem('ls_abrir_atividade'); sessionStorage.removeItem('ls_abrir_atividade'); return id; } catch { return null; }
    });
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
    // Confirmação do agrupamento (14/10/2026): sem ela, a atividade entrava no
    // projeto mas parecia continuar solta na lista.
    const [avisoProjeto, setAvisoProjeto] = useState('');
    // Gestão do projeto na visão Projetos (12/10/2026): renomear, excluir vazio,
    // tirar atividade; projetos vazios ficam recolhidos num link no fim.
    const [renomeando, setRenomeando] = useState<{ id: string; titulo: string } | null>(null);
    const [mostrarVazios, setMostrarVazios] = useState(false);
    const [erroProjeto, setErroProjeto] = useState('');
    const [search, setSearch] = useState('');
    // Lista com projetos em "cortina" (12/10/2026): as atividades de um projeto ficam
    // recolhidas numa linha só, que abre ao clicar. Agrupamento e cortinas abertas
    // ficam lembrados neste navegador (conveniência; sem storage, começa agrupado e fechado).
    const [agrupar, setAgruparState] = useState<boolean>(() => {
        try { return localStorage.getItem('ls_atividades_agrupar') !== 'nao'; } catch { return true; }
    });
    const setAgrupar = (v: boolean) => {
        setAgruparState(v);
        try { localStorage.setItem('ls_atividades_agrupar', v ? 'sim' : 'nao'); } catch { /* sem storage: só não lembra */ }
    };
    const [abertos, setAbertosState] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('ls_atividades_projetos_abertos') || '[]'); } catch { return []; }
    });
    const setAbertos = (f: (v: string[]) => string[]) => setAbertosState(v => {
        const novo = f(v);
        try { localStorage.setItem('ls_atividades_projetos_abertos', JSON.stringify(novo)); } catch { /* sem storage: só não lembra */ }
        return novo;
    });
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
    // Cadastro único de sites: ao digitar detentora + ID, o formulário procura o
    // site. Achou → UF, município e tipo vêm dele; não achou → vai ser cadastrado.
    const [siteForm, setSiteForm] = useState<{ situacao: 'vazio' | 'buscando' | 'achado' | 'novo'; site?: any; porIdAnterior?: boolean }>({ situacao: 'vazio' });
    // Sites com ID parecido (trecho, qualquer detentora, ID de operadora) enquanto digita.
    const [sugestoesSite, setSugestoesSite] = useState<any[]>([]);
    useEffect(() => {
        if (!showForm) return;
        const id = form.id_site_sharing.replace(/\s+/g, '');
        if (!id || !form.sharing) { setSiteForm({ situacao: 'vazio' }); setSugestoesSite([]); return; }
        setSiteForm({ situacao: 'buscando' });
        let vivo = true;
        const espera = setTimeout(async () => {
            fetch(`/api/sites/sugestoes?q=${encodeURIComponent(id)}`)
                .then(r => (r.ok ? r.json() : []))
                .then(lista => { if (vivo) setSugestoesSite(Array.isArray(lista) ? lista : []); })
                .catch(() => { if (vivo) setSugestoesSite([]); });
            try {
                const r = await fetch(`/api/sites/procurar?id=${encodeURIComponent(id)}&detentora=${encodeURIComponent(form.sharing)}`);
                const achado = r.ok ? await r.json() : null;
                if (!vivo) return;
                if (achado?.site) {
                    const site = achado.site;
                    setSiteForm({ situacao: 'achado', site, porIdAnterior: achado.encontradoPor === 'ID_ANTERIOR' });
                    // O tipo de site vem da estrutura cadastrada, se ainda não foi escolhido.
                    setForm(f => ({ ...f, estado: site.uf || f.estado, municipio: site.cidade || f.municipio, tipo_obra: f.tipo_obra || tipoSiteDaEstrutura(site.tipo_site) }));
                } else {
                    setSiteForm({ situacao: 'novo' });
                }
            } catch {
                if (vivo) setSiteForm({ situacao: 'novo' });
            }
        }, 350);
        return () => { vivo = false; clearTimeout(espera); };
    }, [showForm, form.sharing, form.id_site_sharing]);
    /** Escolher uma sugestão: o site vale pela detentora + ID dele; se o trecho
     * casou com o ID de uma operadora, ela e o ID entram junto. */
    function escolherSite(site: any) {
        const termo = form.id_site_sharing.replace(/\s+/g, '').toUpperCase();
        const casouOperadora = (site.operadoras || []).find((o: any) => o.id_site.includes(termo)
            && !String(site.id_site_detentora || '').includes(termo));
        setForm(f => ({
            ...f,
            sharing: site.detentora || f.sharing,
            id_site_sharing: site.id_site_detentora || site.id_site,
            ...(casouOperadora ? { operadora: casouOperadora.operadora, id_site_operadora: casouOperadora.id_site } : {}),
        }));
        setSugestoesSite([]);
    }
    // Sugestões que não são o próprio site já encontrado.
    const outrasSugestoes = sugestoesSite.filter(s => s.id !== siteForm.site?.id);
    // IDs que a operadora escolhida já tem neste site (sugestão no campo).
    const idsDaOperadora: string[] = (siteForm.site?.operadoras || [])
        .filter((o: any) => o.operadora === form.operadora).map((o: any) => o.id_site);
    // Operadora dona da torre: o ID dela é o da detentora.
    const operadoraEhDetentora = Boolean(form.operadora) && form.operadora === form.sharing;
    useEffect(() => {
        if (operadoraEhDetentora) setForm(f => (f.id_site_operadora === f.id_site_sharing ? f : { ...f, id_site_operadora: f.id_site_sharing }));
    }, [operadoraEhDetentora, form.id_site_sharing]);
    useEffect(() => {
        // Uma operadora com um ID só neste site: preenche sozinho.
        if (!operadoraEhDetentora && idsDaOperadora.length === 1) setForm(f => (f.id_site_operadora ? f : { ...f, id_site_operadora: idsDaOperadora[0] }));
    }, [siteForm.site, form.operadora]);
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
    // A lista e o kanban também precisam dos projetos (cortina e etiqueta).
    useEffect(() => { carregarProjetos(); }, [view, carregarProjetos]);

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
            const destino = await r2.json().catch(() => null);
            const novas = selecionadas.filter(id => !jaNoProjeto.includes(id)).length;
            setAvisoProjeto(`${novas} atividade(s) agrupada(s) em ${destino?.codigo || 'projeto'}${destino?.titulo ? ` — ${destino.titulo}` : ''}. O projeto agora tem ${destino?.atividades?.length ?? finais.length} atividade(s).`);
            setAgrupar(true);
            setAbertos(v => [...new Set([...v, alvo])]);
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
                tipo_atividade: form.tipo_atividade || null,
                acionamento_id: form.acionamento_id || null,
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
            if (form.acionamento_id) {
                const p = projetos.find(x => x.id === form.acionamento_id);
                setAvisoProjeto(`${nova.codigo || 'Atividade'} criada no projeto ${p?.codigo || ''}${p?.titulo ? ` — ${p.titulo}` : ''}.`);
                setAgrupar(true);
                setAbertos(v => [...new Set([...v, form.acionamento_id])]);
                carregarProjetos();
            }
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
            && (!filtros.meta || (filtros.meta === 'REINCIDENTE' ? (a.meta_adiamentos || 0) >= 2
                : filtros.meta.startsWith('MES:') ? a.meta_faturamento_mes === filtros.meta.slice(4)
                : (a.meta_situacao || 'SEM_META') === filtros.meta))
            && (!filtros.uf || uf === filtros.uf)
            && (!filtros.regiao || regiaoPorUf(uf) === filtros.regiao)
            && (!filtros.sharing || a.sharing === filtros.sharing)
            && (!filtros.operadora || a.operadora === filtros.operadora)
            && (!filtros.gestor || (a.gestor || a.responsavel || '') === filtros.gestor);
    });
    const filtradas = semSituacao.filter(situacaoAtual.teste);
    const mesesDeMeta = [...new Set(atividades.map(a => a.meta_faturamento_mes).filter(Boolean) as string[])].sort();

    const historicoTitulos = ultimosValores(atividades, 'titulo');
    const historicoTipos = ultimosValores(atividades, 'tipo_atividade');
    const projetosPorId = new Map<string, any>(projetos.map(p => [p.id, p]));
    const buscaAtiva = search.trim().length > 0;
    // Projetos no topo (os mais recentes primeiro), depois as atividades avulsas.
    // Os filtros valem para as atividades de dentro: o projeto aparece se ao menos
    // uma delas atende.
    const blocos: ({ tipo: 'avulsa'; a: Atividade } | { tipo: 'projeto'; projeto: any; atividades: Atividade[]; total: number })[] = (() => {
        if (!agrupar) return filtradas.map(a => ({ tipo: 'avulsa' as const, a }));
        const porProjeto = new Map<string, Atividade[]>();
        const avulsas: Atividade[] = [];
        for (const a of filtradas) {
            if (a.acionamento_id && projetosPorId.has(a.acionamento_id)) porProjeto.set(a.acionamento_id, [...(porProjeto.get(a.acionamento_id) || []), a]);
            else avulsas.push(a);
        }
        const grupos = [...porProjeto.entries()]
            .map(([id, ats]) => ({ tipo: 'projeto' as const, projeto: projetosPorId.get(id), atividades: ats, total: atividades.filter(x => x.acionamento_id === id).length }))
            .sort((x, y) => String(y.projeto.codigo).localeCompare(String(x.projeto.codigo)));
        return [...grupos, ...avulsas.map(a => ({ tipo: 'avulsa' as const, a }))];
    })();
    const idsProjetosVisiveis = blocos.flatMap(b => (b.tipo === 'projeto' ? [b.projeto.id] : []));

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

            <FiltroPainel>
                {/* Três linhas na mesma grade de 8 colunas (16/10/2026): busca, situação
                    e filtros alinham coluna com coluna. */}
                <FiltroLinha rotulo="Buscar">
                    <div className={GRADE_8}>
                        <div className="relative col-span-2 md:col-span-3 2xl:col-span-6">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
                            <input
                                type="text" placeholder="Código, título ou site" aria-label="Buscar atividades"
                                value={search} onChange={e => setSearch(e.target.value)}
                                className={`${CAMPO} w-full pl-9`}
                            />
                        </div>
                        <div className={`${ALTERNADOR} col-span-2 md:col-span-1 2xl:col-span-2 grid grid-cols-3`} role="group" aria-label="Modo de visualização">
                            <button onClick={() => setView('lista')} className={`${SEGMENTO} ${view === 'lista' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Ver em lista" aria-label="Ver em lista" aria-pressed={view === 'lista'}>
                                <ListIcon size={15} aria-hidden /> Lista
                            </button>
                            <button onClick={() => setView('kanban')} className={`${SEGMENTO} ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Ver em kanban" aria-label="Ver em kanban" aria-pressed={view === 'kanban'}>
                                <LayoutGrid size={15} aria-hidden /> Kanban
                            </button>
                            <button onClick={() => setView('projetos')} className={`${SEGMENTO} ${view === 'projetos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Projetos — atividades agrupadas num orçamento só" aria-pressed={view === 'projetos'}>
                                <FolderPlus size={15} aria-hidden /> Projetos
                            </button>
                        </div>
                    </div>
                </FiltroLinha>

                {view !== 'projetos' && (<>
                    {/* Situação em cartões com o número grande: clicar filtra, clicar de novo volta a Todas. */}
                    <FiltroLinha rotulo="Situação">
                        <div className={GRADE_8}>
                            {SITUACOES.map(s => {
                                const total = semSituacao.filter(s.teste).length;
                                const ativo = filtros.situacao === s.id;
                                const cor = total > 0 && s.tom ? TEXTO[s.tom] : 'text-foreground';
                                return (
                                    <button key={s.id} type="button" aria-pressed={ativo}
                                        onClick={() => setFiltro('situacao', ativo && s.id !== 'TODAS' ? 'TODAS' : s.id)}
                                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${ativo ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background/40 hover:border-primary/50'}`}>
                                        <div className="truncate text-[11px] text-muted-foreground" title={s.label}>{s.label}</div>
                                        <div className={`text-xl font-bold tabular-nums leading-tight ${total ? cor : 'text-muted-foreground'}`}>{total}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </FiltroLinha>

                    {/* Tipo, documentação, local e equipe: oito seletores, um por coluna. */}
                    <FiltroLinha rotulo="Filtros">
                        <div className={GRADE_8}>
                            {/* Tipo e subtipo num seletor só (18/10/2026): o lugar do subtipo virou o filtro de meta. */}
                            <select value={filtros.subtipo ? `${filtros.tipo}:${filtros.subtipo}` : filtros.tipo}
                                onChange={e => { const [tipo, subtipo = ''] = e.target.value.split(':'); setFiltros(f => ({ ...f, tipo, subtipo })); }}
                                aria-label="Tipo de demanda" className={`${CAMPO} w-full`}>
                                <option value="">Todo tipo</option>
                                {TIPOS_DEMANDA.map(t => <option key={t} value={t}>{TIPOS_DEMANDA_LABEL[t] || t}</option>)}
                                <optgroup label="Operação por subtipo">
                                    {SUBTIPOS_OPERACAO.map(s => <option key={s} value={`OPERACAO:${s}`}>Operação · {SUBTIPOS_OPERACAO_LABEL[s]}</option>)}
                                </optgroup>
                            </select>
                            <select value={filtros.meta} onChange={e => setFiltro('meta', e.target.value)} aria-label="Meta de faturamento" className={`${CAMPO} w-full`}>
                                <option value="">Toda meta</option>
                                <option value="VENCE_ESTE_MES">Vence este mês</option>
                                <option value="VENCIDA">Meta vencida</option>
                                <option value="NO_PRAZO">No prazo</option>
                                <option value="CUMPRIDA">Cumprida</option>
                                <option value="REINCIDENTE">Reincidente (2+ adiamentos)</option>
                                <option value="SEM_META">Sem meta</option>
                                {mesesDeMeta.length > 0 && <optgroup label="Por mês">{mesesDeMeta.map(m => <option key={m} value={`MES:${m}`}>Meta {rotuloMes(m)}</option>)}</optgroup>}
                            </select>
                            <select value={documentFilter} onChange={e => setDocumentFilter(e.target.value)} aria-label="Filtrar por documentação" className={`${CAMPO} w-full`}>
                                <option value="TODAS">Documentação</option>
                                <option value="PENDENTES">Com pendências</option>
                                <option value="COMPLETAS">Documentação completa</option>
                                <option value="CORRECAO">Necessita correção</option>
                            </select>
                            <select value={filtros.regiao} onChange={e => setFiltros(f => ({ ...f, regiao: e.target.value, uf: e.target.value && regiaoPorUf(f.uf) !== e.target.value ? '' : f.uf }))} aria-label="Região" className={`${CAMPO} w-full`}>
                                <option value="">Toda região</option>
                                {REGIOES.map(r => <option key={r} value={r}>{REGIAO_LABEL[r]}</option>)}
                            </select>
                            <select value={filtros.uf} onChange={e => setFiltro('uf', e.target.value)} aria-label="UF" className={`${CAMPO} w-full`}>
                                <option value="">Toda UF</option>
                                {ufsNaCarteira.map(([uf, n]) => <option key={uf} value={uf}>{uf} ({n})</option>)}
                            </select>
                            <select value={filtros.sharing} onChange={e => setFiltro('sharing', e.target.value)} aria-label="Sharing" className={`${CAMPO} w-full`}>
                                <option value="">Toda detentora</option>
                                {sharings.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select value={filtros.operadora} onChange={e => setFiltro('operadora', e.target.value)} aria-label="Operadora" className={`${CAMPO} w-full`}>
                                <option value="">Toda operadora</option>
                                {operadoras.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <select value={filtros.gestor} onChange={e => setFiltro('gestor', e.target.value)} aria-label="Gestor" className={`${CAMPO} w-full`} disabled={gestoresNaCarteira.length === 0}>
                                <option value="">Todo gestor</option>
                                {gestoresNaCarteira.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
                            </select>
                        </div>
                    </FiltroLinha>
                </>)}
            </FiltroPainel>

            {avisoProjeto && (
                <div role="status" className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg border border-ok/40 bg-ok/10 text-sm">
                    <span className="flex items-center gap-2"><FolderOpen size={16} aria-hidden className="shrink-0 text-ok" />{avisoProjeto}</span>
                    <button type="button" onClick={() => setAvisoProjeto('')} aria-label="Fechar aviso" className="text-muted-foreground hover:text-foreground"><X size={14} aria-hidden /></button>
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
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span><strong className="font-semibold text-foreground tabular-nums">{filtradas.length}</strong> de {atividades.length} atividade(s)</span>
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                            <input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} /> Agrupar por projeto
                        </label>
                        {agrupar && idsProjetosVisiveis.length > 0 && !buscaAtiva && (<>
                            <button type="button" onClick={() => setAbertos(v => [...new Set([...v, ...idsProjetosVisiveis])])} className="font-semibold text-primary hover:underline">Abrir todos</button>
                            <button type="button" onClick={() => setAbertos(v => v.filter(id => !idsProjetosVisiveis.includes(id)))} className="font-semibold text-primary hover:underline">Recolher todos</button>
                        </>)}
                    </span>
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
                                <th className="px-3 py-2.5 align-middle font-medium" title="Orçamento → PO → Execução → Documentação → Faturamento">Etapa e pendências</th>
                                <th className="px-3 py-2.5 align-middle font-medium">Tipo</th>
                                <th className="px-3 py-2.5 align-middle font-medium text-right">Saldo</th>
                                <th className="px-3 py-2.5 align-middle"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma atividade encontrada.</td></tr>
                            )}
                            {(() => {
                            const linha = (a: Atividade, aninhada = false) => {
                                const avanco = Math.min(100, Math.max(0, a.avanco_percentual ?? 0));
                                const local = [normalizarUf(a.estado) || a.estado, a.municipio].filter(Boolean).join(' / ');
                                const gestor = a.gestor || a.responsavel;
                                const tom = tomStatus(a.status_operacional);
                                return (
                                    // A linha inteira abre a atividade (14/10/2026); caixas, botões e links da linha seguem com a sua ação.
                                    <tr key={a.id} onClick={e => { if (!(e.target as HTMLElement).closest('input,button,a,select,label')) setSelecionadaId(a.id); }}
                                        title="Clique para abrir a atividade"
                                        className={`group cursor-pointer border-b border-border/60 last:border-b-0 border-l-4 ${aninhada ? 'border-l-primary bg-primary/[0.035]' : FAIXA[tom]} hover:bg-secondary/30 transition-colors`}>
                                        {/* Toda célula abre com uma linha de 28px (h-7): Site ID, cliente,
                                            status, avanço, saldo e ações ficam na mesma altura. */}
                                        <td className="px-3 py-2.5 align-top">
                                            <div className="flex h-7 items-center">
                                                <input type="checkbox" checked={selecionadas.includes(a.id)}
                                                    aria-label={`Selecionar ${a.id_site_sharing || a.codigo}`}
                                                    onChange={e => setSelecionadas(v => e.target.checked ? [...v, a.id] : v.filter(id => id !== a.id))}/>
                                            </div>
                                        </td>
                                        {/* O Site ID é a âncora da linha: é por ele que a obra é chamada. */}
                                        <td className={`px-3 py-2.5 align-top ${aninhada ? 'pl-9' : ''}`}>
                                            {/* Dentro do projeto: seta de "pertence a" antes do Site ID. */}
                                            {a.id_site_sharing
                                                ? <div className="flex h-7 items-center gap-1.5 font-id text-base font-semibold text-foreground" title={a.titulo}>{aninhada && <CornerDownRight size={14} aria-label="No projeto" className="-ml-5 shrink-0 text-primary" />}<span className="group-hover:text-primary group-hover:underline underline-offset-4">{a.id_site_sharing}</span>
                                                    <span className="ml-1 hidden items-center gap-0.5 font-sans text-[11px] font-semibold text-primary group-hover:inline-flex">Abrir atividade <ArrowUpRight size={12} aria-hidden /></span></div>
                                                : <div className="flex h-7 items-center gap-1.5 text-sm text-muted-foreground" title={a.titulo}>{aninhada && <CornerDownRight size={14} aria-label="No projeto" className="-ml-5 shrink-0 text-primary" />}Sem Site ID</div>}
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                                {a.id_site_operadora && a.id_site_operadora !== a.id_site_sharing && <span className="font-id">{a.id_site_operadora}</span>}
                                                <span className="font-id">{a.codigo}</span>
                                                {local && <span>· {local}</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 align-top">
                                            {/* Sharing e operadora na mesma linha, como o Site ID ao lado:
                                                a primeira linha de cada coluna é a que se lê de relance. */}
                                            <div className="flex h-7 items-center gap-2">
                                                <SharingNome sharing={a.sharing} />
                                                {a.operadora && <span className="text-xs"><OperadoraChip operadora={a.operadora} /></span>}
                                            </div>
                                            {a.fornecedor_principal && <div className="mt-1.5 truncate text-xs text-muted-foreground" title={a.fornecedor_principal}>{a.fornecedor_principal}</div>}
                                            {gestor && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={`Gestor ${gestor}`}>Gestor {gestor}</div>}
                                        </td>
                                        <td className="px-3 py-2.5 align-top">
                                            <EtapaDaLinha a={a} avanco={avanco} />
                                            <PendenciasDaLinha a={a} onAnexarPO={() => { setPoModalId(a.id); setPoForm({ numero: '', pdf_url: '' }); }} />
                                            {a.meta_faturamento_mes && (
                                                <span title={`Meta de faturamento: ${rotuloMes(a.meta_faturamento_mes)}${a.meta_faturamento_valor ? ` · ${fmtMoeda(a.meta_faturamento_valor)}` : ''} — ${(SITUACAO_META[a.meta_situacao || ''] || SITUACAO_META.SEM_META).rotulo}${(a.meta_adiamentos || 0) >= 2 ? ` · adiada ${a.meta_adiamentos}x` : ''}`}
                                                    className={`mt-1 inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ${(SITUACAO_META[a.meta_situacao || ''] || SITUACAO_META.SEM_META).classe}`}>
                                                    Meta {rotuloMes(a.meta_faturamento_mes)}{(a.meta_adiamentos || 0) >= 2 ? ' · reincidente' : ''}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 align-top">
                                            <div className="flex h-7 items-center"><AreaChip tipo={a.tipo_demanda} /></div>
                                        </td>
                                        <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                                            <div className="flex h-7 items-center justify-end"><SaldoDaLinha a={a} /></div>
                                        </td>
                                        <td className="px-3 py-2.5 align-top">
                                            <div className="flex h-7 items-center justify-end gap-1">
                                                <button type="button" onClick={() => setSelecionadaId(a.id)}
                                                    className="inline-flex h-7 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary/60 whitespace-nowrap">
                                                    Abrir
                                                </button>
                                                {ehAdmin && (
                                                    <button type="button" onClick={() => setExcluindo(a)}
                                                        aria-label="Excluir atividade" title="Excluir atividade"
                                                        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                                        <Trash2 size={14} aria-hidden />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            };
                            const projetoLinha = (b: { projeto: any; atividades: Atividade[]; total: number }) => {
                                const p = b.projeto;
                                const filhos = b.atividades;
                                const aberto = buscaAtiva || abertos.includes(p.id);
                                const alternar = () => setAbertos(v => v.includes(p.id) ? v.filter(id => id !== p.id) : [...v, p.id]);
                                const porStatus = new Map<string, number>();
                                filhos.forEach(a => porStatus.set(a.status_operacional, (porStatus.get(a.status_operacional) || 0) + 1));
                                const soma = (f: (a: Atividade) => number) => filhos.reduce((t, a) => t + f(a), 0);
                                const pend = [
                                    { n: filhos.filter(atrasada).length, texto: (n: number) => `${n} com prazo vencido`, tom: 'text-crit' },
                                    { n: soma(a => a.documentos_correcao || 0), texto: (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} em correção`, tom: 'text-crit' },
                                    { n: soma(a => a.documentos_pendentes || 0), texto: (n: number) => `${n} ${n === 1 ? 'documento pendente' : 'documentos pendentes'}`, tom: 'text-warn' },
                                    { n: filhos.filter(a => !a.po && a.status_operacional !== 'CONCLUIDA').length, texto: (n: number) => `${n} sem PO`, tom: 'text-warn' },
                                    { n: soma(a => a.comprovantes_pendentes || 0), texto: (n: number) => `${n} ${n === 1 ? 'comprovante pendente' : 'comprovantes pendentes'}`, tom: 'text-warn' },
                                ].filter(x => x.n > 0);
                                const r = p.resumo || {};
                                const marcados = filhos.every(a => selecionadas.includes(a.id));
                                return (
                                    <Fragment key={`p-${p.id}`}>
                                        <tr onClick={alternar} className="cursor-pointer border-b border-border/60 border-l-4 border-l-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors">
                                            <td className="px-3 py-3 align-top" onClick={e => e.stopPropagation()}>
                                                <div className="flex h-7 items-center">
                                                    <input type="checkbox" checked={marcados} aria-label={`Selecionar as atividades do projeto ${p.codigo}`}
                                                        onChange={e => setSelecionadas(v => e.target.checked ? [...new Set([...v, ...filhos.map(a => a.id)])] : v.filter(id => !filhos.some(a => a.id === id)))} />
                                                </div>
                                            </td>
                                            <td colSpan={2} className="px-3 py-3 align-top">
                                                <div className="flex h-7 items-center gap-2 min-w-0">
                                                    <button type="button" aria-expanded={aberto} aria-label={`${aberto ? 'Recolher' : 'Abrir'} o projeto ${p.codigo}`}
                                                        onClick={e => { e.stopPropagation(); alternar(); }} className="rounded p-0.5 text-primary hover:bg-primary/15">
                                                        {aberto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                                                    </button>
                                                    <FolderOpen size={16} aria-hidden className="shrink-0 text-primary" />
                                                    <span className="font-id text-xs text-primary">{p.codigo}</span>
                                                    <strong className="truncate text-sm font-semibold" title={p.titulo}>{p.titulo}</strong>
                                                </div>
                                                <div className="mt-1 pl-7 text-xs text-muted-foreground">
                                                    Projeto · {filhos.length === b.total ? `${b.total} atividade(s)` : `${filhos.length} de ${b.total} atividades atendem aos filtros`}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
                                                    {[...porStatus.entries()].map(([st, n]) => (
                                                        <span key={st} className="inline-flex items-center gap-1"><StatusPill status={st} map={STATUS_OPERACIONAL} /><span className="text-xs font-semibold tabular-nums">{n}</span></span>
                                                    ))}
                                                </div>
                                                {pend.length > 0 && (
                                                    <div className="mt-1.5 flex flex-col gap-0.5 text-xs">
                                                        {pend.map(x => <span key={x.tom + x.n + x.texto(x.n)} className={`flex items-center gap-1 font-medium ${x.tom}`}><AlertTriangle size={12} aria-hidden className="shrink-0" />{x.texto(x.n)}</span>)}
                                                    </div>
                                                )}
                                            </td>
                                            <td colSpan={2} className="px-3 py-3 align-top text-right text-xs">
                                                {(r.adiantado || 0) > 0
                                                    ? <div className="flex h-7 items-center justify-end gap-1 text-muted-foreground">Adiantado <strong className="text-foreground">{fmtMoeda(r.adiantado)}</strong></div>
                                                    : <div className="flex h-7 items-center justify-end text-muted-foreground">Sem adiantamento</div>}
                                                {(r.a_ratear || 0) > 0 && <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn">A ratear {fmtMoeda(r.a_ratear)}</span>}
                                            </td>
                                            <td className="px-3 py-3 align-top" onClick={e => e.stopPropagation()}>
                                                <div className="flex h-7 items-center justify-end">
                                                    <button type="button" onClick={() => { setProjetoAberto(p); setView('projetos'); }} title="Adiantamentos e prestação de contas do projeto"
                                                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-secondary/60 whitespace-nowrap">
                                                        <Wallet size={14} aria-hidden /> Pagamentos
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {aberto && filhos.map(a => linha(a, true))}
                                        {aberto && filhos.length > 0 && (
                                            <tr className="border-b border-border border-l-4 border-l-primary bg-primary/[0.06]">
                                                <td colSpan={7} className="px-3 py-1.5 pl-12 text-[11px] text-muted-foreground">
                                                    Fim do projeto <span className="font-id text-primary">{p.codigo}</span> · {filhos.length} atividade(s)
                                                    <button type="button" onClick={alternar} className="ml-3 font-semibold text-primary hover:underline">Recolher</button>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            };
                            return blocos.map(b => (b.tipo === 'projeto' ? projetoLinha(b) : linha(b.a)));
                            })()}
                        </tbody>
                    </table>
                </div>
                </>
            ) : view === 'projetos' ? (
                <div className="flex flex-col gap-3">
                    {erroProjeto && <div role="alert" className="rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{erroProjeto}</div>}
                    {projetos.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                            Nenhum projeto ainda. Na visão de Lista, marque as atividades e use <strong className="text-foreground">Agrupar</strong>.
                        </div>
                    )}
                    {(() => {
                    const qtd = (p: any) => p.resumo?.atividades ?? (p.atividades?.length || 0);
                    const vazios = projetos.filter(p => qtd(p) === 0);
                    const visiveis = mostrarVazios ? projetos : projetos.filter(p => qtd(p) > 0);
                    const renomear = async (p: any) => {
                        if (!renomeando) return;
                        setErroProjeto('');
                        const r = await fetch(`/api/acionamentos/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: renomeando.titulo }) });
                        if (!r.ok) { setErroProjeto((await r.json().catch(() => ({}))).error || 'Erro ao renomear o projeto'); return; }
                        setRenomeando(null);
                        await carregarProjetos();
                    };
                    const excluir = async (p: any) => {
                        if (!confirm(`Excluir o projeto ${p.codigo} — ${p.titulo}? Ele está sem atividades.`)) return;
                        setErroProjeto('');
                        const r = await fetch(`/api/acionamentos/${p.id}`, { method: 'DELETE' });
                        if (!r.ok) { setErroProjeto((await r.json().catch(() => ({}))).error || 'Erro ao excluir o projeto'); return; }
                        if (projetoAberto?.id === p.id) setProjetoAberto(null);
                        await carregarProjetos();
                    };
                    const tirar = async (p: any, a: any) => {
                        if (!confirm(`Tirar ${a.site || a.codigo} do projeto ${p.codigo}? A atividade continua existindo, só deixa de fazer parte do grupo.`)) return;
                        setErroProjeto('');
                        const restantes = (p.atividades || []).filter((x: any) => x.id !== a.id).map((x: any) => x.id);
                        const r = await fetch(`/api/acionamentos/${p.id}/atividades`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atividade_ids: restantes }) });
                        if (!r.ok) { setErroProjeto((await r.json().catch(() => ({}))).error || 'Erro ao tirar a atividade do projeto'); return; }
                        await Promise.all([load(), carregarProjetos()]);
                    };
                    return <>
                    {visiveis.map(p => {
                        const r = p.resumo || {};
                        const aberto = projetoAberto?.id === p.id;
                        const vazio = qtd(p) === 0;
                        const editando = renomeando?.id === p.id;
                        return (
                            <div key={p.id} className={`rounded-xl border border-border border-l-4 ${vazio ? 'border-l-border opacity-80' : FAIXA[TOM_MODULO.atividades]} bg-card overflow-hidden`}>
                                <div className="flex items-center gap-2 pr-3 hover:bg-primary/[0.04]">
                                {editando ? (
                                    <form className="flex flex-1 items-center gap-2 px-4 py-2.5" onSubmit={e => { e.preventDefault(); renomear(p); }}>
                                        <span className={`font-id text-xs ${TEXTO[TOM_MODULO.atividades]}`}>{p.codigo}</span>
                                        <input autoFocus aria-label="Nome do projeto" value={renomeando!.titulo} onChange={e => setRenomeando({ id: p.id, titulo: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Escape') setRenomeando(null); }}
                                            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm" />
                                        <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Check size={14} aria-hidden /> Salvar</button>
                                        <button type="button" onClick={() => setRenomeando(null)} className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                                    </form>
                                ) : (
                                <button onClick={() => setProjetoAberto(aberto ? null : p)}
                                    className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left">
                                    <span className={`font-id text-xs ${TEXTO[TOM_MODULO.atividades]}`}>{p.codigo}</span>
                                    <strong className="text-sm">{p.titulo}</strong>
                                    {vazio
                                        ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Vazio</span>
                                        : <span className="text-[11px] text-muted-foreground">{qtd(p)} atividade(s)</span>}
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
                                )}
                                {!editando && (
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button type="button" onClick={() => setRenomeando({ id: p.id, titulo: p.titulo })} aria-label={`Renomear o projeto ${p.codigo}`} title="Renomear projeto"
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={14} aria-hidden /></button>
                                        {ehAdmin && vazio && (
                                            <button type="button" onClick={() => excluir(p)} aria-label={`Excluir o projeto ${p.codigo}`} title="Excluir projeto (só sem atividades)"
                                                className="rounded-md p-1.5 text-muted-foreground hover:bg-crit/10 hover:text-crit"><Trash2 size={14} aria-hidden /></button>
                                        )}
                                    </div>
                                )}
                                </div>
                                {aberto && (
                                    <div className="border-t border-border">
                                        {(p.atividades || []).map((a: any) => {
                                            // A listagem do projeto pode não trazer status/área; aí
                                            // completa com a linha da carteira, se ela estiver lá.
                                            const daCarteira = atividades.find(x => x.id === a.id);
                                            const status: string | undefined = a.status_operacional || daCarteira?.status_operacional;
                                            const area: string | undefined = a.tipo_demanda || daCarteira?.tipo_demanda;
                                            return (
                                            <div key={a.id} className={`flex items-center border-b border-border/60 pr-3 last:border-b-0 hover:bg-secondary/30 ${status ? `border-l-4 ${FAIXA[tomStatus(status)]}` : ''}`}>
                                            <button onClick={() => setSelecionadaId(a.id)}
                                                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-xs">
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
                                            <button type="button" onClick={() => tirar(p, a)} aria-label={`Tirar ${a.site || a.codigo} do projeto`} title="Tirar do projeto (a atividade continua existindo)"
                                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-warn/10 hover:text-warn"><FolderMinus size={14} aria-hidden /></button>
                                            </div>
                                            );
                                        })}
                                        {(p.atividades || []).length === 0 && (
                                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">Projeto sem atividades. Agrupe pela visão de Lista{ehAdmin ? ' ou exclua o projeto pela lixeira acima' : ''}.</div>
                                        )}
                                        <PagamentosDoProjeto projeto={{ id: p.id, codigo: p.codigo, titulo: p.titulo }} onMudou={carregarProjetos} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {vazios.length > 0 && (
                        <button type="button" onClick={() => setMostrarVazios(v => !v)} className="self-start text-xs font-semibold text-primary hover:underline">
                            {mostrarVazios ? 'Esconder projetos vazios' : `Mostrar ${vazios.length} projeto(s) vazio(s)`}
                        </button>
                    )}
                    </>;
                    })()}
                </div>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {KANBAN_ORDEM.map(statusId => {
                        const cards = filtradas.filter(a => a.status_operacional === statusId);
                        const info = STATUS_OPERACIONAL[statusId];
                        const tom = tomStatus(statusId);
                        return (
                            <div key={statusId} className="min-w-[260px] flex-1 basis-0 bg-card border border-border rounded-xl overflow-hidden">
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
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                                    <span className="font-id">{a.codigo}</span>
                                                    {a.acionamento_id && projetosPorId.get(a.acionamento_id) && (
                                                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-id text-primary" title={`Projeto ${projetosPorId.get(a.acionamento_id).titulo}`}>
                                                            <FolderOpen size={12} aria-hidden /> {projetosPorId.get(a.acionamento_id).codigo}
                                                        </span>
                                                    )}
                                                </div>
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
                                    list="historico-titulos" autoComplete="off"
                                    placeholder="Ex: Implantação BTS — PAPUP2064" className="input" />
                                {/* Últimos 5 títulos cadastrados: clique no campo para escolher. */}
                                <datalist id="historico-titulos">{historicoTitulos.map(v => <option key={v} value={v} />)}</datalist>
                            </Field>
                            <Field label="Projeto (grupo)">
                                <select value={form.acionamento_id} onChange={e => setForm(f => ({ ...f, acionamento_id: e.target.value }))} className="input">
                                    <option value="">Sem projeto — atividade avulsa</option>
                                    {projetos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.titulo}</option>)}
                                </select>
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
                                <Field label="Tipo de site">
                                    <TipoObraCampo className="input" value={form.tipo_obra} onChange={v => setForm(f => ({ ...f, tipo_obra: v }))} />
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
                            {/* Site: cadastro único pela detentora + ID (03/10/2026). */}
                            <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
                                <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground"><MapPin size={13} aria-hidden /> Site</legend>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Detentora *">
                                        <select value={form.sharing} onChange={e => setForm(f => ({ ...f, sharing: e.target.value }))} className="input">
                                            {comAtual(sharings, form.sharing).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="ID do site na detentora *">
                                        <input value={form.id_site_sharing} onChange={e => setForm(f => ({ ...f, id_site_sharing: e.target.value.toUpperCase() }))}
                                            placeholder="Ex: PAMRB008" required className="input font-id" />
                                    </Field>
                                </div>
                                {siteForm.situacao === 'buscando' && <p className="text-xs text-muted-foreground">Procurando o site…</p>}
                                {siteForm.situacao === 'achado' && (
                                    <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
                                        Site já cadastrado{siteForm.porIdAnterior ? ` (hoje ${siteForm.site.detentora} ${siteForm.site.id_site_detentora})` : ''}
                                        {' — '}{siteForm.site.cidade || '—'}/{siteForm.site.uf || '—'}
                                        {siteForm.site.tipo_site ? ` · ${siteForm.site.tipo_site}` : ''}
                                        {` · ${siteForm.site._count?.atividades ?? 0} atividade(s) anterior(es)`}
                                    </p>
                                )}
                                {siteForm.situacao !== 'achado' && outrasSugestoes.length > 0 && (
                                    <div className="rounded-lg border border-border bg-background/40">
                                        <p className="border-b border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">Sites com ID parecido — clique para usar</p>
                                        <ul className="max-h-48 overflow-y-auto">
                                            {outrasSugestoes.map(s => (
                                                <li key={s.id}>
                                                    <button type="button" onClick={() => escolherSite(s)}
                                                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left text-xs hover:bg-secondary/60">
                                                        <span className="font-semibold">{s.detentora || 'Sem detentora'}</span>
                                                        <span className="font-id font-semibold">{s.id_site_detentora || s.id_site}</span>
                                                        {(s.operadoras || []).map((o: any) => (
                                                            <span key={o.id} className="font-id text-muted-foreground">{o.operadora} {o.id_site}</span>
                                                        ))}
                                                        <span className="ml-auto text-muted-foreground">{s.cidade || '—'}/{s.uf || '—'}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {siteForm.situacao === 'novo' && (
                                    <p className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs text-info">
                                        {outrasSugestoes.length > 0 ? `Nenhum site ${form.sharing} com o ID exato ${form.id_site_sharing}. Se não for um dos parecidos acima, ` : 'Site novo — '}será cadastrado com a UF e o município abaixo. Endereço, coordenadas e proprietário se completam depois, na tela Sites.
                                    </p>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Operadora">
                                        <select value={form.operadora} onChange={e => setForm(f => ({ ...f, operadora: e.target.value, id_site_operadora: '' }))} className="input">
                                            {comAtual(operadoras, form.operadora).map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="ID do site na operadora *">
                                        <input value={form.id_site_operadora} onChange={e => setForm(f => ({ ...f, id_site_operadora: e.target.value.toUpperCase() }))}
                                            list="ids-operadora-site" disabled={operadoraEhDetentora}
                                            placeholder={idsDaOperadora.length ? `Já cadastrado: ${idsDaOperadora.join(', ')}` : 'Ex: PAMBA48'} required className="input font-id" />
                                        <datalist id="ids-operadora-site">{idsDaOperadora.map(i => <option key={i} value={i} />)}</datalist>
                                    </Field>
                                </div>
                                {operadoraEhDetentora && <p className="-mt-1 text-[11px] text-muted-foreground">A operadora é a dona da torre: o ID dela é o da detentora.</p>}
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={`UF${siteForm.situacao !== 'achado' ? ' *' : ''}`}>
                                        <select
                                            value={form.estado}
                                            onChange={e => setForm(f => ({ ...f, estado: e.target.value, municipio: e.target.value === f.estado ? f.municipio : '' }))}
                                            required={siteForm.situacao !== 'achado'} disabled={siteForm.situacao === 'achado'}
                                            className="input"
                                        >
                                            <option value="">— Selecione —</option>
                                            {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
                                        </select>
                                    </Field>
                                    <Field label={`Município${siteForm.situacao !== 'achado' ? ' *' : ''}`}>
                                        {siteForm.situacao === 'achado'
                                            ? <input value={form.municipio} disabled className="input" />
                                            : <MunicipioInput uf={form.estado} value={form.municipio} className="input"
                                                onChange={nome => setForm(f => ({ ...f, municipio: nome }))} />}
                                    </Field>
                                </div>
                            </fieldset>
                            {form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' && form.tipo_obra && !TIPOS_SITE_PV_HIGHLINE.includes(form.tipo_obra) && (
                                <p className="-mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                                    Implantação Highline precisa de um tipo de site aceito pela PV: BTS, Roof Top, Collo - BTS, Collo RT ou Reforço / fundação.
                                </p>
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
                                    list="historico-tipos" autoComplete="off"
                                    placeholder="Ex: Instalação de antena, SPDA, obra civil..." className="input" />
                                <datalist id="historico-tipos">{historicoTipos.map(v => <option key={v} value={v} />)}</datalist>
                            </Field>
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
/** As cinco etapas da obra, cada uma concluída ou não (proposta 2, 15/10/2026). */
const ETAPAS: { nome: string; feita: (a: Atividade) => boolean }[] = [
    { nome: 'Orçamento aprovado', feita: a => a.status_comercial === 'APROVADO' },
    { nome: 'PO recebida', feita: a => !!a.po },
    { nome: 'Execução concluída', feita: a => a.status_operacional === 'CONCLUIDA' || (a.avanco_percentual ?? 0) >= 100 },
    { nome: 'Documentação completa', feita: a => a.status_documental === 'COMPLETO' },
    { nome: 'Faturada', feita: a => ['NF_EMITIDA', 'FATURADO', 'RECEBIDO'].includes(String((a as any).status_faturamento || '')) },
];

function EtapaDaLinha({ a, avanco }: { a: Atividade; avanco: number }) {
    const feitas = ETAPAS.map(e => e.feita(a));
    const status = STATUS_OPERACIONAL[a.status_operacional]?.label || a.status_operacional;
    return (
        <div className="flex h-7 items-center gap-2" title={ETAPAS.map((e, i) => `${feitas[i] ? '✓' : '·'} ${e.nome}`).join('\n')}>
            <div className="flex gap-0.5" aria-label={`${feitas.filter(Boolean).length} de 5 etapas concluídas`}>
                {feitas.map((f, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${f ? 'bg-primary' : 'bg-[hsl(var(--progress-track))]'}`} />)}
            </div>
            <span className="truncate text-xs text-foreground/85">{status}{avanco > 0 && avanco < 100 ? ` ${Math.round(avanco)}%` : ''}</span>
        </div>
    );
}

/** Pendências em etiquetas curtas: cabem numa linha e se leem de relance. */
function PendenciasDaLinha({ a, onAnexarPO }: { a: Atividade; onAnexarPO?: () => void }) {
    const itens: { texto: string; tom: 'warn' | 'crit'; titulo: string }[] = [];
    if (atrasada(a)) itens.push({ texto: 'Prazo vencido', tom: 'crit', titulo: `Término planejado em ${String(a.data_fim_planejada).slice(0, 10).split('-').reverse().join('/')}` });
    const correcao = a.documentos_correcao || 0;
    if (correcao > 0) itens.push({ texto: `${correcao} correção`, tom: 'crit', titulo: `${correcao} documento(s) em correção` });
    const docsPend = a.documentos_pendentes || 0;
    if (docsPend > 0) itens.push({ texto: `${docsPend} doc.`, tom: 'warn', titulo: `${docsPend} documento(s) pendente(s)` });
    const comp = a.comprovantes_pendentes || 0;
    if (comp > 0) itens.push({ texto: `${comp} comprov.`, tom: 'crit', titulo: 'Pagamento solicitado ou pago sem comprovante anexado' });
    const semPO = !a.po && a.status_operacional !== 'CONCLUIDA';
    if (!itens.length && !semPO && !a.po) return null;
    const etiqueta = (tom: 'warn' | 'crit') => `inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ${tom === 'crit' ? 'bg-crit/15 text-crit' : 'bg-warn/15 text-warn'}`;
    return (
        <div className="mt-1 flex flex-wrap items-center gap-1">
            {semPO && (onAnexarPO
                ? <button type="button" onClick={onAnexarPO} title="Anexar a PO" className={`${etiqueta('warn')} hover:underline`}><Paperclip size={11} aria-hidden />Sem PO</button>
                : <span className={etiqueta('warn')}>Sem PO</span>)}
            {itens.map(i => <span key={i.texto} title={i.titulo} className={etiqueta(i.tom)}>{i.texto}</span>)}
            {a.po && <span className="text-[11px] text-muted-foreground">PO <span className={`font-id ${PO_STATUS_TOM[a.po.status] || ''}`} title={`PO ${a.po.status.toLowerCase()}`}>{a.po.numero || a.po.status.toLowerCase()}</span></span>}
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
