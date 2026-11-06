// Execução por equipe própria e rateio de mão de obra (05/11/2026).
// Funcionário que executa a atividade sem pagamento próprio dela: registra-se quem,
// quantos dias e se houve material. O pagamento semanal/mensal dele é rateado entre
// as execuções do período, proporcional aos dias — e vira custo real de cada uma.
import { useCallback, useEffect, useState } from 'react';
import { Trash2, Users, X } from 'lucide-react';
import { Field, GhostButton, PrimaryButton, inputClass } from './ui';
import { fmtData, fmtMoeda } from './constants';
import { authFetch } from '../../lib/authFetch';

const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diasEntre = (a: string, b: string) => {
    if (!a || !b) return 0;
    const n = Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000) + 1;
    return n > 0 ? n : 0;
};
const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function EquipePropriaForm({ atividadeId, funcionarios, onCancelar, onSalvo }: {
    atividadeId: string; funcionarios: any[]; onCancelar: () => void; onSalvo: () => void;
}) {
    const [f, setF] = useState({ funcionario_id: '', data_inicio: hoje(), data_fim: hoje(), dias: '1', houve_material: false, observacao: 'Mão de obra paga no pagamento semanal/fechamento do mês' });
    const [diasManual, setDiasManual] = useState(false);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const mudarData = (campo: 'data_inicio' | 'data_fim', v: string) => setF(x => {
        const n = { ...x, [campo]: v };
        if (campo === 'data_inicio' && n.data_fim < v) n.data_fim = v;
        if (!diasManual) n.dias = String(diasEntre(n.data_inicio, n.data_fim) || 1);
        return n;
    });
    async function salvar() {
        setErro(''); setSalvando(true);
        try {
            const r = await authFetch('/api/equipe-propria', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ atividade_id: atividadeId, ...f, dias: Number(String(f.dias).replace(',', '.')) }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao registrar');
            onSalvo();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }
    return (
        <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Users size={16} aria-hidden /> Execução por equipe própria (sem desembolso)</p>
            <p className="mb-3 text-xs text-muted-foreground">Não gera pagamento nem e-mail. O custo da mão de obra chega a esta atividade quando o pagamento semanal ou mensal do funcionário for rateado (Mais ações › Ratear entre atividades).</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Executante (funcionário) *">
                    <select className={inputClass} value={f.funcionario_id} onChange={e => setF(x => ({ ...x, funcionario_id: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {funcionarios.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cargo ? ` (${p.cargo})` : ''}</option>)}
                    </select>
                </Field>
                <Field label="Finalidade"><input className={inputClass} value="Mão de obra própria" disabled /></Field>
                <Field label="Início *"><input type="date" className={inputClass} value={f.data_inicio} onChange={e => mudarData('data_inicio', e.target.value)} /></Field>
                <Field label="Fim *"><input type="date" className={inputClass} value={f.data_fim} min={f.data_inicio} onChange={e => mudarData('data_fim', e.target.value)} /></Field>
                <Field label="Dias trabalhados nesta atividade">
                    <input type="number" min="0.5" step="0.5" className={inputClass} value={f.dias} onChange={e => { setDiasManual(true); setF(x => ({ ...x, dias: e.target.value })); }} />
                </Field>
                <Field label="Houve material?">
                    <select className={inputClass} value={f.houve_material ? 'SIM' : 'NAO'} onChange={e => setF(x => ({ ...x, houve_material: e.target.value === 'SIM' }))}>
                        <option value="NAO">Não — só mão de obra</option>
                        <option value="SIM">Sim — material lançado em outro pagamento</option>
                    </select>
                </Field>
                <div className="md:col-span-2"><Field label="Observação"><input className={inputClass} value={f.observacao} onChange={e => setF(x => ({ ...x, observacao: e.target.value }))} /></Field></div>
            </div>
            {erro && <p className="mt-2 text-xs text-crit">{erro}</p>}
            <div className="mt-3 flex justify-end gap-2">
                <GhostButton onClick={onCancelar}>Cancelar</GhostButton>
                <PrimaryButton onClick={salvar} disabled={salvando || !f.funcionario_id || !f.data_inicio || !f.data_fim || !(Number(String(f.dias).replace(',', '.')) > 0)}>{salvando ? 'Registrando…' : 'Registrar execução'}</PrimaryButton>
            </div>
        </div>
    );
}

export function EquipePropriaLista({ atividadeId, versao }: { atividadeId: string; versao: number }) {
    const [itens, setItens] = useState<any[]>([]);
    const [erro, setErro] = useState('');
    const carregar = useCallback(async () => {
        const r = await authFetch(`/api/equipe-propria?atividade_id=${atividadeId}`);
        setItens(r.ok ? await r.json() : []);
    }, [atividadeId]);
    useEffect(() => { carregar().catch(() => undefined); }, [carregar, versao]);
    async function excluir(e: any) {
        if (!confirm(`Excluir a execução de ${e.funcionario?.nome}?${e.rateios?.length ? ' O rateio de mão de obra dela também sai.' : ''}`)) return;
        const r = await authFetch(`/api/equipe-propria/${e.id}`, { method: 'DELETE' });
        if (!r.ok) { setErro((await r.json().catch(() => ({}))).error || 'Erro ao excluir'); return; }
        carregar();
    }
    if (!itens.length) return null;
    return (
        <div className="mb-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Users size={14} aria-hidden /> Equipe própria — sem desembolso nesta atividade</div>
            {itens.map(e => {
                const rateado = (e.rateios || []).reduce((s: number, x: any) => s + x.valor, 0);
                return (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 text-sm last:border-0">
                        <span className="font-semibold">{e.funcionario?.nome}</span>
                        <span className="text-muted-foreground">{fmtData(e.data_inicio)}{e.data_fim && String(e.data_fim).slice(0, 10) !== String(e.data_inicio).slice(0, 10) ? ` a ${fmtData(e.data_fim)}` : ''} · {e.dias} dia(s)</span>
                        <span className="text-xs text-muted-foreground">{e.houve_material ? 'Com material (lançado à parte)' : 'Só mão de obra'}</span>
                        <span className={`text-xs font-semibold ${rateado > 0 ? 'text-ok' : 'text-warn'}`}>
                            {rateado > 0 ? `Mão de obra rateada: ${fmtMoeda(rateado)}${(e.rateios || []).map((x: any) => x.contratacao?.atividade?.codigo).filter(Boolean).length ? ` (pagamento em ${[...new Set((e.rateios || []).map((x: any) => x.contratacao?.atividade?.codigo))].join(', ')})` : ''}` : 'Aguardando rateio do pagamento semanal/mensal'}
                        </span>
                        {e.observacao && <span className="text-xs text-muted-foreground">{e.observacao}</span>}
                        <button type="button" onClick={() => excluir(e)} title="Excluir execução" className="ml-auto text-muted-foreground hover:text-crit"><Trash2 size={14} aria-hidden /></button>
                    </div>
                );
            })}
            {erro && <p className="px-3 py-2 text-xs text-crit">{erro}</p>}
        </div>
    );
}

/** Rateio do pagamento semanal/mensal do funcionário entre as execuções do período. */
export function RateioMaoDeObraModal({ contratacao, onFechar, onSalvo }: { contratacao: any; onFechar: () => void; onSalvo: () => void }) {
    const semanal = contratacao.finalidade === 'PAGAMENTO_SEMANAL';
    const pagoEm = String(contratacao.parcelas?.find((p: any) => p.data_pagamento)?.data_pagamento || contratacao.parcelas?.[0]?.data_prevista || hoje()).slice(0, 10);
    const [periodo, setPeriodo] = useState(() => semanal
        ? { inicio: somaDias(pagoEm, -6), fim: pagoEm }
        : { inicio: `${pagoEm.slice(0, 7)}-01`, fim: pagoEm });
    const [dados, setDados] = useState<any>(null);
    const [valores, setValores] = useState<Record<string, string>>({});
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const buscar = useCallback(async () => {
        setErro('');
        const r = await authFetch(`/api/equipe-propria/rateio/${contratacao.id}?inicio=${periodo.inicio}&fim=${periodo.fim}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { setErro(d.error || 'Erro ao buscar as execuções'); setDados(null); return; }
        setDados(d);
        setValores(Object.fromEntries(d.itens.map((i: any) => [i.execucao_id, String(i.valor_gravado ?? i.valor_sugerido)])));
    }, [contratacao.id, periodo.inicio, periodo.fim]);
    useEffect(() => { buscar(); }, [buscar]);
    const num = (v: string) => Number(String(v || '').replace(',', '.')) || 0;
    const soma = Object.values(valores).reduce((s, v) => s + num(v), 0);
    const total = dados?.contratacao?.valor ?? contratacao.valor_contratado;
    async function salvar() {
        setErro(''); setSalvando(true);
        try {
            const itens = (dados?.itens || []).map((i: any) => ({ execucao_id: i.execucao_id, valor: num(valores[i.execucao_id]), dias: i.dias }));
            const r = await authFetch(`/api/equipe-propria/rateio/${contratacao.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens }) });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao salvar o rateio');
            onSalvo();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-base font-bold">Ratear mão de obra entre atividades</h3>
                        <p className="text-xs text-muted-foreground">{contratacao.funcionario?.nome} · pagamento de {fmtMoeda(total)} — proporcional aos dias trabalhados em cada atividade no período.</p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                </div>
                <div className="mb-3 flex flex-wrap items-end gap-3">
                    <Field label="Período de"><input type="date" className={`${inputClass} w-44`} value={periodo.inicio} onChange={e => setPeriodo(p => ({ ...p, inicio: e.target.value }))} /></Field>
                    <Field label="até"><input type="date" className={`${inputClass} w-44`} value={periodo.fim} onChange={e => setPeriodo(p => ({ ...p, fim: e.target.value }))} /></Field>
                </div>
                {dados && !dados.itens.length && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nenhuma execução por equipe própria de {contratacao.funcionario?.nome} nesse período. Registre a execução nas atividades (Pagamentos › Novo pagamento › Execução por equipe própria).</p>}
                {dados?.itens?.length > 0 && (
                    <table className="w-full text-sm">
                        <thead className="bg-primary text-primary-foreground"><tr className="text-left text-xs">
                            <th className="px-3 py-2">Atividade</th><th className="px-3 py-2">Período</th><th className="px-3 py-2 text-right">Dias</th><th className="px-3 py-2 text-right">Valor</th>
                        </tr></thead>
                        <tbody>
                            {dados.itens.map((i: any) => (
                                <tr key={i.execucao_id} className="border-b border-border/60">
                                    <td className="px-3 py-2"><span className="font-semibold">{i.atividade.codigo}</span> <span className="text-muted-foreground">{i.atividade.id_site_sharing} · {i.atividade.titulo}</span></td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtData(i.data_inicio)} a {fmtData(i.data_fim)}</td>
                                    <td className="px-3 py-2 text-right">{i.dias}</td>
                                    <td className="px-3 py-2 text-right"><input type="number" step="0.01" min="0" className={`${inputClass} h-8 w-32 text-right`} value={valores[i.execucao_id] ?? ''} onChange={e => setValores(v => ({ ...v, [i.execucao_id]: e.target.value }))} /></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot><tr className="font-semibold">
                            <td className="px-3 py-2" colSpan={2}>Total rateado {dados.total_dias ? `· ${dados.total_dias} dia(s)` : ''}</td>
                            <td colSpan={2} className={`px-3 py-2 text-right ${soma > total + 0.01 ? 'text-crit' : ''}`}>{fmtMoeda(soma)} de {fmtMoeda(total)}</td>
                        </tr></tfoot>
                    </table>
                )}
                <p className="mt-2 text-xs text-muted-foreground">O valor rateado sai do custo de {dados?.contratacao?.atividade_codigo || 'onde o pagamento foi lançado'} e entra no custo real de cada atividade. O que não for rateado continua lá.</p>
                {erro && <p className="mt-2 text-xs text-crit">{erro}</p>}
                <div className="mt-4 flex justify-end gap-2">
                    <GhostButton onClick={onFechar}>Cancelar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={salvando || !dados || soma > total + 0.01}>{salvando ? 'Salvando…' : 'Salvar rateio'}</PrimaryButton>
                </div>
            </div>
        </div>
    );
}
