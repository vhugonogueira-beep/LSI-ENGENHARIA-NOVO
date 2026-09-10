import { useState, useEffect, useCallback } from 'react';
import { Receipt, Download, CheckCircle2, Send, Wallet, ChevronDown, ChevronRight, Mail } from 'lucide-react';
import { fmtMoeda, fmtData } from '../components/atividades/constants';

interface Atividade {
    id: string;
    codigo: string;
    titulo: string;
    sharing: string;
    id_site_sharing?: string | null;
    valor_contrato?: number | null;
    status_faturamento: string;
    status_operacional?: string;
}
interface FaturamentoAtividade {
    id: string;
    valor_incluido: number;
    percentual_marco?: number | null;
    atividade: { codigo: string; titulo: string; sharing: string; id_site_sharing?: string | null };
}
interface Faturamento {
    id: string;
    codigo: string;
    status: string;
    valor_total: number;
    nf_numero?: string | null;
    enviado_em: string;
    atividades: FaturamentoAtividade[];
    recebimentos?: { valor_recebido: number }[];
}

const FATURAMENTO_STAGES = [
    { id: 'ENVIADO_FINANCEIRO', label: 'Enviado ao Financeiro', color: '#3b82f6' },
    { id: 'EM_FATURAMENTO', label: 'Em Faturamento', color: '#f59e0b' },
    { id: 'NF_EMITIDA', label: 'NF Emitida', color: '#8b5cf6' },
    { id: 'FATURADO', label: 'Faturado', color: '#6366f1' },
    { id: 'RECEBIDO', label: 'Recebido', color: '#22c55e' },
];
const STAGE_INDEX: Record<string, number> = Object.fromEntries(FATURAMENTO_STAGES.map((s, i) => [s.id, i]));

