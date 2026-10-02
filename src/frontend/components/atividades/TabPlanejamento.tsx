import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Download, List, BarChart3, FolderPlus, Save, ChevronUp, ChevronDown } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, EmptyState } from './ui';
import { fmtData } from './constants';

// Blueprint LSI, seção 17 — o cronograma é a ÚNICA tela de acompanhamento da obra.
// APC e RFI não são abas separadas: são etapas daqui. Concluir a etapa de LIBERACAO
// gera o APC liberado (destrava a execução) e a de INSTALACAO/RFI gera o RFI (que decide
// o caminho da regra de faturamento). O avanço físico da atividade é a média do
// progresso das etapas, igual ao cronograma impresso enviado ao cliente.
/**
 * Meia-noite UTC do dia de hoje no calendário local. As datas do cronograma são
 * gravadas e exibidas em UTC (ver `fmtData`); comparar em horário local jogaria
 * tudo um dia para trás no fuso brasileiro.
 */
function inicioDeHojeUTC(): number {
    const a = new Date();
    return Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
}

function diasDeAtraso(dataFim: string | Date): string {
    const dias = Math.round((inicioDeHojeUTC() - new Date(dataFim).getTime()) / 86400000);
    if (dias <= 0) return 'vence hoje';
    return dias === 1 ? '1 dia atrás' : `${dias} dias atrás`;
}

const CATEGORIAS = [
    'LIBERACAO', 'PRE_OBRA', 'CIVIL', 'ENERGIA', 'ESTRUTURA', 'INSTALACAO',
    'COMPRA', 'CONTRATACAO', 'PAGAMENTO', 'LOGISTICA', 'MOBILIZACAO',
    'EXECUCAO', 'RFI', 'DOCUMENTACAO', 'MEDICAO', 'FATURAMENTO', 'OUTROS',
];
const CATEGORIA_LABEL: Record<string, string> = {
    LIBERACAO: 'Liberação (APC)', PRE_OBRA: 'Pré-obra', CIVIL: 'Civil', ENERGIA: 'Energia',
    ESTRUTURA: 'Estrutura', INSTALACAO: 'Instalação (RFI)', COMPRA: 'Compra',
    CONTRATACAO: 'Contratação', PAGAMENTO: 'Pagamento', LOGISTICA: 'Logística',
    MOBILIZACAO: 'Mobilização', EXECUCAO: 'Execução', RFI: 'RFI',
    DOCUMENTACAO: 'Documentação', MEDICAO: 'Medição', FATURAMENTO: 'Faturamento', OUTROS: 'Outros',
};
const CATEGORIA_COR: Record<string, string> = {
    LIBERACAO: '#22C55E', PRE_OBRA: '#8B5CF6', CIVIL: '#0F4EA3', ENERGIA: '#ea580c',
    ESTRUTURA: '#22C55E', INSTALACAO: '#0891b2', RFI: '#0891b2', EXECUCAO: '#0F4EA3',
    LOGISTICA: '#8B5CF6', MOBILIZACAO: '#8B5CF6',
};
const corDaEtapa = (c: string) => CATEGORIA_COR[c] || '#64748b';

const CATEGORIAS_APC = ['LIBERACAO', 'APC'];
const CATEGORIAS_RFI = ['INSTALACAO', 'RFI'];

const STATUS_OPTS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO'];
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA'];
// Tokens de estado (index.css), não hex.
const STATUS_TOM: Record<string, string> = { PENDENTE: 'bg-muted text-muted-foreground', EM_ANDAMENTO: 'bg-warn/15 text-warn', CONCLUIDO: 'bg-ok/15 text-ok', ATRASADO: 'bg-crit/15 text-crit' };
const STATUS_ROTULO: Record<string, string> = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', ATRASADO: 'Atrasado' };
const PRIORIDADE_TOM: Record<string, string> = { BAIXA: 'text-muted-foreground', MEDIA: 'text-foreground', ALTA: 'text-crit' };
const PRIORIDADE_ROTULO: Record<string, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' };

const FORM_INIT = {
    titulo: '', categoria: 'CIVIL', grupo: '', responsavel: '', data_inicio: '', data_fim: '',
    duracao_dias: '', prioridade: 'MEDIA', progresso_percentual: '0', observacoes: '', visivel_cliente: true,
};

const DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function diaUTC(iso: string): Date {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "2026-09-10" (valor do input date) → meia-noite UTC, mesmo critério do backend.
function doInput(valor: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const [a, m, d] = valor.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
}

function hojeUTC(): Date {
    const h = new Date();
    return new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
}

// Duração em dias corridos, contando início e fim (15/07 a 31/08 = 48 dias).
function calcularDuracao(inicio: string, fim: string): number | null {
    const i = doInput(inicio); const f = doInput(fim);
    if (!i || !f || f < i) return null;
    return Math.round((f.getTime() - i.getTime()) / 86400000) + 1;
}

// Progresso sugerido pelo tempo já decorrido: etapa no passado vem 100%, no futuro 0%,
// e em andamento proporcional aos dias corridos. É sugestão — dá para ajustar no slider.
function calcularProgresso(inicio: string, fim: string): number | null {
    const i = doInput(inicio); const f = doInput(fim);
    if (!i || !f || f < i) return null;
    const hoje = hojeUTC();
    if (hoje >= f) return 100;
    if (hoje < i) return 0;
    const total = (f.getTime() - i.getTime()) / 86400000 + 1;
    const decorridos = (hoje.getTime() - i.getTime()) / 86400000 + 1;
    return Math.max(0, Math.min(100, Math.round((decorridos / total) * 100)));
}
/**
 * Avanço que a etapa DEVERIA ter hoje, olhando só as datas planejadas.
 *
 * É o Tema 2 do fluxo: 10/09 a 15/09 são seis dias, logo ~17% por dia. Não
 * substitui o avanço informado — serve para comparar. Etapa sem data planejada
 * devolve o próprio avanço real, para entrar neutra na média e não inventar um
 * desvio que ninguém pode explicar.
 */
function previstoDoItem(item: any): number {
    const real = Math.max(0, Math.min(100, item.progresso_percentual || 0));
    if (!item.data_inicio || !item.data_fim) return real;
    const dia = (v: any) => String(v).slice(0, 10);
    const p = calcularProgresso(dia(item.data_inicio), dia(item.data_fim));
    return p === null ? real : p;
}

function addDias(d: Date, n: number): Date {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + n);
    return r;
}

