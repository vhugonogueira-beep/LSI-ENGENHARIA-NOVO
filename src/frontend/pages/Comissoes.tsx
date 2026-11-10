// Comercial › Comissões (06/11/2026) — Comissionamento Rollout Engenharia.
// Líquido = bruto faturado − impostos − custo; faixa do líquido → % de cada agente;
// saldo = líquido − comissões; participação do gestor = % do saldo.
import { useCallback, useEffect, useState } from 'react';
import { Lock, Plus, Settings, Trash2, Unlock } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotuloMes = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtData = (v: any) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const CAMPO = 'h-9 rounded-lg border border-border bg-background px-2.5 text-sm';
const TH = 'px-3 py-2 text-left text-xs font-semibold';

async function api(url: string, init?: RequestInit) {
    const r = await authFetch(url, init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j;
}
const json = (method: string, body: any): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function Comissoes({ onAbrirAtividade }: { onAbrirAtividade?: (id: string) => void }) {
    const [mes, setMes] = useState(mesAnterior());
    const [dados, setDados] = useState<any>(null);
    const [ano, setAno] = useState<any>(null);
    const [erro, setErro] = useState('');
    const [config, setConfig] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setErro('');
        try {
            const [d, a] = await Promise.all([api(`/api/comissoes/mes/${mes}`), api(`/api/comissoes/ano/${mes.slice(0, 4)}`)]);
            setDados(d); setAno(a);
        } catch (e: any) { setErro(e.message); }
    }, [mes]);
    useEffect(() => { carregar(); }, [carregar]);

    async function fechar() {
        const meta = confirm(`Fechar ${rotuloMes(mes)}? Os valores ficam congelados.\n\nOK = meta considerada ATINGIDA\nCancelar = escolher "não atingida" ou desistir`);
        let metaAtingida: boolean | null = meta;
        if (!meta) {
            if (!confirm(`Fechar ${rotuloMes(mes)} com a meta NÃO atingida?`)) return;
            metaAtingida = false;
        }
        setSalvando(true);
        try { setDados(await api(`/api/comissoes/mes/${mes}/fechar`, json('POST', { meta_atingida: metaAtingida }))); await carregar(); }
        catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }
    async function reabrir() {
        const motivo = prompt(`Reabrir ${rotuloMes(mes)}? Informe o motivo (fica na auditoria):`);
        if (motivo === null) return;
        setSalvando(true);
        try { await api(`/api/comissoes/mes/${mes}/reabrir`, json('POST', { motivo })); await carregar(); }
        catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    const t = dados?.totais;
    return (
        <div className="mx-auto max-w-[1500px] px-4 py-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h1 className="text-xl font-bold">Comissionamento — Rollout Engenharia</h1>
                    <p className="text-xs text-muted-foreground">Líquido = faturado − impostos − custo das atividades · comissão da equipe pela faixa do líquido · participação do gestor sobre o saldo.</p>
                </div>
                <label className="text-xs text-muted-foreground">Mês de faturamento</label>
                <input type="month" className={CAMPO} value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
                <button type="button" onClick={() => setConfig(v => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60"><Settings size={15} aria-hidden /> Configuração</button>
            </div>
            {erro && <div role="alert" className="mb-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{erro}</div>}
            {config && <Configuracao onSalvo={() => { setConfig(false); carregar(); }} />}

            {dados && <>
                {dados.aviso_mudanca && <div className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{dados.aviso_mudanca}</div>}
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                    <Kpi r="Faturado bruto" v={moeda(t.bruto)} s={`${dados.atividades.length} atividade(s)`} />
                    <Kpi r={`Impostos (${pct(dados.aliquota_imposto)})`} v={moeda(t.impostos)} />
                    <Kpi r="Custo das atividades" v={moeda(t.custo)} s="custo real, proporcional ao faturado" />
                    <Kpi r="Líquido" v={moeda(t.liquido)} tom="text-primary" s={`Faixa ${t.faixa} · ${pct(t.percentual)} por agente`} />
                    <Kpi r="Comissões da equipe" v={moeda(t.comissoes)} s={`${pct(t.pct_comissoes_sobre_liquido)} do líquido`} />
                    <Kpi r="Saldo" v={moeda(t.saldo)} tom={t.saldo >= 0 ? 'text-ok' : 'text-crit'} s="líquido − comissões" />
                    <Kpi r={`${dados.gestor_nome || 'Gestor'} (${pct(dados.gestor_percentual)})`} v={moeda(t.gestor)} tom="text-ok" s="sobre o saldo" />
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    {dados.fechado
                        ? <><Lock size={15} className="text-ok" aria-hidden /><span><strong>{rotuloMes(mes)} fechado</strong> por {dados.fechamento?.por || '—'} em {fmtData(dados.fechamento?.em)} · meta {dados.fechamento?.meta_atingida === true ? 'atingida' : dados.fechamento?.meta_atingida === false ? 'não atingida' : '—'}</span>
                            <button type="button" disabled={salvando} onClick={reabrir} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary/60"><Unlock size={13} aria-hidden /> Reabrir</button></>
                        : <><span className="text-muted-foreground">{rotuloMes(mes)} em aberto — os valores mudam se entrar faturamento ou custo do mês.</span>
                            <button type="button" disabled={salvando || !dados.atividades.length} onClick={fechar} className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Lock size={13} aria-hidden /> Fechar mês</button></>}
                </div>

                <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_340px]">
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-primary text-primary-foreground"><tr>
                                <th className={TH}>Atividade / site</th><th className={TH}>Cliente</th><th className={TH}>PO / NF</th><th className={TH}>Faturado em</th>
                                <th className={`${TH} text-right`}>Bruto</th><th className={`${TH} text-right`}>Impostos</th><th className={`${TH} text-right`}>Custo</th><th className={`${TH} text-right`}>Líquido</th>
                            </tr></thead>
                            <tbody>
                                {!dados.atividades.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhuma remessa faturada em {rotuloMes(mes)} (status Faturado/Recebido com data de faturamento no mês).</td></tr>}
                                {dados.atividades.map((a: any) => (
                                    <tr key={a.atividade_id} className="border-b border-border/60">
                                        <td className="px-3 py-2"><button type="button" className="font-semibold text-primary hover:underline" onClick={() => onAbrirAtividade?.(a.atividade_id)}>{a.site || a.codigo}</button>
                                            <div className="text-[11px] text-muted-foreground">{a.codigo} · {a.titulo}</div></td>
                                        <td className="px-3 py-2 text-xs">{a.cliente || '—'}</td>
                                        <td className="px-3 py-2 text-xs">{a.pos.join(', ') || '—'}{a.nfs.length ? <div className="text-muted-foreground">NF {a.nfs.join(', ')}</div> : null}</td>
                                        <td className="px-3 py-2 text-xs">{fmtData(a.data_faturamento)}{a.fracao_faturada < 100 ? <div className="text-muted-foreground">{pct(a.fracao_faturada)} da atividade</div> : null}</td>
                                        <td className="px-3 py-2 text-right">{moeda(a.bruto)}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{moeda(a.impostos)}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground" title={a.fracao_faturada < 100 ? `Custo total ${moeda(a.custo_total)} × ${pct(a.fracao_faturada)}` : undefined}>{moeda(a.custo)}</td>
                                        <td className={`px-3 py-2 text-right font-semibold ${a.liquido < 0 ? 'text-crit' : ''}`}>{moeda(a.liquido)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {dados.atividades.length > 0 && <tfoot><tr className="bg-secondary/40 font-semibold">
                                <td className="px-3 py-2" colSpan={4}>Total de {rotuloMes(mes)}</td>
                                <td className="px-3 py-2 text-right">{moeda(t.bruto)}</td><td className="px-3 py-2 text-right">{moeda(t.impostos)}</td>
                                <td className="px-3 py-2 text-right">{moeda(t.custo)}</td><td className="px-3 py-2 text-right">{moeda(t.liquido)}</td>
                            </tr></tfoot>}
                        </table>
                    </div>
                    <div className="rounded-lg border border-border">
                        <div className="bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Comissão de {rotuloMes(mes)} — faixa {t.faixa} ({pct(t.percentual)})</div>
                        {!dados.agentes.length && <p className="px-3 py-4 text-xs text-muted-foreground">Nenhum agente ativo no mês. Cadastre em Configuração.</p>}
                        {dados.agentes.map((g: any) => (
                            <div key={g.id || g.nome} className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm"><span>{g.nome}<span className="ml-1 text-xs text-muted-foreground">{g.cargo}</span></span><strong>{moeda(g.comissao)}</strong></div>
                        ))}
                        <div className="flex justify-between bg-secondary/40 px-3 py-2 text-sm font-semibold"><span>Total da equipe</span><span>{moeda(t.comissoes)}</span></div>
                        <div className="flex justify-between px-3 py-2 text-sm"><span>Saldo (líquido − comissões)</span><span>{moeda(t.saldo)}</span></div>
                        <div className="flex justify-between px-3 py-2 text-sm font-semibold text-ok"><span>{dados.gestor_nome || 'Gestor'} · {pct(dados.gestor_percentual)} do saldo</span><span>{moeda(t.gestor)}</span></div>
                    </div>
                </div>
            </>}

            {ano && <PainelAnual ano={ano} onMes={setMes} mesAtual={mes} />}
        </div>
    );
}

function Kpi({ r, v, s, tom }: { r: string; v: string; s?: string; tom?: string }) {
    return <div className="rounded-lg border border-border bg-card px-3 py-2.5"><div className="text-[11px] text-muted-foreground">{r}</div><div className={`text-lg font-bold ${tom || ''}`}>{v}</div>{s && <div className="text-[11px] text-muted-foreground">{s}</div>}</div>;
}

function PainelAnual({ ano, onMes, mesAtual }: { ano: any; onMes: (m: string) => void; mesAtual: string }) {
    const nomes: string[] = [...new Set<string>(ano.meses.flatMap((m: any) => m.agentes.map((g: any) => g.nome)))];
    return (
        <div className="mb-4">
            <h2 className="mb-2 text-sm font-bold">Painel mensal — {ano.ano}</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[1100px] text-sm">
                    <thead className="bg-primary text-primary-foreground"><tr>
                        <th className={TH}>Mês</th><th className={`${TH} text-right`}>Bruto</th><th className={`${TH} text-right`}>Líquido</th><th className={`${TH} text-center`}>Faixa</th><th className={`${TH} text-right`}>% comissão</th>
                        {nomes.map(n => <th key={n} className={`${TH} text-right`}>Comissão {n}</th>)}
                        <th className={`${TH} text-right`}>Total comissões</th><th className={`${TH} text-right`}>Saldo</th><th className={`${TH} text-right`}>Gestor</th><th className={`${TH} text-center`}>Meta</th><th className={`${TH} text-center`}>Situação</th>
                    </tr></thead>
                    <tbody>
                        {ano.meses.map((m: any) => (
                            <tr key={m.mes} onClick={() => onMes(m.mes)} className={`cursor-pointer border-b border-border/60 hover:bg-secondary/40 ${m.mes === mesAtual ? 'bg-primary/10' : ''}`}>
                                <td className="px-3 py-1.5 font-semibold">{rotuloMes(m.mes)}</td>
                                <td className="px-3 py-1.5 text-right">{moeda(m.totais.bruto)}</td>
                                <td className="px-3 py-1.5 text-right">{moeda(m.totais.liquido)}</td>
                                <td className="px-3 py-1.5 text-center">{m.totais.liquido > 0 ? m.totais.faixa : '—'}</td>
                                <td className="px-3 py-1.5 text-right">{pct(m.totais.percentual)}</td>
                                {nomes.map(n => <td key={n} className="px-3 py-1.5 text-right">{moeda(m.agentes.find((g: any) => g.nome === n)?.comissao || 0)}</td>)}
                                <td className="px-3 py-1.5 text-right font-semibold">{moeda(m.totais.comissoes)}</td>
                                <td className="px-3 py-1.5 text-right">{moeda(m.totais.saldo)}</td>
                                <td className="px-3 py-1.5 text-right">{moeda(m.totais.gestor)}</td>
                                <td className="px-3 py-1.5 text-center">{m.meta_atingida === true ? 'SIM' : m.meta_atingida === false ? 'NÃO' : '—'}</td>
                                <td className="px-3 py-1.5 text-center text-xs">{m.fechado ? <span className="text-ok">Fechado</span> : <span className="text-muted-foreground">Aberto</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot><tr className="bg-secondary/40 font-semibold">
                        <td className="px-3 py-2">Total {ano.ano}</td><td className="px-3 py-2 text-right">{moeda(ano.totais.bruto)}</td><td className="px-3 py-2 text-right">{moeda(ano.totais.liquido)}</td><td /><td />
                        {nomes.map(n => <td key={n} className="px-3 py-2 text-right">{moeda(ano.agentes.find((g: any) => g.nome === n)?.comissao || 0)}</td>)}
                        <td className="px-3 py-2 text-right">{moeda(ano.totais.comissoes)}</td><td className="px-3 py-2 text-right">{moeda(ano.totais.saldo)}</td><td className="px-3 py-2 text-right">{moeda(ano.totais.gestor)}</td><td /><td />
                    </tr></tfoot>
                </table>
            </div>
            <h2 className="mb-2 mt-4 text-sm font-bold">Resumo individual — comissões acumuladas em {ano.ano}</h2>
            <div className="max-w-2xl overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-primary text-primary-foreground"><tr><th className={TH}>Membro</th><th className={TH}>Cargo</th><th className={`${TH} text-right`}>Comissão total</th><th className={`${TH} text-right`}>% do líquido</th><th className={TH}>Início</th></tr></thead>
                    <tbody>
                        {ano.agentes.map((g: any) => (
                            <tr key={g.nome} className="border-b border-border/60"><td className="px-3 py-1.5 font-semibold">{g.nome}</td><td className="px-3 py-1.5">{g.cargo || '—'}</td>
                                <td className="px-3 py-1.5 text-right">{moeda(g.comissao)}</td><td className="px-3 py-1.5 text-right">{ano.totais.liquido > 0 ? pct(g.comissao / ano.totais.liquido * 100) : '—'}</td><td className="px-3 py-1.5">{rotuloMes(g.inicio)}</td></tr>
                        ))}
                        <tr className="bg-secondary/40 font-semibold"><td className="px-3 py-1.5" colSpan={2}>Total comissões</td><td className="px-3 py-1.5 text-right">{moeda(ano.totais.comissoes)}</td><td className="px-3 py-1.5 text-right">{ano.totais.liquido > 0 ? pct(ano.totais.comissoes / ano.totais.liquido * 100) : '—'}</td><td /></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Configuracao({ onSalvo }: { onSalvo: () => void }) {
    const [cfg, setCfg] = useState<any>(null);
    const [agentes, setAgentes] = useState<any[]>([]);
    const [funcionarios, setFuncionarios] = useState<any[]>([]);
    const [novo, setNovo] = useState({ funcionario_id: '', nome: '', cargo: '', inicio_mes: mesAnterior(), fim_mes: '' });
    const [erro, setErro] = useState('');
    const carregar = useCallback(async () => {
        try {
            const [c, a, f] = await Promise.all([api('/api/comissoes/config'), api('/api/comissoes/agentes'), authFetch('/api/funcionarios').then(r => (r.ok ? r.json() : []))]);
            setCfg({ ...c, faixas: c.faixas.map((x: any) => ({ ate: x.ate ?? '', percentual: x.percentual })) }); setAgentes(a); setFuncionarios(f);
        } catch (e: any) { setErro(e.message); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);
    async function salvarCfg() {
        setErro('');
        try {
            await api('/api/comissoes/config', json('PUT', { ...cfg, faixas: cfg.faixas.map((f: any, i: number) => ({ ate: i === cfg.faixas.length - 1 ? null : Number(f.ate), percentual: Number(f.percentual) })) }));
            onSalvo();
        } catch (e: any) { setErro(e.message); }
    }
    async function addAgente() {
        setErro('');
        try { await api('/api/comissoes/agentes', json('POST', novo)); setNovo({ funcionario_id: '', nome: '', cargo: '', inicio_mes: mesAnterior(), fim_mes: '' }); carregar(); }
        catch (e: any) { setErro(e.message); }
    }
    async function atualizarAgente(g: any, campos: any) {
        try { await api(`/api/comissoes/agentes/${g.id}`, json('PUT', { ...g, ...campos })); carregar(); } catch (e: any) { setErro(e.message); }
    }
    async function removerAgente(g: any) {
        if (!confirm(`Remover ${g.nome} da comissão? Para manter o histórico, prefira informar o mês de fim.`)) return;
        try { await api(`/api/comissoes/agentes/${g.id}`, { method: 'DELETE' }); carregar(); } catch (e: any) { setErro(e.message); }
    }
    if (!cfg) return null;
    return (
        <div className="mb-4 grid gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4 xl:grid-cols-3">
            <div>
                <h3 className="mb-2 text-sm font-bold">Impostos e gestor</h3>
                <label className="mb-2 block text-xs">Alíquota de imposto (%)<input type="number" step="0.01" className={`${CAMPO} mt-1 w-full`} value={cfg.aliquota_imposto} onChange={e => setCfg({ ...cfg, aliquota_imposto: e.target.value })} /></label>
                <label className="mb-2 block text-xs">Gestor (nome)<input className={`${CAMPO} mt-1 w-full`} value={cfg.gestor_nome || ''} onChange={e => setCfg({ ...cfg, gestor_nome: e.target.value })} placeholder="Ex.: Victor" /></label>
                <label className="block text-xs">Participação do gestor sobre o saldo (%)<input type="number" step="0.01" className={`${CAMPO} mt-1 w-full`} value={cfg.gestor_percentual} onChange={e => setCfg({ ...cfg, gestor_percentual: e.target.value })} /></label>
            </div>
            <div>
                <h3 className="mb-2 text-sm font-bold">Faixas (sobre o líquido do mês)</h3>
                <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-left">Faixa</th><th className="text-left">Até (R$)</th><th className="text-left">% comissão</th></tr></thead>
                    <tbody>{cfg.faixas.map((f: any, i: number) => (
                        <tr key={i}><td className="py-0.5">{i + 1}</td>
                            <td className="py-0.5">{i === cfg.faixas.length - 1 ? <span className="text-muted-foreground">acima disso (∞)</span> : <input type="number" className={`${CAMPO} h-8 w-32`} value={f.ate} onChange={e => setCfg({ ...cfg, faixas: cfg.faixas.map((x: any, k: number) => k === i ? { ...x, ate: e.target.value } : x) })} />}</td>
                            <td className="py-0.5"><input type="number" step="0.01" className={`${CAMPO} h-8 w-24`} value={f.percentual} onChange={e => setCfg({ ...cfg, faixas: cfg.faixas.map((x: any, k: number) => k === i ? { ...x, percentual: e.target.value } : x) })} /></td></tr>
                    ))}</tbody></table>
                <button type="button" onClick={salvarCfg} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Salvar configuração</button>
            </div>
            <div>
                <h3 className="mb-2 text-sm font-bold">Agentes da comissão</h3>
                {agentes.map(g => (
                    <div key={g.id} className="mb-1 flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
                        <span className="font-semibold">{g.nome}</span><span className="text-muted-foreground">{g.cargo}</span>
                        <span>desde {rotuloMes(g.inicio_mes)}</span>
                        <label className="ml-auto flex items-center gap-1">até <input type="month" className={`${CAMPO} h-7 w-36 text-xs`} value={g.fim_mes || ''} onChange={e => atualizarAgente(g, { fim_mes: e.target.value || null })} /></label>
                        <button type="button" onClick={() => removerAgente(g)} title="Remover" className="text-muted-foreground hover:text-crit"><Trash2 size={13} /></button>
                    </div>
                ))}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <select className={CAMPO} value={novo.funcionario_id} onChange={e => { const f = funcionarios.find(x => x.id === e.target.value); setNovo({ ...novo, funcionario_id: e.target.value, nome: f?.nome || novo.nome, cargo: f?.cargo || novo.cargo }); }}>
                        <option value="">Funcionário…</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    <input className={CAMPO} placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} />
                    <input className={CAMPO} placeholder="Cargo" value={novo.cargo} onChange={e => setNovo({ ...novo, cargo: e.target.value })} />
                    <label className="flex items-center gap-1">início <input type="month" className={`${CAMPO} flex-1`} value={novo.inicio_mes} onChange={e => setNovo({ ...novo, inicio_mes: e.target.value })} /></label>
                </div>
                <button type="button" onClick={addAgente} disabled={!novo.nome.trim()} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary/60 disabled:opacity-50"><Plus size={13} /> Adicionar agente</button>
            </div>
            {erro && <p className="text-xs text-crit xl:col-span-3">{erro}</p>}
        </div>
    );
}