export default function Faturamento() {
    const [prontas, setProntas] = useState<Atividade[]>([]);
    const [lotes, setLotes] = useState<Faturamento[]>([]);
    const [loading, setLoading] = useState(true);
    const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
    const [expandido, setExpandido] = useState<string | null>(null);
    const [nfDraft, setNfDraft] = useState<Record<string, string>>({});
    const [recebimentoDraft, setRecebimentoDraft] = useState<Record<string, string>>({});
    const [erro, setErro] = useState('');
    const [starting, setStarting] = useState(false);
    const [resumo, setResumo] = useState({
        aFaturar: 0, linhasAFaturar: 0, aguardandoAutorizacao: 0, linhasAguardando: 0,
        semPO: [] as Atividade[],
    });

    // `silencioso` evita trocar a tela inteira por "Carregando..." num refresh disparado
    // de dentro de um painel — isso desmontaria o painel e derrubaria o modal do e-mail.
    const load = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const [atvR, fatR, posR] = await Promise.all([
                fetch('/api/atividades'), fetch('/api/faturamento'), fetch('/api/pos/geral'),
            ]);
            const atividades: Atividade[] = atvR.ok ? await atvR.json() : [];
            setProntas(atividades.filter(a => a.status_faturamento === 'PRONTO_PARA_FATURAR'));
            setLotes(fatR.ok ? await fatR.json() : []);

            // Os indicadores olham o funil inteiro: o que já tem PO com saldo autorizado,
            // o que tem PO mas ainda depende de autorização, e as atividades em execução
            // que sequer receberam PO.
            const pos = posR.ok ? await posR.json() : [];
            const linhas: any[] = (await Promise.all(pos.map(async (po: any) => {
                const lr = await fetch(`/api/pos/${po.id}/linhas`);
                return lr.ok ? await lr.json() : [];
            }))).flat();

            const comPO = new Set(pos.map((p: any) => p.atividade?.id).filter(Boolean));
            setResumo({
                aFaturar: linhas.filter(l => l.autorizado && l.percentual_pendente > 0)
                    .reduce((s, l) => s + l.valor_pendente, 0),
                linhasAFaturar: linhas.filter(l => l.autorizado && l.percentual_pendente > 0).length,
                aguardandoAutorizacao: linhas.filter(l => !l.autorizado && l.percentual_pendente > 0)
                    .reduce((s, l) => s + l.valor_pendente, 0),
                linhasAguardando: linhas.filter(l => !l.autorizado && l.percentual_pendente > 0).length,
                semPO: atividades.filter(a => !comPO.has(a.id)
                    && ['EM_EXECUCAO', 'CONCLUIDA', 'APC_LIBERADO'].includes(a.status_operacional || '')),
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    function toggleSel(id: string) {
        setSelecionadas(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function startFaturamento() {
        if (selecionadas.size === 0) return;
        setStarting(true);
        setErro('');
        try {
            const r = await fetch('/api/faturamento/start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ atividade_ids: Array.from(selecionadas) }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao iniciar faturamento');
            setSelecionadas(new Set());
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setStarting(false);
        }
    }

    async function avancarStatus(lote: Faturamento, novoStatus: string) {
        setErro('');
        try {
            const body: any = { status: novoStatus };
            if (novoStatus === 'NF_EMITIDA') {
                const nf = nfDraft[lote.id];
                if (!nf) { setErro('Informe o número da NF antes de avançar para "NF Emitida"'); return; }
                body.nf_numero = nf;
            }
            const r = await fetch(`/api/faturamento/${lote.id}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao avançar status');
            await load();
        } catch (e: any) {
            setErro(e.message);
        }
    }

    async function registrarRecebimento(lote: Faturamento) {
        const valor = recebimentoDraft[lote.id];
        if (!valor) return;
        setErro('');
        try {
            const r = await fetch(`/api/faturamento/${lote.id}/recebimento`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor_recebido: parseFloat(valor) }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao registrar recebimento');
            setRecebimentoDraft(prev => ({ ...prev, [lote.id]: '' }));
            await load();
        } catch (e: any) {
            setErro(e.message);
        }
    }

    if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

    const valorAReceber = lotes.filter(l => l.status !== 'RECEBIDO').reduce((s, l) => s + l.valor_total, 0);
    const lotesAbertos = lotes.filter(l => l.status !== 'RECEBIDO').length;

    return (
        <div className="p-8 text-foreground">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                        <Receipt className="text-primary" size={28} />
                        Faturamento
                    </h2>
                    <p className="text-muted-foreground mt-1">Fila real (Blueprint LSI) — motor de regras, Start Faturamento e planilha padrão</p>
                </div>
            </div>

            {erro && <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">{erro}</div>}

            {/* KPIs — o funil inteiro, das POs autorizadas às atividades ainda sem PO */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <KpiCard icon={<CheckCircle2 size={16} />} label="Autorizado a Faturar" value={fmtMoeda(resumo.aFaturar)} sub={`${resumo.linhasAFaturar} linha(s) de PO`} color="#22c55e" />
                <KpiCard icon={<Wallet size={16} />} label="Aguardando Autorização" value={fmtMoeda(resumo.aguardandoAutorizacao)} sub={`${resumo.linhasAguardando} linha(s) sem OK`} color="#f59e0b" />
                <KpiCard icon={<Receipt size={16} />} label="Sem PO Recebida" value={String(resumo.semPO.length)} sub="atividades em obra sem PO" color="#ef4444" />
                <KpiCard icon={<Send size={16} />} label="Lotes em Aberto" value={String(lotesAbertos)} sub={`${lotes.length} lote(s) no total`} color="#3b82f6" />
                <KpiCard icon={<Receipt size={16} />} label="Valor a Receber" value={fmtMoeda(valorAReceber)} sub="soma dos lotes não recebidos" color="#8b5cf6" />
            </div>

            {resumo.semPO.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5 mb-6" style={{ borderLeft: '3px solid #ef4444' }}>
                    <h3 className="text-sm font-bold mb-1">Atividades sem PO recebida</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        Já estão em obra ou concluídas, mas o PDF da PO ainda não foi anexado — sem PO não há o que faturar.
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {resumo.semPO.slice(0, 8).map(a => (
                            <div key={a.id} className="flex items-center gap-3 text-xs bg-secondary/30 border border-border rounded px-3 py-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{a.sharing}</span>
                                {a.id_site_sharing && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.id_site_sharing}</span>}
                                <span className="flex-1 truncate font-medium">{a.titulo}</span>
                                <span className="font-mono text-muted-foreground">{a.codigo}</span>
                                <span className="font-semibold">{fmtMoeda(a.valor_contrato)}</span>
                            </div>
                        ))}
                        {resumo.semPO.length > 8 && (
                            <div className="text-xs text-muted-foreground">+ {resumo.semPO.length - 8} atividade(s)</div>
                        )}
                    </div>
                </div>
            )}

            {/* POs recebidas — cruzamento com as atividades que já têm PDF anexado */}
            <PainelPOs onMudou={() => load(true)} />

            {/* Fila de faturamento */}
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold">Fila de Faturamento (Pronto para Faturar)</h3>
                    <button
                        onClick={startFaturamento}
                        disabled={selecionadas.size === 0 || starting}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-md shadow-primary/20"
                    >
                        {starting ? 'Iniciando...' : `Start Faturamento (${selecionadas.size})`}
                    </button>
                </div>
                {prontas.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma atividade pronta para faturar no momento.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {prontas.map(a => (
                            <label key={a.id} className="flex items-center gap-3 bg-secondary/30 hover:bg-secondary/50 border border-border rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
                                <input type="checkbox" checked={selecionadas.has(a.id)} onChange={() => toggleSel(a.id)} className="accent-primary" />
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{a.sharing}</span>
                                {a.id_site_sharing && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.id_site_sharing}</span>}
                                <span className="flex-1 text-sm font-medium truncate">{a.titulo}</span>
                                <span className="text-xs font-mono text-muted-foreground">{a.codigo}</span>
                                <span className="text-sm font-semibold w-28 text-right">{fmtMoeda(a.valor_contrato)}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Lotes */}
            <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold mb-4">Lotes de Faturamento</h3>
                {lotes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhum lote enviado ainda.</div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {lotes.map(lote => {
                            const stageIdx = STAGE_INDEX[lote.status] ?? 0;
                            const stageColor = FATURAMENTO_STAGES[stageIdx]?.color || '#94a3b8';
                            const recebidoTotal = (lote.recebimentos || []).reduce((s, r) => s + r.valor_recebido, 0);
                            return (
                                <div key={lote.id} className="border border-border rounded-lg overflow-hidden" style={{ borderLeft: `3px solid ${stageColor}` }}>
                                    <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap cursor-pointer" onClick={() => setExpandido(expandido === lote.id ? null : lote.id)}>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-xs text-muted-foreground">{lote.codigo}</span>
                                            <span className="text-sm font-semibold">{fmtMoeda(lote.valor_total)}</span>
                                            <span className="text-xs text-muted-foreground">{lote.atividades.length} atividade(s) · {fmtData(lote.enviado_em)}</span>
                                        </div>
                                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${stageColor}22`, color: stageColor }}>
                                            {FATURAMENTO_STAGES[stageIdx]?.label || lote.status}
                                        </span>
                                    </div>

                                    {/* Stepper de status */}
                                    <div className="px-3.5 pb-3.5 flex items-center gap-1.5 flex-wrap">
                                        {FATURAMENTO_STAGES.map((stage, i) => {
                                            const isPast = i < stageIdx;
                                            const isCurrent = i === stageIdx;
                                            const isNext = i === stageIdx + 1;
                                            return (
                                                <button
                                                    key={stage.id}
                                                    disabled={!isNext}
                                                    onClick={(e) => { e.stopPropagation(); avancarStatus(lote, stage.id); }}
                                                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:cursor-default"
                                                    style={{
                                                        borderColor: isPast || isCurrent ? stage.color : 'hsl(var(--border))',
                                                        background: isCurrent ? `${stage.color}22` : isPast ? `${stage.color}11` : 'transparent',
                                                        color: isPast || isCurrent ? stage.color : 'hsl(var(--muted-foreground))',
                                                        opacity: isNext ? 1 : isPast || isCurrent ? 0.85 : 0.4,
                                                        cursor: isNext ? 'pointer' : 'default',
                                                    }}>
                                                    {stage.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {expandido === lote.id && (
                                        <div className="border-t border-border p-3.5 bg-secondary/20">
                                            <div className="flex flex-col gap-1.5 mb-3">
                                                {lote.atividades.map(fa => (
                                                    <div key={fa.id} className="flex justify-between text-xs bg-secondary/40 rounded-md px-2.5 py-1.5">
                                                        <span>{fa.atividade.sharing} · {fa.atividade.id_site_sharing || '-'} · {fa.atividade.titulo}</span>
                                                        <span className="font-semibold">{fmtMoeda(fa.valor_incluido)}{fa.percentual_marco != null ? ` (${fa.percentual_marco}%)` : ''}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <a href={`/api/faturamento/${lote.id}/export.xlsx`} download
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                                                    <Download size={13} /> Exportar Excel (Winity)
                                                </a>

                                                {lote.status === 'EM_FATURAMENTO' && (
                                                    <input placeholder="Número da NF" value={nfDraft[lote.id] || ''} onChange={e => setNfDraft(prev => ({ ...prev, [lote.id]: e.target.value }))}
                                                        className="text-xs border border-border rounded-md px-2 py-1.5 bg-secondary/40 text-foreground placeholder:text-muted-foreground focus:outline-none" />
                                                )}
                                                {lote.nf_numero && <span className="text-xs text-muted-foreground">NF: <span className="font-semibold text-foreground">{lote.nf_numero}</span></span>}

                                                {lote.status === 'FATURADO' && (
                                                    <div className="flex items-center gap-2 ml-auto">
                                                        <span className="text-xs text-muted-foreground">Recebido: {fmtMoeda(recebidoTotal)} / {fmtMoeda(lote.valor_total)}</span>
                                                        <input type="number" placeholder="Valor recebido" value={recebimentoDraft[lote.id] || ''}
                                                            onChange={e => setRecebimentoDraft(prev => ({ ...prev, [lote.id]: e.target.value }))}
                                                            className="text-xs border border-border rounded-md px-2 py-1.5 bg-secondary/40 text-foreground placeholder:text-muted-foreground w-32 focus:outline-none" />
                                                        <button onClick={() => registrarRecebimento(lote)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
                                                            Registrar Recebimento
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// Toda PO anexada dentro de uma Atividade aparece aqui automaticamente — é neste painel
// que se decide se ela está liberada para faturamento e qual percentual será faturado
// (Blueprint LSI, seções 26-27). Liberar reavalia o gate "Pronto para Faturar".
function PainelPOs({ onMudou }: { onMudou: () => void }) {
    const [pos, setPos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [linhasPorPO, setLinhasPorPO] = useState<Record<string, any[]>>({});
    const [aberta, setAberta] = useState<string | null>(null);
    // percentual escolhido por linha selecionada: { [linha_id]: '40' }
    const [selecao, setSelecao] = useState<Record<string, string>>({});
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [email, setEmail] = useState<any | null>(null);
    const [cancelando, setCancelando] = useState<any | null>(null);

    // Cancelar faturamento é restrito a administrador (ver ressalva: hoje é controle de
    // interface, porque as rotas ainda não exigem token).
    const usuario = (() => {
        try { return JSON.parse(localStorage.getItem('ls_auth_user') || 'null'); } catch { return null; }
    })();
    const ehAdmin = usuario?.role === 'ADMIN';

    const load = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const r = await fetch('/api/pos/geral');
            const lista = r.ok ? await r.json() : [];
            setPos(lista);
            // carrega as linhas de todas as POs — é o saldo por linha que interessa aqui
            const mapa: Record<string, any[]> = {};
            await Promise.all(lista.map(async (po: any) => {
                const lr = await fetch(`/api/pos/${po.id}/linhas`);
                mapa[po.id] = lr.ok ? await lr.json() : [];
            }));
            setLinhasPorPO(mapa);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    function alternarLinha(linha: any) {
        setSelecao(atual => {
            const novo = { ...atual };
            if (novo[linha.id] !== undefined) delete novo[linha.id];
            else novo[linha.id] = String(linha.percentual_pendente);
            return novo;
        });
    }

    // Autorização do cliente por linha ("Liberação Microsiga"): sem isso a linha não
    // entra em nenhuma solicitação de faturamento.
    async function alternarAutorizacao(linha: any) {
        setErro('');
        const r = await fetch(`/api/pos/linhas/${linha.id}/autorizacao`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autorizado: !linha.autorizado }),
        });
        if (!r.ok) { setErro((await r.json()).error || 'Erro ao mudar a autorização'); return; }
        if (linha.autorizado) {
            // ao desautorizar, tira da seleção
            setSelecao(a => { const n = { ...a }; delete n[linha.id]; return n; });
        }
        await load(true);
    }

    async function solicitarFaturamento() {
        const itens = Object.entries(selecao).map(([linha_id, p]) => ({ linha_id, percentual: parseFloat(p) || 0 }));
        if (itens.length === 0) return;
        setEnviando(true);
        setErro('');
        try {
            const r = await fetch('/api/pos/faturamento-linhas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itens }),
            });
            const criados = await r.json();
            if (!r.ok) throw new Error(criados.error || 'Erro ao solicitar faturamento');

            const er = await fetch('/api/pos/faturamento-linhas/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: criados.map((c: any) => c.id) }),
            });
            const dadosEmail = await er.json();
            if (!er.ok) throw new Error(dadosEmail.error || 'Erro ao gerar o e-mail');

            // guarda os ids para o download da planilha que acompanha o e-mail
            setEmail({ ...dadosEmail, ids: criados.map((c: any) => c.id) });
            setSelecao({});
            await load(true);
            onMudou();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setEnviando(false);
        }
    }

    async function confirmarCancelamento(motivo: string) {
        if (!cancelando) return;
        setErro('');
        const r = await fetch(`/api/pos/faturamento-linhas/${cancelando.fat.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo, autor: usuario ? { nome: usuario.nome, email: usuario.email, role: usuario.role } : undefined }),
        });
        if (!r.ok) { setErro((await r.json()).error || 'Erro ao cancelar o faturamento'); return; }
        setCancelando(null);
        await load(true);
        onMudou();
    }

    if (loading) return null;

    const todasLinhas = Object.values(linhasPorPO).flat();
    const comSaldo = todasLinhas.filter((l: any) => l.percentual_pendente > 0).length;
    const selecionadas = Object.entries(selecao);
    const valorSelecionado = selecionadas.reduce((acc, [id, p]) => {
        const linha = todasLinhas.find((l: any) => l.id === id);
        return acc + (linha ? linha.valor_total * (parseFloat(p) || 0) / 100 : 0);
    }, 0);

    return (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold">POs Recebidas — faturamento por linha</h3>
                <span className="text-xs text-muted-foreground">{pos.length} PO(s) · {comSaldo} linha(s) com saldo a faturar</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
                Cada linha da PO (material, serviço...) é faturada separadamente e em partes. Selecione as linhas,
                informe o percentual liberado e gere o e-mail para a equipe de faturamento.
            </p>

            {erro && <div className="mb-3 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs">{erro}</div>}

            {pos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma PO anexada ainda — anexe o PDF na aba PO da atividade.</div>
            ) : (
                <div className="flex flex-col gap-2">
                    {pos.map(po => {
                        const linhas = linhasPorPO[po.id] || [];
                        const pendenteDaPO = linhas.reduce((a: number, l: any) => a + l.valor_pendente, 0);
                        const expandida = aberta === po.id;
                        return (
                            <div key={po.id} className="bg-secondary/30 border border-border rounded-lg">
                                <button onClick={() => setAberta(expandida ? null : po.id)} className="w-full flex items-center gap-3 flex-wrap px-3 py-2.5 text-left hover:bg-secondary/40 rounded-lg">
                                    {expandida ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{po.atividade?.sharing}</span>
                                    {po.atividade?.id_site_sharing && (
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{po.atividade.id_site_sharing}</span>
                                    )}
                                    <span className="text-xs font-mono text-muted-foreground">PO {po.numero || '—'}</span>
                                    <span className="text-sm font-medium truncate flex-1 min-w-[100px]">{po.atividade?.titulo}</span>
                                    <span className="text-xs text-muted-foreground">{linhas.length} linha(s)</span>
                                    <span className="text-sm font-semibold">{fmtMoeda(po.valor)}</span>
                                    {pendenteDaPO > 0
                                        ? <span className="text-xs font-semibold text-amber-500">pendente {fmtMoeda(pendenteDaPO)}</span>
                                        : <span className="text-xs font-semibold text-emerald-500">100% faturado</span>}
                                    {po.arquivos?.[0] && (
                                        <a href={`/api/pos/arquivos/${po.arquivos[0].id}/download`} onClick={e => e.stopPropagation()} className="text-xs text-primary hover:underline">PDF</a>
                                    )}
                                </button>

                                {expandida && (
                                    linhas.length === 0 ? (
                                        <div className="px-3 pb-3 text-xs text-muted-foreground">
                                            Esta PO não tem linhas lidas. Abra a atividade, aba PO, e clique em "Reler PDF".
                                        </div>
                                    ) : (
                                        <div className="px-3 pb-3 overflow-x-auto">
                                            <table className="w-full text-[11px] min-w-[860px]">
                                                <thead className="text-muted-foreground">
                                                    <tr className="text-left border-b border-border">
                                                        <th className="py-1.5 w-8"></th>
                                                        <th className="py-1.5 px-2">Linha</th>
                                                        <th className="py-1.5 px-2">Serviço</th>
                                                        <th className="py-1.5 px-2">Site</th>
                                                        <th className="py-1.5 px-2 text-right">Valor da linha</th>
                                                        <th className="py-1.5 px-2 text-center">Autorizado</th>
                                                        <th className="py-1.5 px-2 text-right">Já faturado</th>
                                                        <th className="py-1.5 px-2 text-right">Pendente</th>
                                                        <th className="py-1.5 px-2 text-right w-40">% a faturar agora</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {linhas.map((l: any) => {
                                                        const sel = selecao[l.id] !== undefined;
                                                        const semSaldo = l.percentual_pendente <= 0;
                                                        const bloqueada = semSaldo || !l.autorizado;
                                                        return (
                                                            <tr key={l.id} className={`border-b border-border/40 ${sel ? 'bg-primary/5' : ''} ${!l.autorizado ? 'opacity-70' : ''}`}>
                                                                <td className="py-1.5 px-2">
                                                                    <input type="checkbox" checked={sel} disabled={bloqueada}
                                                                        title={!l.autorizado ? 'Autorize a linha antes de faturar' : undefined}
                                                                        onChange={() => alternarLinha(l)} className="accent-primary" />
                                                                </td>
                                                                <td className="py-1.5 px-2 font-mono">{l.numero_linha}</td>
                                                                <td className="py-1.5 px-2">{l.descricao}</td>
                                                                <td className="py-1.5 px-2 font-semibold">{l.site || '—'}</td>
                                                                <td className="py-1.5 px-2 text-right">{fmtMoeda(l.valor_total)}</td>
                                                                <td className="py-1.5 px-2 text-center">
                                                                    <button onClick={() => alternarAutorizacao(l)}
                                                                        title={l.autorizado ? 'Autorizado — clique para revogar' : 'Clique para autorizar esta linha'}
                                                                        className={`cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${l.autorizado
                                                                            ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/25'
                                                                            : 'bg-amber-500/10 text-amber-500 border-amber-500/40 hover:bg-amber-500/20'}`}>
                                                                        {l.autorizado
                                                                            ? <><CheckCircle2 size={12} /> Autorizado</>
                                                                            : <>Autorizar</>}
                                                                    </button>
                                                                </td>
                                                                <td className="py-1.5 px-2 text-right text-emerald-500">
                                                                    {l.percentual_faturado > 0 ? `${l.percentual_faturado}% · ${fmtMoeda(l.valor_faturado)}` : '—'}
                                                                </td>
                                                                <td className="py-1.5 px-2 text-right text-amber-500 font-semibold">
                                                                    {semSaldo ? '—' : `${l.percentual_pendente}% · ${fmtMoeda(l.valor_pendente)}`}
                                                                </td>
                                                                <td className="py-1.5 px-2 text-right">
                                                                    {sel ? (
                                                                        <div className="flex items-center gap-1 justify-end">
                                                                            <input type="number" min="1" max={l.percentual_pendente} value={selecao[l.id]}
                                                                                onChange={e => setSelecao(a => ({ ...a, [l.id]: e.target.value }))}
                                                                                className="w-16 bg-secondary/40 border border-border rounded px-1.5 py-0.5 text-right text-foreground" />
                                                                            <span className="text-muted-foreground w-24 text-right">
                                                                                {fmtMoeda(l.valor_total * (parseFloat(selecao[l.id]) || 0) / 100)}
                                                                            </span>
                                                                        </div>
                                                                    ) : <span className="text-muted-foreground">—</span>}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {/* remessas já solicitadas, com o caminho para cancelar */}
                                                    {linhas.filter((l: any) => l.faturamentos?.length).map((l: any) => (
                                                        l.faturamentos.map((f: any) => (
                                                            <tr key={f.id} className="border-b border-border/30 text-[10px]">
                                                                <td></td>
                                                                <td className="py-1 px-2 text-muted-foreground">↳ {l.numero_linha}</td>
                                                                <td className="py-1 px-2 text-muted-foreground" colSpan={3}>
                                                                    Remessa de {f.percentual}% · {fmtMoeda(f.valor)} ·{' '}
                                                                    {new Date(f.data_solicitacao).toLocaleDateString('pt-BR')}
                                                                    {f.status === 'CANCELADO' && f.motivo_cancelamento && (
                                                                        <span className="text-red-400"> — cancelado por {f.cancelado_por || 'sistema'}: “{f.motivo_cancelamento}”</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-1 px-2 text-center">
                                                                    <span className={`font-bold ${f.status === 'CANCELADO' ? 'text-red-400' : 'text-emerald-500'}`}>{f.status}</span>
                                                                </td>
                                                                <td className="py-1 px-2 text-right" colSpan={3}>
                                                                    {f.status !== 'CANCELADO' && (
                                                                        ehAdmin ? (
                                                                            <button onClick={() => setCancelando({ fat: f, linha: l })}
                                                                                className="text-red-400 hover:underline font-semibold">
                                                                                Cancelar faturamento
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-muted-foreground" title="Somente administradores podem cancelar">
                                                                                cancelamento: só admin
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {selecionadas.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap">
                    <div className="text-sm">
                        <strong>{selecionadas.length}</strong> linha(s) selecionada(s) ·
                        <strong className="ml-1">{fmtMoeda(valorSelecionado)}</strong> a faturar
                    </div>
                    <button onClick={solicitarFaturamento} disabled={enviando}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                        <Mail size={14} /> {enviando ? 'Gerando...' : 'Solicitar faturamento e gerar e-mail'}
                    </button>
                </div>
            )}

            {email && <ModalEmail email={email} onFechar={() => setEmail(null)} />}
            {cancelando && (
                <ModalCancelamento
                    dados={cancelando}
                    onConfirmar={confirmarCancelamento}
                    onFechar={() => setCancelando(null)}
                />
            )}
        </div>
    );
}

// Cancelar desfaz um compromisso já informado ao cliente — o motivo é obrigatório e fica
// gravado junto com quem cancelou.
function ModalCancelamento({ dados, onConfirmar, onFechar }: {
    dados: { fat: any; linha: any };
    onConfirmar: (motivo: string) => void;
    onFechar: () => void;
}) {
    const [motivo, setMotivo] = useState('');
    const curto = motivo.trim().length < 10;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={onFechar}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold mb-1">Cancelar faturamento</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Linha {dados.linha.numero_linha} · {dados.linha.descricao} — remessa de {dados.fat.percentual}% ({fmtMoeda(dados.fat.valor)}).
                    O saldo volta a ficar disponível e o motivo fica registrado no histórico.
                </p>

                <label className="text-xs font-semibold text-muted-foreground">Motivo do cancelamento</label>
                <textarea
                    rows={4}
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Ex.: percentual liberado incorretamente pelo CR; a Highline reverteu a liberação em 03/09."
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
                        className="text-xs font-semibold bg-red-500/90 text-white rounded px-3 py-2 hover:bg-red-500 disabled:opacity-40">
                        Confirmar cancelamento
                    </button>
                </div>
            </div>
        </div>
    );
}

// E-mail pronto no formato usado com o cliente: o usuário copia e cola no Outlook.
function ModalEmail({ email, onFechar }: { email: any; onFechar: () => void }) {
    const [copiado, setCopiado] = useState('');

    async function copiar(tipo: 'html' | 'texto' | 'assunto') {
        try {
            if (tipo === 'html' && navigator.clipboard.write) {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([email.corpo_html], { type: 'text/html' }),
                    'text/plain': new Blob([email.corpo_texto], { type: 'text/plain' }),
                })]);
            } else {
                await navigator.clipboard.writeText(tipo === 'assunto' ? email.assunto : email.corpo_texto);
            }
            setCopiado(tipo);
            setTimeout(() => setCopiado(''), 2000);
        } catch {
            setCopiado('erro');
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={onFechar}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold mb-1">E-mail de solicitação de faturamento</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    {email.total_linhas} linha(s) · {fmtMoeda(email.total)}. Copie e cole no Outlook e anexe a planilha —
                    a formatação da tabela é preservada.
                </p>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="flex-1 min-w-[240px] bg-secondary/40 border border-border rounded px-3 py-2 text-sm">{email.assunto}</div>
                    <button onClick={() => copiar('assunto')} className="text-xs font-semibold border border-border rounded px-3 py-2 hover:bg-secondary">
                        {copiado === 'assunto' ? 'Copiado!' : 'Copiar assunto'}
                    </button>
                    <button onClick={() => copiar('html')} className="text-xs font-semibold bg-primary text-primary-foreground rounded px-3 py-2 hover:bg-primary/90">
                        {copiado === 'html' ? 'Copiado!' : 'Copiar e-mail formatado'}
                    </button>
                </div>

                {email.ids?.length > 0 && (
                    <a href={`/api/pos/faturamento-linhas/planilha?ids=${email.ids.join(',')}`}
                        className="mb-4 inline-flex items-center gap-2 text-xs font-semibold bg-emerald-600 text-white rounded px-3 py-2 hover:bg-emerald-500">
                        <Download size={14} /> Baixar planilha (.xlsx) para anexar ao e-mail
                    </a>
                )}

                <div className="border border-border rounded-lg bg-white text-black p-4 overflow-x-auto">
                    <div dangerouslySetInnerHTML={{ __html: email.corpo_html }} />
                </div>

                <div className="flex justify-end mt-4">
                    <button onClick={onFechar} className="text-xs font-semibold border border-border rounded px-3 py-2 hover:bg-secondary">Fechar</button>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4" style={{ borderTop: `3px solid ${color}` }}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{label}</span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, color }}>{icon}</span>
            </div>
            <div className="text-xl font-extrabold" style={{ color }}>{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
        </div>
    );
}
