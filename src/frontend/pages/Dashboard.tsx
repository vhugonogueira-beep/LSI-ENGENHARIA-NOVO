import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowRight, Banknote, CheckCircle2, Clock, FileWarning, FolderOpen, Layers, LayoutDashboard, Paperclip, Play, Receipt, Wallet,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { ALTERNADOR, CAMPO, SEGMENTO } from '../components/FiltroPainel';
import {
    STATUS_OPERACIONAL, SUBTIPOS_OPERACAO_LABEL, TIPOS_DEMANDA_LABEL, UFS, fmtMoeda, normalizarUf, regiaoPorUf, REGIAO_LABEL,
} from '../components/atividades/constants';
import { rotuloTipoSite } from '../components/atividades/TipoObraCampo';
import { SOLIDO, TEXTO, VEU, TOM_AREA, TOM_MODULO, TOM_OPERADORA, TOM_SHARING, TOM_STATUS, tomDe, type Tom } from '../lib/cores';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (12/10/2026; antes "Visão geral", só de orçamentos). Visão de toda a
// carteira: volume, implantação × operação, detentoras, operadoras, UFs, tipos de
// site, situação, pendências, projetos e orçamentos. Os dados vêm da carteira de
// atividades (GET /api/atividades/carteira), que já traz custo pago, PO,
// documentos e comprovantes calculados em lote — sem uma chamada por atividade.
// O filtro de área (Implantação/Operação) e de detentora vale para tudo na tela.
// ─────────────────────────────────────────────────────────────────────────────

interface Atividade {
    id: string; codigo: string; titulo: string; tipo_demanda: string; subtipo_demanda?: string | null;
    sharing: string; operadora?: string | null; estado?: string | null; tipo_obra?: string | null;
    status_operacional: string; valor_contrato?: number | null; custo_pago?: number; data_fim_planejada?: string | null;
    data_abertura?: string | null; created_at?: string; acionamento_id?: string | null; po?: unknown;
    documentos_pendentes?: number; documentos_correcao?: number; comprovantes_pendentes?: number;
}

