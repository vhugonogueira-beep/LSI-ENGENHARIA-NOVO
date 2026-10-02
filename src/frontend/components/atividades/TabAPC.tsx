import { useState, useEffect, useCallback } from 'react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, EmptyState, Row, Dinheiro } from './ui';
import { fmtData } from './constants';

const APC_STATUS_ORDEM = ['AGUARDANDO_APC', 'APC_RECEBIDO', 'APC_VALIDADO', 'APC_LIBERADO'];
const APC_STATUS_LABEL: Record<string, string> = {
    AGUARDANDO_APC: 'Aguardando APC', APC_RECEBIDO: 'APC recebido', APC_VALIDADO: 'APC validado', APC_LIBERADO: 'APC liberado',
};

const FORM_INIT = { numero: '', data: '', documento_url: '', valor: '', responsavel: '', observacoes: '' };

export default function TabAPC({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [apcs, setApcs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(FORM_INIT);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/apcs?atividade_id=${atividade.id}`);
            setApcs(r.ok ? await r.json() : []);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    async function criar() {
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch('/api/apcs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    atividade_id: atividade.id,
                    numero: form.numero || null,
                    data: form.data || null,
                    documento_url: form.documento_url || null,
                    valor: form.valor ? parseFloat(form.valor) : null,
                    responsavel: form.responsavel || null,
                    observacoes: form.observacoes || null,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao criar APC');
            setForm(FORM_INIT);
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function avancar(id: string, novoStatus: string) {
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/apcs/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: novoStatus }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao avançar status');
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    const apcAtual = apcs[0];

    return (
        <Card title="APC — Autorização para execução">
            <ErrorBanner message={erro} />
            {!apcAtual ? (
                <>
                    <EmptyState text="Nenhum APC registrado para esta atividade. O APC libera a execução, mas não bloqueia o planejamento em paralelo." />
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <Field label="Número"><input className={inputClass} value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} /></Field>
                        <Field label="Data"><input type="date" className={inputClass} value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></Field>
                        <Field label="Valor (R$)"><input type="number" step="0.01" className={inputClass} value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} /></Field>
                        <Field label="Responsável"><input className={inputClass} value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} /></Field>
                        <div className="col-span-2">
                            <Field label="URL do documento"><input className={inputClass} value={form.documento_url} onChange={e => setForm(f => ({ ...f, documento_url: e.target.value }))} /></Field>
                        </div>
                    </div>
                    <div className="flex justify-end mt-3">
                        <PrimaryButton onClick={criar} disabled={salvando}>Registrar APC</PrimaryButton>
                    </div>
                </>
            ) : (
                <div>
                    <Row label="Número" value={apcAtual.numero && <span className="font-id">{apcAtual.numero}</span>} />
                    <Row label="Data" value={fmtData(apcAtual.data)} />
                    <Row label="Valor" value={<Dinheiro v={apcAtual.valor} />} />
                    <Row label="Responsável" value={apcAtual.responsavel} />
                    <div className="mt-4 pt-4 border-t border-border">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Status atual: {APC_STATUS_LABEL[apcAtual.status]}</div>
                        <div className="flex gap-2 flex-wrap">
                            {APC_STATUS_ORDEM.map((s, i) => {
                                const idxAtual = APC_STATUS_ORDEM.indexOf(apcAtual.status);
                                const isPast = i <= idxAtual;
                                const isNext = i === idxAtual + 1;
                                return (
                                    <GhostButton
                                        key={s}
                                        disabled={!isNext || salvando}
                                        onClick={() => avancar(apcAtual.id, s)}
                                        className={isPast ? 'opacity-50' : isNext ? 'border-primary text-primary' : ''}
                                    >
                                        {APC_STATUS_LABEL[s]}
                                    </GhostButton>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
