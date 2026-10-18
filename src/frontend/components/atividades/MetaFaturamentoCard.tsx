import { useCallback, useEffect, useState } from 'react';
import { History, Target } from 'lucide-react';
import { Card, ErrorBanner, inputClass } from './ui';
import { fmtMoeda } from './constants';
import { authFetch } from '../../lib/authFetch';
import { usePermissao } from '../../lib/permissoes';

// Meta de faturamento da atividade (18/10/2026): mês em que deve faturar e quanto.
// Mudar o mês depois de definido é do gestor/administrador, com motivo.

export const SITUACAO_META: Record<string, { rotulo: string; classe: string }> = {
    SEM_META: { rotulo: 'Sem meta', classe: 'bg-muted text-muted-foreground' },
    NO_PRAZO: { rotulo: 'No prazo', classe: 'bg-primary/15 text-primary' },
    VENCE_ESTE_MES: { rotulo: 'Vence este mês', classe: 'bg-warn/15 text-warn' },
    VENCIDA: { rotulo: 'Vencida', classe: 'bg-crit/15 text-crit' },
    CUMPRIDA: { rotulo: 'Cumprida', classe: 'bg-ok/15 text-ok' },
    CUMPRIDA_ATRASO: { rotulo: 'Cumprida com atraso', classe: 'bg-ok/15 text-ok' },
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (mes?: string | null) => {
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return '—';
    const [a, m] = mes.split('-');
    return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
};

interface Meta {
    mes: string | null; valor: number | null; valor_sugerido: number | null; situacao: string; faturado: number;
    adiamentos: number; reincidente: boolean;
    historico: { id: string; mes_anterior: string | null; mes_novo: string | null; valor_anterior: number | null; valor_novo: number | null; motivo: string | null; alterado_por: string | null; created_at: string }[];
}

export default function MetaFaturamentoCard({ atividadeId }: { atividadeId: string }) {
    const podeAlterarMes = usePermissao('metas.alterar');
    const podeEditar = usePermissao('atividades.gerenciar');
    const [meta, setMeta] = useState<Meta | null>(null);
    const [form, setForm] = useState({ mes: '', valor: '', motivo: '' });
    const [editando, setEditando] = useState(false);
    const [verHistorico, setVerHistorico] = useState(false);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        const r = await authFetch(`/api/atividades/${atividadeId}/meta`);
        if (!r.ok) return;
        const d: Meta = await r.json();
        setMeta(d);
        setForm({ mes: d.mes || '', valor: d.valor != null ? String(d.valor) : d.valor_sugerido ? String(d.valor_sugerido) : '', motivo: '' });
    }, [atividadeId]);
    useEffect(() => { carregar(); }, [carregar]);

    if (!meta) return null;
    const mesTravado = !!meta.mes && !podeAlterarMes;
    const mudouMes = !!meta.mes && form.mes !== meta.mes;
    const sit = SITUACAO_META[meta.situacao] || SITUACAO_META.SEM_META;

    async function salvar() {
        setErro(''); setSalvando(true);
        try {
            const r = await authFetch(`/api/atividades/${atividadeId}/meta`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mes: form.mes || null, valor: form.valor === '' ? null : Number(form.valor), motivo: form.motivo || null }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Erro ao salvar a meta');
            setMeta(d); setEditando(false);
            setForm({ mes: d.mes || '', valor: d.valor != null ? String(d.valor) : '', motivo: '' });
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    return (
        <Card title="Meta de faturamento" action={podeEditar && !editando ? (
            <button type="button" onClick={() => setEditando(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">
                <Target size={14} aria-hidden /> {meta.mes ? 'Alterar meta' : 'Definir meta'}
            </button>
        ) : undefined}>
            <ErrorBanner message={erro} />
            {!editando ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div><div className="text-xs text-muted-foreground">Mês da meta</div><div className="mt-0.5 text-lg font-bold">{rotuloMes(meta.mes)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Valor da meta</div><div className="mt-0.5 text-lg font-bold tabular-nums">{meta.valor ? fmtMoeda(meta.valor) : '—'}</div></div>
                    <div><div className="text-xs text-muted-foreground">Faturado</div><div className="mt-0.5 text-lg font-bold tabular-nums">{meta.faturado ? fmtMoeda(meta.faturado) : '—'}</div></div>
                    <div><div className="text-xs text-muted-foreground">Situação</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sit.classe}`}>{sit.rotulo}</span>
                            {meta.reincidente && <span className="rounded-full bg-crit/15 px-2.5 py-0.5 text-xs font-semibold text-crit" title={`Mês da meta adiado ${meta.adiamentos} vezes`}>Reincidente · {meta.adiamentos} adiamentos</span>}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-xs"><span className="mb-1 block font-semibold text-muted-foreground">Mês da meta</span>
                        <input type="month" className={inputClass} value={form.mes} disabled={mesTravado} onChange={e => setForm(f => ({ ...f, mes: e.target.value }))} />
                        {mesTravado && <span className="mt-1 block text-[11px] text-muted-foreground">Só gestor ou administrador altera o mês depois de definido.</span>}
                    </label>
                    <label className="text-xs"><span className="mb-1 block font-semibold text-muted-foreground">Valor da meta (R$)</span>
                        <input type="number" min={0} step="0.01" className={inputClass} value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
                        {meta.valor_sugerido && !meta.valor && <span className="mt-1 block text-[11px] text-muted-foreground">Sugerido pelo valor do contrato.</span>}
                    </label>
                    {mudouMes && (
                        <label className="text-xs"><span className="mb-1 block font-semibold text-muted-foreground">Motivo da alteração do mês *</span>
                            <input className={inputClass} value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex.: PO atrasou no cliente" />
                        </label>
                    )}
                    <div className="flex items-end justify-end gap-2 md:col-span-3">
                        <button type="button" onClick={() => { setEditando(false); setErro(''); carregar(); }} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold">Cancelar</button>
                        <button type="button" onClick={salvar} disabled={salvando || (mudouMes && form.motivo.trim().length < 5)}
                            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{salvando ? 'Salvando…' : 'Salvar meta'}</button>
                    </div>
                </div>
            )}
            {meta.historico.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-2">
                    <button type="button" onClick={() => setVerHistorico(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                        <History size={13} aria-hidden /> {verHistorico ? 'Ocultar histórico' : `Histórico (${meta.historico.length})`}
                    </button>
                    {verHistorico && (
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {meta.historico.map(h => (
                                <li key={h.id}>
                                    <span className="text-foreground">{new Date(h.created_at).toLocaleDateString('pt-BR')}</span> · {h.mes_anterior ? `${rotuloMes(h.mes_anterior)} → ${rotuloMes(h.mes_novo)}` : `definida para ${rotuloMes(h.mes_novo)}`}
                                    {h.valor_novo != null && h.valor_novo !== h.valor_anterior ? ` · ${fmtMoeda(h.valor_novo)}` : ''}
                                    {h.motivo ? ` · “${h.motivo}”` : ''}{h.alterado_por ? ` · ${h.alterado_por}` : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </Card>
    );
}