const STATUS_ORCAMENTO: Record<string, string> = { RASCUNHO: 'Rascunho', ENVIADO: 'Enviado', APROVADO: 'Aprovado', REPROVADO: 'Reprovado', REVISAO: 'Em revisão' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const moeda = (v: number) => (v ? fmtMoeda(v) : '—');
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const atrasada = (a: Atividade) => !!a.data_fim_planejada && a.status_operacional !== 'CONCLUIDA'
    && new Date(a.data_fim_planejada).getTime() < new Date(new Date().toDateString()).getTime();

function contar<T>(lista: T[], chave: (x: T) => string, valor?: (x: T) => number) {
    const m = new Map<string, { n: number; v: number }>();
    for (const x of lista) {
        const k = chave(x) || '—';
        const atual = m.get(k) || { n: 0, v: 0 };
        atual.n += 1;
        atual.v += valor ? valor(x) : 0;
        m.set(k, atual);
    }
    return [...m.entries()].map(([k, x]) => ({ chave: k, ...x })).sort((a, b) => b.n - a.n || b.v - a.v);
}

export function Dashboard({ onNavigateTo }: { onNavigateTo?: (tab: string) => void }) {
    const [atividades, setAtividades] = useState<Atividade[]>([]);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [projetos, setProjetos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [area, setArea] = useState<'TODAS' | 'IMPLANTACAO' | 'OPERACAO'>('TODAS');
    const [detentora, setDetentora] = useState('');

    const load = useCallback(async () => {
        try {
            const [aR, bR, pR] = await Promise.all([fetch('/api/atividades/carteira'), fetch('/api/budgets'), fetch('/api/acionamentos')]);
            setAtividades(aR.ok ? await aR.json() : []);
            const b = bR.ok ? await bR.json() : [];
            setBudgets(Array.isArray(b) ? b.filter((x: any) => x.atividade_id) : []);
            setProjetos(pR.ok ? await pR.json() : []);
        } catch { /* backend fora: a tela mostra vazio */ } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const detentoras = useMemo(() => [...new Set(atividades.map(a => a.sharing).filter(Boolean))].sort(), [atividades]);
    const lista = useMemo(() => atividades.filter(a =>
        (area === 'TODAS' || a.tipo_demanda === area) && (!detentora || a.sharing === detentora)), [atividades, area, detentora]);

    const n = useMemo(() => {
        const abertas = lista.filter(a => a.status_operacional !== 'CONCLUIDA');
        const receita = lista.reduce((s, a) => s + (a.valor_contrato || 0), 0);
        const custo = lista.reduce((s, a) => s + (a.custo_pago || 0), 0);
        return {
            total: lista.length,
            abertas: abertas.length,
            execucao: lista.filter(a => a.status_operacional === 'EM_EXECUCAO').length,
            atrasadas: lista.filter(atrasada).length,
            concluidas: lista.filter(a => a.status_operacional === 'CONCLUIDA').length,
            receita, custo,
            margem: receita > 0 ? ((receita - custo) / receita) * 100 : null,
            semPO: abertas.filter(a => !a.po).length,
            comprovantes: lista.reduce((s, a) => s + (a.comprovantes_pendentes || 0), 0),
            documentos: lista.reduce((s, a) => s + (a.documentos_pendentes || 0), 0),
            correcao: lista.reduce((s, a) => s + (a.documentos_correcao || 0), 0),
            emProjeto: lista.filter(a => a.acionamento_id).length,
        };
    }, [lista]);

    const valor = (a: Atividade) => a.valor_contrato || 0;
    const porArea = useMemo(() => ['IMPLANTACAO', 'OPERACAO'].map(t => {
        const doTipo = lista.filter(a => a.tipo_demanda === t);
        return { tipo: t, n: doTipo.length, v: doTipo.reduce((s, a) => s + valor(a), 0), abertas: doTipo.filter(a => a.status_operacional !== 'CONCLUIDA').length };
    }), [lista]);
    const subtipos = useMemo(() => contar(lista.filter(a => a.tipo_demanda === 'OPERACAO'), a => a.subtipo_demanda || 'SEM_SUBTIPO'), [lista]);
    const porSharing = useMemo(() => contar(lista, a => a.sharing, valor), [lista]);
    const porOperadora = useMemo(() => contar(lista, a => a.operadora || 'SEM_OPERADORA', valor), [lista]);
    const porUf = useMemo(() => contar(lista, a => normalizarUf(a.estado) || 'SEM_UF', valor), [lista]);
    const porRegiao = useMemo(() => contar(lista.filter(a => normalizarUf(a.estado)), a => regiaoPorUf(a.estado)), [lista]);
    const porTipoSite = useMemo(() => contar(lista.filter(a => a.tipo_demanda === 'IMPLANTACAO'), a => a.tipo_obra || 'SEM_TIPO'), [lista]);
    const porStatus = useMemo(() => Object.keys(STATUS_OPERACIONAL).map(s => ({ s, n: lista.filter(a => a.status_operacional === s).length })), [lista]);

    // Volume: atividades abertas por mês, nos últimos 6 meses, separadas por área.
    const porMes = useMemo(() => {
        const hoje = new Date();
        const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; });
        return meses.map(m => {
            const doMes = lista.filter(a => { const d = new Date(a.data_abertura || a.created_at || 0); return d.getFullYear() === m.ano && d.getMonth() === m.mes; });
            return { rotulo: `${MESES[m.mes]}/${String(m.ano).slice(2)}`, impl: doMes.filter(a => a.tipo_demanda === 'IMPLANTACAO').length, oper: doMes.filter(a => a.tipo_demanda === 'OPERACAO').length };
        });
    }, [lista]);
    const maxMes = Math.max(1, ...porMes.map(m => m.impl + m.oper));

    // Orçamentos seguem o mesmo filtro, pela atividade de cada um.
    const idsVisiveis = useMemo(() => new Set(lista.map(a => a.id)), [lista]);
    const orc = useMemo(() => {
        const bs = budgets.filter(b => idsVisiveis.has(b.atividade_id));
        const soma = (st: string) => bs.filter(b => b.status === st).reduce((s, b) => s + (b.total_cliente || 0), 0);
        return {
            total: bs.length, rascunho: bs.filter(b => b.status === 'RASCUNHO').length, enviado: bs.filter(b => b.status === 'ENVIADO').length,
            aprovado: bs.filter(b => b.status === 'APROVADO').length, valorAprovado: soma('APROVADO'), valorEnviado: soma('ENVIADO'),
            ultimos: [...bs].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()).slice(0, 5),
        };
    }, [budgets, idsVisiveis]);

    const irAtividades = () => onNavigateTo?.('atividades');
    const nomeUf = (sigla: string) => UFS.find(u => u.sigla === sigla)?.nome || sigla;

    return (
        <div className="p-8 text-foreground">
            <PageHeader icone={LayoutDashboard} tom={TOM_MODULO.overview} titulo="Dashboard"
                descricao="Carteira de atividades, clientes, operadoras e orçamentos"
                acoes={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className={ALTERNADOR} role="group" aria-label="Área">
                            {(['TODAS', 'IMPLANTACAO', 'OPERACAO'] as const).map(t => (
                                <button key={t} onClick={() => setArea(t)} aria-pressed={area === t}
                                    className={`${SEGMENTO} ${area === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                    {t === 'TODAS' ? 'Todas' : TIPOS_DEMANDA_LABEL[t]}
                                </button>
                            ))}
                        </div>
                        <select aria-label="Detentora" value={detentora} onChange={e => setDetentora(e.target.value)} className={`${CAMPO} w-48`}>
                            <option value="">Todas as detentoras</option>
                            {detentoras.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                } />

            {loading ? <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p> : (<>
            {/* ── Números principais */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
                <Kpi icone={Layers} rotulo="Atividades" valor={n.total || '—'} detalhe={n.total ? `${n.abertas} em aberto` : 'Nenhuma atividade'} onClick={irAtividades} />
                <Kpi icone={Play} rotulo="Em execução" valor={n.execucao || '—'} tom="blue" />
                <Kpi icone={Clock} rotulo="Prazo vencido" valor={n.atrasadas || '—'} tom={n.atrasadas ? 'rose' : undefined} detalhe={n.atrasadas ? 'término planejado passou' : 'Nenhuma atrasada'} />
                <Kpi icone={CheckCircle2} rotulo="Concluídas" valor={n.concluidas || '—'} tom={n.concluidas ? 'green' : undefined} />
                <Kpi icone={Banknote} rotulo="Valor contratado" valor={moeda(n.receita)} pequeno />
                <Kpi icone={Wallet} rotulo="Custo pago" valor={moeda(n.custo)} pequeno
                    detalhe={n.margem == null ? 'Sem valor contratado' : `Margem ${pct(n.margem)}`} />
            </div>

            {/* ── Implantação × operação e situação */}
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <Painel titulo="Implantação × operação" className="lg:col-span-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {porArea.map(x => (
                            <div key={x.tipo} className={`rounded-lg border border-border p-4 ${VEU[tomDe(TOM_AREA, x.tipo)]}`}>
                                <p className={`text-xs font-semibold ${TEXTO[tomDe(TOM_AREA, x.tipo)]}`}>{TIPOS_DEMANDA_LABEL[x.tipo]}</p>
                                <p className="mt-1 text-3xl font-semibold tabular-nums">{x.n || '—'}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{x.n ? `${x.abertas} em aberto · ${moeda(x.v)} contratado` : 'Nenhuma atividade'}</p>
                            </div>
                        ))}
                    </div>
                    {subtipos.length > 0 && (
                        <div className="mt-4">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Operação por tipo de serviço</p>
                            <Barras itens={subtipos.map(s => ({ rotulo: s.chave === 'SEM_SUBTIPO' ? 'Sem tipo' : SUBTIPOS_OPERACAO_LABEL[s.chave] || s.chave, n: s.n, tom: 'teal' as Tom }))} />
                        </div>
                    )}
                </Painel>
                <Painel titulo="Situação das atividades" acao={<Link onClick={irAtividades}>Abrir atividades</Link>}>
                    <Barras itens={porStatus.map(s => ({ rotulo: STATUS_OPERACIONAL[s.s].label, n: s.n, tom: tomDe(TOM_STATUS, s.s) }))} mostrarZero />
                </Painel>
            </div>

            {/* ── Clientes */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Painel titulo="Por detentora (sharing)">
                    <Barras itens={porSharing.map(s => ({ rotulo: s.chave, n: s.n, extra: moeda(s.v), tom: tomDe(TOM_SHARING, s.chave), onClick: () => setDetentora(detentora === s.chave ? '' : s.chave) }))} />
                </Painel>
                <Painel titulo="Por operadora">
                    <Barras itens={porOperadora.map(s => ({ rotulo: s.chave === 'SEM_OPERADORA' ? 'Sem operadora' : s.chave, n: s.n, extra: moeda(s.v), tom: tomDe(TOM_OPERADORA, s.chave) }))} />
                </Painel>
                <Painel titulo="Por estado">
                    <Barras itens={porUf.slice(0, 8).map(s => ({ rotulo: s.chave === 'SEM_UF' ? 'Sem UF' : `${s.chave} · ${nomeUf(s.chave)}`, n: s.n, extra: moeda(s.v), tom: 'indigo' as Tom }))} />
                    {porRegiao.length > 0 && (
                        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {porRegiao.map(r => <span key={r.chave}>{REGIAO_LABEL[r.chave] || r.chave} <strong className="text-foreground tabular-nums">{r.n}</strong></span>)}
                        </p>
                    )}
                </Painel>
            </div>

            {/* ── Volume, tipos de site, pendências */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Painel titulo="Volume por mês" subtitulo="Atividades abertas nos últimos 6 meses">
                    <div className="flex h-40 items-end gap-3">
                        {porMes.map(m => (
                            <div key={m.rotulo} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.rotulo}: ${m.impl} implantação, ${m.oper} operação`}>
                                <span className="text-xs font-semibold tabular-nums">{m.impl + m.oper || ''}</span>
                                <div className="flex w-full max-w-[36px] flex-col-reverse overflow-hidden rounded-t" style={{ height: `${((m.impl + m.oper) / maxMes) * 100}%` }}>
                                    <div className={SOLIDO[tomDe(TOM_AREA, 'IMPLANTACAO')]} style={{ height: `${m.impl + m.oper ? (m.impl / (m.impl + m.oper)) * 100 : 0}%` }} />
                                    <div className={SOLIDO[tomDe(TOM_AREA, 'OPERACAO')]} style={{ height: `${m.impl + m.oper ? (m.oper / (m.impl + m.oper)) * 100 : 0}%` }} />
                                </div>
                                <span className="text-[11px] text-muted-foreground">{m.rotulo}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${SOLIDO[tomDe(TOM_AREA, 'IMPLANTACAO')]}`} />Implantação</span>
                        <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${SOLIDO[tomDe(TOM_AREA, 'OPERACAO')]}`} />Operação</span>
                    </p>
                </Painel>
                <Painel titulo="Implantação por tipo de site">
                    {porTipoSite.length
                        ? <Barras itens={porTipoSite.map(s => ({ rotulo: s.chave === 'SEM_TIPO' ? 'Sem tipo' : rotuloTipoSite(s.chave), n: s.n, tom: 'blue' as Tom }))} />
                        : <p className="text-sm text-muted-foreground">Nenhuma implantação no filtro.</p>}
                </Painel>
                <Painel titulo="Pendências" acao={<Link onClick={irAtividades}>Resolver</Link>}>
                    <ul className="space-y-2 text-sm">
                        <Pendencia icone={Clock} n={n.atrasadas} texto="com prazo vencido" grave />
                        <Pendencia icone={FileWarning} n={n.correcao} texto="documentos em correção" grave />
                        <Pendencia icone={FileWarning} n={n.documentos} texto="documentos pendentes" />
                        <Pendencia icone={Receipt} n={n.semPO} texto="atividades em aberto sem PO" />
                        <Pendencia icone={Paperclip} n={n.comprovantes} texto="comprovantes de pagamento pendentes" />
                    </ul>
                    {!n.atrasadas && !n.correcao && !n.documentos && !n.semPO && !n.comprovantes && <p className="text-sm text-ok">Nenhuma pendência no filtro.</p>}
                </Painel>
            </div>

            {/* ── Projetos e orçamentos */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Painel titulo="Projetos" acao={<Link onClick={irAtividades}>Ver projetos</Link>}>
                    <div className="flex items-baseline gap-2"><FolderOpen size={18} aria-hidden className="text-primary" />
                        <span className="text-3xl font-semibold tabular-nums">{projetos.filter((p: any) => (p.atividades?.length ?? p._count?.atividades ?? 1) > 0).length || '—'}</span>
                        <span className="text-sm text-muted-foreground">projeto(s) com atividades</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">{n.emProjeto ? `${n.emProjeto} de ${n.total} atividades estão agrupadas em projetos (${pct((n.emProjeto / Math.max(1, n.total)) * 100)}).` : 'Nenhuma atividade agrupada no filtro.'}</p>
                </Painel>
                <Painel titulo="Orçamentos" className="lg:col-span-2" acao={<Link onClick={() => onNavigateTo?.('historico')}>Ver todos os orçamentos</Link>}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Mini rotulo="Total" valor={orc.total} />
                        <Mini rotulo="Rascunho" valor={orc.rascunho} />
                        <Mini rotulo="Enviados" valor={orc.enviado} detalhe={orc.valorEnviado ? moeda(orc.valorEnviado) : undefined} />
                        <Mini rotulo="Aprovados" valor={orc.aprovado} detalhe={orc.valorAprovado ? moeda(orc.valorAprovado) : undefined} />
                    </div>
                    {orc.ultimos.length > 0 && (
                        <ul className="mt-4 divide-y divide-border/60 text-sm">
                            {orc.ultimos.map((b: any) => (
                                <li key={b.id} className="flex items-center gap-3 py-2">
                                    <span className="min-w-0 flex-1 truncate">{b.numero && <span className="mr-2 font-id text-xs text-muted-foreground">{b.numero}</span>}{b.assunto || b.atividade?.titulo || 'Orçamento'}</span>
                                    {b.atividade?.id_site_sharing && <span className="font-id text-xs text-muted-foreground">{b.atividade.id_site_sharing}</span>}
                                    <span className="tabular-nums text-xs">{b.total_cliente ? moeda(b.total_cliente) : '—'}</span>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{STATUS_ORCAMENTO[b.status] || b.status}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Painel>
            </div>
            </>)}
        </div>
    );
}

function Kpi({ icone: Icone, rotulo, valor, detalhe, tom, pequeno, onClick }: {
    icone: typeof Layers; rotulo: string; valor: React.ReactNode; detalhe?: string; tom?: Tom; pequeno?: boolean; onClick?: () => void;
}) {
    const Corpo = onClick ? 'button' : 'div';
    return (
        <Corpo onClick={onClick} className={`flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left ${onClick ? 'hover:border-primary/50' : ''}`}>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-muted-foreground"><Icone size={16} aria-hidden /></span>
            <span className="min-w-0">
                <span className="block text-xs font-medium text-muted-foreground">{rotulo}</span>
                <span className={`block font-semibold tabular-nums ${pequeno ? 'text-lg' : 'text-2xl'} ${tom ? TEXTO[tom] : ''}`}>{valor}</span>
                {detalhe && <span className="block truncate text-[11px] text-muted-foreground">{detalhe}</span>}
            </span>
        </Corpo>
    );
}

function Painel({ titulo, subtitulo, acao, className = '', children }: { titulo: string; subtitulo?: string; acao?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>
            <header className="mb-4 flex items-start justify-between gap-3">
                <div><h2 className="text-[15px] font-semibold">{titulo}</h2>{subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}</div>
                {acao}
            </header>
            {children}
        </section>
    );
}

function Link({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
    return <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">{children}<ArrowRight size={12} aria-hidden /></button>;
}

/** Lista de barras horizontais: rótulo, barra proporcional, quantidade e valor. */
function Barras({ itens, mostrarZero }: { itens: { rotulo: string; n: number; extra?: string; tom: Tom; onClick?: () => void }[]; mostrarZero?: boolean }) {
    const visiveis = mostrarZero ? itens : itens.filter(i => i.n > 0);
    if (!visiveis.length) return <p className="text-sm text-muted-foreground">Nada no filtro.</p>;
    const max = Math.max(1, ...visiveis.map(i => i.n));
    return (
        <ul className="space-y-2.5">
            {visiveis.map(i => {
                const conteudo = (<>
                    <span className="w-32 shrink-0 truncate text-left text-xs" title={i.rotulo}>{i.rotulo}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--progress-track))]">
                        <span className={`block h-full rounded-full ${SOLIDO[i.tom]}`} style={{ width: `${(i.n / max) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right text-xs font-semibold tabular-nums">{i.n || '—'}</span>
                    {i.extra !== undefined && <span className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">{i.extra}</span>}
                </>);
                return (
                    <li key={i.rotulo}>
                        {i.onClick
                            ? <button type="button" onClick={i.onClick} className="flex w-full items-center gap-3 rounded hover:bg-secondary/30" title="Filtrar por esta detentora">{conteudo}</button>
                            : <div className="flex items-center gap-3">{conteudo}</div>}
                    </li>
                );
            })}
        </ul>
    );
}

function Pendencia({ icone: Icone, n, texto, grave }: { icone: typeof Layers; n: number; texto: string; grave?: boolean }) {
    if (!n) return null;
    return <li className={`flex items-center gap-2 font-medium ${grave ? 'text-crit' : 'text-warn'}`}><Icone size={14} aria-hidden className="shrink-0" /><span className="tabular-nums">{n}</span> {texto}</li>;
}

function Mini({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe?: string }) {
    return (
        <div className="rounded-lg bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="text-xl font-semibold tabular-nums">{valor || '—'}</p>
            {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
        </div>
    );
}

export default Dashboard;