export default function TabPlanejamento({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [itens, setItens] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [vista, setVista] = useState<'lista' | 'gantt'>('lista');
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(FORM_INIT);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    // Ao concluir a etapa de RFI o motor de faturamento precisa saber a condição de energia.
    const [rfiPendente, setRfiPendente] = useState<{ item: any } | null>(null);
    // Conferência de etapas vencidas: a data passou, mas quem diz o que aconteceu
    // é a pessoa. O calendário levanta a pergunta e não responde por ela.
    const [conferindo, setConferindo] = useState<any | null>(null);
    const [adiadas, setAdiadas] = useState<string[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/cronograma?atividade_id=${atividade.id}`);
            setItens(r.ok ? await r.json() : []);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    // Uma etapa vence quando o dia previsto ACABA — por isso a comparação é com
    // o fim de hoje, e não com o instante atual. Etapa de um dia só entra na
    // fila no dia seguinte, não na manhã em que começa.
    const vencidas = useMemo(() => {
        const limite = inicioDeHojeUTC();
        return itens.filter(i =>
            i.data_fim
            && new Date(i.data_fim).getTime() < limite
            && i.status !== 'CONCLUIDO'
            && !adiadas.includes(i.id),
        );
    }, [itens, adiadas]);

    const avanco = itens.length
        ? Math.round(itens.reduce((acc, i) => acc + (i.progresso_percentual || 0), 0) / itens.length)
        : 0;
    // Mesma média, mesmas etapas — só trocando o avanço informado pelo que as
    // datas planejadas prometiam. A diferença entre os dois é o desvio da obra.
    const previsto = itens.length
        ? Math.round(itens.reduce((acc, i) => acc + previstoDoItem(i), 0) / itens.length)
        : 0;
    const desvio = avanco - previsto;
    // O Gantt e o documento mostram só o que vai para o cliente; a lista mostra tudo.
    const noDocumento = itens.filter(i => i.visivel_cliente !== false);

    // Mudar as datas recalcula duração e progresso — uma etapa cujo período já passou
    // entra concluída, e uma em andamento entra com o percentual proporcional aos dias.
    function aplicarDatas(inicio: string, fim: string) {
        setForm(f => {
            const duracao = calcularDuracao(inicio, fim);
            const progresso = calcularProgresso(inicio, fim);
            return {
                ...f,
                data_inicio: inicio,
                data_fim: fim,
                duracao_dias: duracao != null ? String(duracao) : f.duracao_dias,
                progresso_percentual: progresso != null ? String(progresso) : f.progresso_percentual,
            };
        });
    }

    function openNew() {
        setEditId(null);
        setForm(FORM_INIT);
        setShowForm(true);
    }
    function openEdit(item: any) {
        setEditId(item.id);
        setForm({
            titulo: item.titulo, categoria: item.categoria, grupo: item.grupo || '',
            responsavel: item.responsavel || '',
            data_inicio: item.data_inicio ? item.data_inicio.substring(0, 10) : '',
            data_fim: item.data_fim ? item.data_fim.substring(0, 10) : '',
            duracao_dias: item.duracao_dias != null ? String(item.duracao_dias) : '',
            prioridade: item.prioridade,
            progresso_percentual: String(item.progresso_percentual ?? 0),
            observacoes: item.observacoes || '',
            visivel_cliente: item.visivel_cliente !== false,
        });
        setShowForm(true);
    }

    async function salvar() {
        setSalvando(true);
        setErro('');
        try {
            const payload = {
                ...form,
                atividade_id: atividade.id,
                grupo: form.grupo || null,
                progresso_percentual: parseFloat(form.progresso_percentual) || 0,
                duracao_dias: form.duracao_dias ? parseInt(form.duracao_dias) : null,
                data_inicio: form.data_inicio || null,
                data_fim: form.data_fim || null,
                responsavel: form.responsavel || null,
                observacoes: form.observacoes || null,
            };
            const r = await fetch(editId ? `/api/cronograma/${editId}` : '/api/cronograma', {
                method: editId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar etapa');
            setShowForm(false);
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function mudarStatus(item: any, status: string, extras: Record<string, any> = {}) {
        // Concluir a etapa de RFI exige a condição de energia antes de gravar.
        if (status === 'CONCLUIDO' && item.status !== 'CONCLUIDO'
            && CATEGORIAS_RFI.includes(item.categoria) && extras.rfi_energizado === undefined) {
            setRfiPendente({ item });
            return;
        }
        setErro('');
        const r = await fetch(`/api/cronograma/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, ...extras }),
        });
        if (!r.ok) {
            setErro((await r.json()).error || 'Erro ao atualizar etapa');
            return;
        }
        setRfiPendente(null);
        await load();
        onRefresh();
    }

    // Marca se a etapa entra no cronograma entregue ao cliente. Etapas de controle
    // interno (negociação, envio/recebimento da PV) ficam aqui mas fora do documento.
    async function mudarVisibilidade(id: string, visivel: boolean) {
        await fetch(`/api/cronograma/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visivel_cliente: visivel }),
        });
        await load();
    }

    async function mover(id: string, direcao: 'cima' | 'baixo') {
        await fetch(`/api/cronograma/${id}/mover`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direcao }),
        });
        await load();
    }

    // Traz as etapas padrão de obra. Só entram as que ainda não existem no cronograma.
    async function aplicarModelo() {
        setErro('');
        const inicio = prompt(
            'Data de início da primeira etapa (dd/mm/aaaa).\n'
            + 'Deixe em branco para trazer as etapas sem datas e preencher depois.',
            '',
        );
        if (inicio === null) return;

        let dataISO: string | null = null;
        if (inicio.trim()) {
            const m = inicio.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (!m) { setErro('Data inválida — use o formato dd/mm/aaaa.'); return; }
            dataISO = `${m[3]}-${m[2]}-${m[1]}`;
        }

        const r = await fetch(`/api/cronograma/atividades/${atividade.id}/aplicar-modelo`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data_inicio: dataISO }),
        });
        const data = await r.json();
        if (!r.ok) { setErro(data.error || 'Erro ao aplicar o modelo'); return; }
        if (data.criados === 0) setErro(data.mensagem || 'Nada a adicionar');
        await load();
        onRefresh();
    }

    async function salvarComoModelo() {
        if (!confirm('Salvar este cronograma como modelo padrão? O modelo anterior será substituído.')) return;
        setErro('');
        const r = await fetch(`/api/cronograma/atividades/${atividade.id}/salvar-modelo`, { method: 'POST' });
        const data = await r.json();
        if (!r.ok) { setErro(data.error || 'Erro ao salvar o modelo'); return; }
        setErro(`Modelo salvo com ${data.etapas} etapa(s) — será oferecido nas próximas atividades.`);
    }

    async function mudarProgresso(id: string, progresso: number) {
        await fetch(`/api/cronograma/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progresso_percentual: progresso }),
        });
        await load();
        onRefresh();
    }

    async function excluir(id: string) {
        if (!confirm('Excluir esta etapa do cronograma?')) return;
        await fetch(`/api/cronograma/${id}`, { method: 'DELETE' });
        await load();
        onRefresh();
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    return (
        <div>
            <ErrorBanner message={erro} />

            {vencidas.length > 0 && (
                <div className="mb-4 rounded-xl border border-warn/50 bg-warn/10 p-4">
                    <div className="text-sm font-bold text-warn">
                        {vencidas.length === 1
                            ? '1 etapa venceu e precisa de confirmação'
                            : `${vencidas.length} etapas venceram e precisam de confirmação`}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        A data prevista passou. O avanço não é alterado enquanto você não disser o que aconteceu.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                        {vencidas.map(item => (
                            <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2">
                                <span className="text-xs font-semibold">{item.titulo}</span>
                                <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                    <span>Previsto {fmtData(item.data_fim)}</span>
                                    <span className="text-warn">{diasDeAtraso(item.data_fim)}</span>
                                    <span>{Math.round(item.progresso_percentual || 0)}%</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setConferindo(item)}
                                    className="ml-auto h-7 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
                                >
                                    Conferir etapa
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Card
                title="Cronograma de obra"
                action={
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 mr-1">
                            <button type="button" onClick={() => setVista('lista')} title="Ver em lista" aria-label="Ver em lista" aria-pressed={vista === 'lista'}
                                className={`p-1.5 rounded ${vista === 'lista' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                <List size={14} aria-hidden />
                            </button>
                            <button type="button" onClick={() => setVista('gantt')} title="Ver em Gantt" aria-label="Ver em Gantt" aria-pressed={vista === 'gantt'}
                                className={`p-1.5 rounded ${vista === 'gantt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                <BarChart3 size={14} aria-hidden />
                            </button>
                        </div>
                        <GhostButton onClick={aplicarModelo}>
                            <FolderPlus size={14} className="inline mr-1" aria-hidden />Aplicar etapas padrão
                        </GhostButton>
                        {itens.length > 0 && (
                            <GhostButton onClick={salvarComoModelo}>
                                <Save size={14} className="inline mr-1" aria-hidden />Salvar como modelo
                            </GhostButton>
                        )}
                        <a href={`/api/cronograma/atividades/${atividade.id}/export/html`} target="_blank" rel="noreferrer"
                            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-secondary">
                            <Download size={14} aria-hidden />Baixar cronograma
                        </a>
                        <PrimaryButton onClick={openNew}><Plus size={14} className="inline mr-1" aria-hidden />Nova etapa</PrimaryButton>
                    </div>
                }
            >
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                        <div className="text-[11px] text-muted-foreground mb-1">Avanço físico — média das etapas</div>
                        {/* O traço vertical é o previsto pelas datas. Barra à esquerda
                            dele significa obra atrasada em relação ao planejado. */}
                        <div className="relative h-2 rounded-full bg-[var(--progress-track)] overflow-hidden">
                            <div className="h-full bg-ok transition-all" style={{ width: `${avanco}%` }} />
                            {itens.length > 0 && (
                                <div
                                    className="absolute top-0 h-full w-0.5 bg-foreground/60"
                                    style={{ left: `calc(${previsto}% - 1px)` }}
                                    title={`Previsto pelas datas: ${previsto}%`}
                                />
                            )}
                        </div>
                    </div>
                    <div className="text-lg font-bold">{avanco}%</div>
                </div>
                {itens.length > 0 && (
                    <div className="mb-2 text-[11px] text-muted-foreground">
                        Previsto pelas datas: <span className="font-semibold text-foreground">{previsto}%</span>
                        {desvio === 0 ? (
                            <span className="ml-3">Em dia</span>
                        ) : (
                            <span className={`ml-3 ${desvio > 0 ? 'text-ok' : 'text-warn'}`}>
                                {desvio > 0 ? 'Adiantado' : 'Atrasado'} {Math.abs(desvio)} p.p.
                            </span>
                        )}
                    </div>
                )}
                {itens.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mb-4">
                        {noDocumento.length} de {itens.length} etapa(s) entram no cronograma do cliente
                        {noDocumento.length < itens.length && (
                            <span className="ml-3">{itens.length - noDocumento.length} marcada(s) como controle interno</span>
                        )}
                    </div>
                )}

                {itens.length === 0 ? (
                    <EmptyState text="Nenhuma etapa cadastrada. Adicione as etapas da obra (APC, pré-obra, civil, energia, estrutura, RFI...)." />
                ) : vista === 'lista' ? (
                    <ListaEtapas
                        itens={itens}
                        onEdit={openEdit}
                        onExcluir={excluir}
                        onStatus={mudarStatus}
                        onProgresso={mudarProgresso}
                        onVisibilidade={mudarVisibilidade}
                        onMover={mover}
                    />
                ) : (
                    <Gantt itens={noDocumento} />
                )}
            </Card>

            {showForm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-base font-bold mb-4">{editId ? 'Editar etapa' : 'Nova etapa do cronograma'}</h3>
                        <div className="flex flex-col gap-3">
                            <Field label="Título">
                                <input className={inputClass} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Execução de obra civil" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Etapa">
                                    <select className={inputClass} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                                        {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABEL[c] || c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Grupo (opcional)">
                                    <input className={inputClass} value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} placeholder="Ex: Sentido Leste" />
                                </Field>
                                <Field label="Início"><input type="date" className={inputClass} value={form.data_inicio} onChange={e => aplicarDatas(e.target.value, form.data_fim)} /></Field>
                                <Field label="Término"><input type="date" className={inputClass} value={form.data_fim} onChange={e => aplicarDatas(form.data_inicio, e.target.value)} /></Field>
                                <Field label={`Progresso: ${form.progresso_percentual}%`}>
                                    <input type="range" min={0} max={100} step={5} className="w-full accent-primary" value={form.progresso_percentual} onChange={e => setForm(f => ({ ...f, progresso_percentual: e.target.value }))} />
                                </Field>
                                <Field label="Prioridade">
                                    <select className={inputClass} value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}>
                                        {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDADE_ROTULO[p] || p}</option>)}
                                    </select>
                                </Field>
                                <Field label="Duração (dias)"><input type="number" className={inputClass} value={form.duracao_dias} onChange={e => setForm(f => ({ ...f, duracao_dias: e.target.value }))} /></Field>
                                <Field label="Responsável"><input className={inputClass} value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} /></Field>
                            </div>
                            <Field label="Observações (entram no documento do cronograma)">
                                <textarea rows={2} className={`${inputClass} resize-y`} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                            </Field>
                            <label className="flex items-start gap-2 cursor-pointer bg-secondary/40 border border-border rounded-lg p-3">
                                <input
                                    type="checkbox"
                                    checked={form.visivel_cliente}
                                    onChange={e => setForm(f => ({ ...f, visivel_cliente: e.target.checked }))}
                                    className="accent-primary mt-0.5"
                                />
                                <span className="text-xs">
                                    <span className="font-semibold">Incluir no cronograma do cliente</span>
                                    <span className="block text-muted-foreground mt-0.5">
                                        Desmarque para etapas de controle interno (prazo de negociação, envio e recebimento
                                        da PV...) — elas ficam no planejamento, mas fora do documento baixado.
                                    </span>
                                </span>
                            </label>
                            {CATEGORIAS_APC.includes(form.categoria) && (
                                <p className="text-[11px] text-muted-foreground">Ao concluir esta etapa, o APC é registrado como liberado e a execução é destravada.</p>
                            )}
                            {CATEGORIAS_RFI.includes(form.categoria) && (
                                <p className="text-[11px] text-muted-foreground">Ao concluir esta etapa, o sistema pede a condição de energia para registrar o RFI.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <GhostButton onClick={() => setShowForm(false)}>Cancelar</GhostButton>
                            <PrimaryButton onClick={salvar} disabled={salvando || !form.titulo}>{salvando ? 'Salvando...' : 'Salvar'}</PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            {conferindo && (
                <ConferenciaEtapa
                    item={conferindo}
                    onFechar={() => setConferindo(null)}
                    onAdiar={() => { setAdiadas(a => [...a, conferindo.id]); setConferindo(null); }}
                    onResponder={async (corpo) => {
                        setErro('');
                        const r = await fetch(`/api/cronograma/${conferindo.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(corpo),
                        });
                        if (!r.ok) { setErro((await r.json()).error || 'Erro ao conferir a etapa'); return; }
                        setConferindo(null);
                        await load();
                    }}
                />
            )}

            {rfiPendente && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
                        <h3 className="text-base font-bold mb-1">Concluir RFI</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            A condição de energia define qual caminho a regra de faturamento vai usar.
                        </p>
                        <div className="flex flex-col gap-2">
                            <PrimaryButton onClick={() => mudarStatus(rfiPendente.item, 'CONCLUIDO', { rfi_energizado: true })}>Site energizado</PrimaryButton>
                            <GhostButton onClick={() => mudarStatus(rfiPendente.item, 'CONCLUIDO', { rfi_energizado: false })}>Sem energia</GhostButton>
                            <GhostButton onClick={() => mudarStatus(rfiPendente.item, 'CONCLUIDO', { rfi_energizado: null })}>Não informar agora</GhostButton>
                        </div>
                        <div className="flex justify-end mt-4">
                            <GhostButton onClick={() => setRfiPendente(null)}>Cancelar</GhostButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ListaEtapas({ itens, onEdit, onExcluir, onStatus, onProgresso, onVisibilidade, onMover }: {
    itens: any[];
    onEdit: (item: any) => void;
    onExcluir: (id: string) => void;
    onStatus: (item: any, status: string) => void;
    onProgresso: (id: string, progresso: number) => void;
    onVisibilidade: (id: string, visivel: boolean) => void;
    onMover: (id: string, direcao: 'cima' | 'baixo') => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2 font-semibold w-24" title="Etapas marcadas entram no cronograma baixado e enviado ao cliente">No documento</th>
                        <th className="pb-2 font-semibold">Tarefa</th>
                        <th className="pb-2 font-semibold">Etapa</th>
                        <th className="pb-2 font-semibold">Progresso</th>
                        <th className="pb-2 font-semibold">Início</th>
                        <th className="pb-2 font-semibold">Término</th>
                        <th className="pb-2 font-semibold">Prioridade</th>
                        <th className="pb-2 font-semibold">Status</th>
                        <th className="pb-2 font-semibold"><span className="sr-only">Ações</span></th>
                    </tr>
                </thead>
                <tbody>
                    {itens.map((it, idx) => (
                        <tr key={it.id} className={`border-b border-border/50 last:border-0 ${it.visivel_cliente === false ? 'opacity-60' : ''}`}>
                            <td className="py-2">
                                <label className="flex items-center gap-1.5 cursor-pointer" title={it.visivel_cliente === false
                                    ? 'Controle interno — fora do cronograma do cliente'
                                    : 'Entra no cronograma baixado'}>
                                    <input
                                        type="checkbox"
                                        checked={it.visivel_cliente !== false}
                                        onChange={e => onVisibilidade(it.id, e.target.checked)}
                                        aria-label={`Incluir ${it.titulo} no cronograma do cliente`}
                                        className="accent-primary"
                                    />
                                    <span className="text-[11px] text-muted-foreground">
                                        {it.visivel_cliente === false ? 'Interno' : 'Cliente'}
                                    </span>
                                </label>
                            </td>
                            <td className="py-2 font-medium">{it.titulo}</td>
                            <td className="py-2">
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: corDaEtapa(it.categoria) }}>
                                    {CATEGORIA_LABEL[it.categoria] || it.categoria}
                                </span>
                                {it.motivo_atraso && (
                                    <div className="mt-1 max-w-[220px] text-[11px] leading-snug text-muted-foreground">
                                        {it.motivo_atraso}
                                    </div>
                                )}
                            </td>
                            <td className="py-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range" min={0} max={100} step={5}
                                        value={it.progresso_percentual ?? 0}
                                        onChange={e => onProgresso(it.id, parseInt(e.target.value))}
                                        aria-label={`Progresso de ${it.titulo}`}
                                        className="w-16 accent-primary"
                                    />
                                    <span className="text-[11px] font-semibold w-9">{it.progresso_percentual ?? 0}%</span>
                                </div>
                            </td>
                            <td className="py-2 text-xs">{fmtData(it.data_inicio)}</td>
                            <td className="py-2 text-xs">
                                {fmtData(it.data_fim)}
                                {/* Replanejamento visível: sem isso a data nova parecia a
                                    combinada desde sempre e o atraso sumia da tela. */}
                                {it.replanejamentos > 0 && it.data_fim_baseline && (
                                    <div
                                        className="text-[11px] text-warn"
                                        title={it.motivo_atraso || undefined}
                                    >
                                        Era {fmtData(it.data_fim_baseline)}
                                        <span className="ml-2">{it.replanejamentos > 1 ? `${it.replanejamentos} adiamentos` : '1 adiamento'}</span>
                                    </div>
                                )}
                                {it.data_fim_real && it.status === 'CONCLUIDO' && (
                                    <div className="text-[11px] text-ok">
                                        Concluída {fmtData(it.data_fim_real)}
                                    </div>
                                )}
                            </td>
                            <td className="py-2">
                                <span className={`text-[11px] font-medium ${PRIORIDADE_TOM[it.prioridade] || 'text-muted-foreground'}`}>{PRIORIDADE_ROTULO[it.prioridade] || it.prioridade}</span>
                            </td>
                            <td className="py-2">
                                <select
                                    value={it.status}
                                    onChange={e => onStatus(it, e.target.value)}
                                    aria-label={`Status de ${it.titulo}`}
                                    className={`text-[11px] font-semibold rounded-md px-1.5 py-1 border-0 ${STATUS_TOM[it.status] || STATUS_TOM.PENDENTE}`}
                                >
                                    {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_ROTULO[s] || s}</option>)}
                                </select>
                            </td>
                            <td className="py-2 flex gap-0.5 justify-end items-center">
                                <div className="flex flex-col mr-1">
                                    <button type="button" onClick={() => onMover(it.id, 'cima')} disabled={idx === 0} title="Mover para cima" aria-label="Mover etapa para cima"
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground leading-none">
                                        <ChevronUp size={14} aria-hidden />
                                    </button>
                                    <button type="button" onClick={() => onMover(it.id, 'baixo')} disabled={idx === itens.length - 1} title="Mover para baixo" aria-label="Mover etapa para baixo"
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground leading-none">
                                        <ChevronDown size={14} aria-hidden />
                                    </button>
                                </div>
                                <button type="button" onClick={() => onEdit(it)} title="Editar etapa" aria-label="Editar etapa" className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} aria-hidden /></button>
                                <button type="button" onClick={() => onExcluir(it.id)} title="Excluir etapa" aria-label="Excluir etapa" className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} aria-hidden /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Gantt({ itens }: { itens: any[] }) {
    const grade = useMemo(() => {
        const comDatas = itens.filter(i => i.data_inicio && i.data_fim);
        if (comDatas.length === 0) return null;

        const inicioReal = new Date(Math.min(...comDatas.map(i => diaUTC(i.data_inicio).getTime())));
        const fimReal = new Date(Math.max(...comDatas.map(i => diaUTC(i.data_fim).getTime())));
        const inicio = addDias(inicioReal, -((inicioReal.getUTCDay() + 6) % 7));
        const fim = addDias(fimReal, 6 - ((fimReal.getUTCDay() + 6) % 7));

        const dias: Date[] = [];
        for (let d = inicio; d <= fim; d = addDias(d, 1)) dias.push(d);
        return { dias };
    }, [itens]);

    if (!grade) {
        return <EmptyState text="Preencha as datas de início e término das etapas para ver o Gantt." />;
    }

    const hoje = new Date();
    const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    return (
        <div className="overflow-x-auto border border-border rounded-lg">
            <table className="text-xs" style={{ minWidth: '100%' }}>
                <thead>
                    <tr className="bg-secondary/60">
                        <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-secondary/60 min-w-[180px]">Tarefa</th>
                        {grade.dias.map((d, i) => (
                            <th key={i} className={`px-0 py-1 font-normal text-[11px] w-[18px] ${d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 'bg-secondary' : ''}`}>
                                <div className="text-muted-foreground">{String(d.getUTCDate()).padStart(2, '0')}</div>
                                <div className="text-muted-foreground/60">{DIA_SEMANA[d.getUTCDay()]}</div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {itens.map(item => {
                        const inicio = item.data_inicio ? diaUTC(item.data_inicio).getTime() : null;
                        const fim = item.data_fim ? diaUTC(item.data_fim).getTime() : null;
                        const cor = item.status === 'CONCLUIDO' ? 'hsl(var(--ok))'
                            : item.status === 'EM_ANDAMENTO' ? 'hsl(var(--warn))'
                                : corDaEtapa(item.categoria);
                        return (
                            <tr key={item.id} className="border-t border-border/50">
                                <td className="px-3 py-1.5 font-medium sticky left-0 bg-card whitespace-nowrap">
                                    {item.titulo}
                                    <span className="ml-2 text-[11px] font-bold px-1 py-0.5 rounded text-white" style={{ background: corDaEtapa(item.categoria) }}>
                                        {CATEGORIA_LABEL[item.categoria] || item.categoria}
                                    </span>
                                </td>
                                {grade.dias.map((d, i) => {
                                    const t = d.getTime();
                                    const dentro = inicio != null && fim != null && t >= inicio && t <= fim;
                                    const fds = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                                    return (
                                        <td key={i} className={`p-0 h-6 relative ${fds ? 'bg-secondary/40' : ''} ${t === hojeUTC ? 'border-l-2 border-l-crit' : ''}`}>
                                            {dentro && <span className="absolute inset-y-1 inset-x-0" style={{ background: cor }} />}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}


/**
 * Conferência de uma etapa vencida.
 *
 * Quatro respostas, e nenhuma delas é presumida pelo sistema. "Concluída" é a
 * única que mexe no avanço — as outras replanejam ou tiram a etapa da conta.
 * A data prevista vem sugerida no campo de data real porque, na prática, é a
 * resposta mais comum: aconteceu no dia, só ninguém marcou.
 */
function ConferenciaEtapa({ item, onFechar, onAdiar, onResponder }: {
    item: any;
    onFechar: () => void;
    onAdiar: () => void;
    onResponder: (corpo: Record<string, any>) => void;
}) {
    const paraInput = (d: string | Date | null) => d ? new Date(d).toISOString().slice(0, 10) : '';
    const [resposta, setResposta] = useState<'concluida' | 'andamento' | 'nao_comecou' | 'nao_aplica' | null>(null);
    const [dataReal, setDataReal] = useState(paraInput(item.data_fim));
    const [novoInicio, setNovoInicio] = useState(paraInput(item.data_inicio));
    const [novoFim, setNovoFim] = useState('');
    const [motivo, setMotivo] = useState('');

    const podeEnviar =
        resposta === 'concluida' ? Boolean(dataReal)
        : resposta === 'andamento' ? Boolean(novoFim)
        : resposta === 'nao_comecou' ? Boolean(novoInicio && novoFim)
        : resposta === 'nao_aplica' ? motivo.trim().length >= 5
        : false;

    function enviar() {
        if (resposta === 'concluida') {
            return onResponder({ status: 'CONCLUIDO', progresso_percentual: 100, data_fim_real: dataReal });
        }
        if (resposta === 'andamento') {
            return onResponder({ status: 'EM_ANDAMENTO', data_fim: novoFim, motivo_atraso: motivo || null });
        }
        if (resposta === 'nao_comecou') {
            return onResponder({ status: 'PENDENTE', progresso_percentual: 0, data_inicio: novoInicio, data_fim: novoFim, motivo_atraso: motivo || null });
        }
        // Sai do cálculo de avanço sem apagar o histórico da etapa.
        return onResponder({ visivel_cliente: false, status: 'CONCLUIDO', progresso_percentual: 0, motivo_atraso: motivo });
    }

    const opcao = (id: typeof resposta, titulo: string, descricao: string) => (
        <button
            type="button"
            onClick={() => setResposta(id)}
            className={`w-full rounded-lg border p-3 text-left ${resposta === id ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary/50'}`}
        >
            <div className="text-xs font-bold">{titulo}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{descricao}</div>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6">
                <h3 className="text-base font-bold">{item.titulo}</h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                    Estava prevista para terminar em <strong className="text-foreground">{fmtData(item.data_fim)}</strong> ({diasDeAtraso(item.data_fim)}).
                    O que aconteceu?
                </p>

                <div className="flex flex-col gap-2">
                    {opcao('concluida', 'Concluída', 'Encerra a etapa e leva o progresso a 100%.')}
                    {opcao('andamento', 'Ainda em andamento', 'Mantém a etapa aberta com uma nova previsão de término.')}
                    {opcao('nao_comecou', 'Não começou', 'Replaneja início e término. O progresso volta a zero.')}
                    {opcao('nao_aplica', 'Não se aplica', 'Tira a etapa do cálculo de avanço, com justificativa.')}
                </div>

                {resposta === 'concluida' && (
                    <div className="mt-4">
                        <Field label="Data real de conclusão">
                            <input type="date" className={inputClass} value={dataReal} onChange={e => setDataReal(e.target.value)} />
                        </Field>
                    </div>
                )}

                {(resposta === 'andamento' || resposta === 'nao_comecou') && (
                    <div className="mt-4 grid gap-3">
                        {resposta === 'nao_comecou' && (
                            <Field label="Novo início">
                                <input type="date" className={inputClass} value={novoInicio} onChange={e => setNovoInicio(e.target.value)} />
                            </Field>
                        )}
                        <Field label="Nova previsão de término">
                            <input type="date" className={inputClass} value={novoFim} onChange={e => setNovoFim(e.target.value)} />
                        </Field>
                        <Field label="Motivo (opcional)">
                            <input className={inputClass} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: aguardando liberação da concessionária" />
                        </Field>
                        {item.data_fim_baseline && (
                            <p className="text-[11px] text-muted-foreground">
                                Previsão original: {fmtData(item.data_fim_baseline)}
                                {item.replanejamentos > 0 && <span className="ml-2">Já replanejada {item.replanejamentos}x</span>}
                            </p>
                        )}
                    </div>
                )}

                {resposta === 'nao_aplica' && (
                    <div className="mt-4">
                        <Field label="Justificativa">
                            <input className={inputClass} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por que esta etapa não se aplica?" />
                        </Field>
                    </div>
                )}

                <div className="mt-5 flex items-center justify-between gap-2">
                    <GhostButton onClick={onAdiar}>Não informar agora</GhostButton>
                    <div className="flex gap-2">
                        <GhostButton onClick={onFechar}>Cancelar</GhostButton>
                        <PrimaryButton onClick={enviar} disabled={!podeEnviar}>Confirmar</PrimaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
}
