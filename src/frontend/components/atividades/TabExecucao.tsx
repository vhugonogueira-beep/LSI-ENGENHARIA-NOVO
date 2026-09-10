import { useState, useEffect, useCallback } from 'react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, inputClass, ErrorBanner, EmptyState, Row } from './ui';
import { fmtData } from './constants';

export default function TabExecucao({ atividade, onRefresh, usaRelatorioFotografico }: { atividade: AtividadeDetalhe; onRefresh: () => void; usaRelatorioFotografico?: boolean }) {
    const [, setRegistro] = useState<any>(null);
    const [rfis, setRfis] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const [execForm, setExecForm] = useState({
        avanco_percentual: '0', data_inicio: '', data_prevista_conclusao: '', data_real_conclusao: '',
        equipe: '', ocorrencias: '',
    });
    const [rfiForm, setRfiForm] = useState({ destinatario: '', protocolo: '', energizado: '', observacoes: '' });
    const [showRfiForm, setShowRfiForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [regR, rfiR] = await Promise.all([
                fetch(`/api/execucao/atividades/${atividade.id}`),
                fetch(`/api/execucao/rfis?atividade_id=${atividade.id}`),
            ]);
            const reg = regR.ok ? await regR.json() : null;
            setRegistro(reg);
            if (reg) {
                setExecForm({
                    avanco_percentual: String(reg.avanco_percentual ?? 0),
                    data_inicio: reg.data_inicio ? reg.data_inicio.substring(0, 10) : '',
                    data_prevista_conclusao: reg.data_prevista_conclusao ? reg.data_prevista_conclusao.substring(0, 10) : '',
                    data_real_conclusao: reg.data_real_conclusao ? reg.data_real_conclusao.substring(0, 10) : '',
                    equipe: reg.equipe || '', ocorrencias: reg.ocorrencias || '',
                });
            }
            setRfis(rfiR.ok ? await rfiR.json() : []);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    async function salvarExecucao() {
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/execucao/atividades/${atividade.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    avanco_percentual: parseFloat(execForm.avanco_percentual),
                    data_inicio: execForm.data_inicio || null,
                    data_prevista_conclusao: execForm.data_prevista_conclusao || null,
                    data_real_conclusao: execForm.data_real_conclusao || null,
                    equipe: execForm.equipe || null,
                    ocorrencias: execForm.ocorrencias || null,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar execução');
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function enviarRfi() {
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch('/api/execucao/rfis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    atividade_id: atividade.id,
                    destinatario: rfiForm.destinatario || null,
                    protocolo: rfiForm.protocolo || null,
                    energizado: rfiForm.energizado === '' ? null : rfiForm.energizado === 'true',
                    observacoes: rfiForm.observacoes || null,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao enviar RFI');
            setRfiForm({ destinatario: '', protocolo: '', energizado: '', observacoes: '' });
            setShowRfiForm(false);
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    const podeEnviarRfi = atividade.status_operacional === 'CONCLUIDA';

    return (
        <div>
            <ErrorBanner message={erro} />

            <Card title="Registro de Execução">
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <Field label="Data de Início"><input type="date" className={inputClass} value={execForm.data_inicio} onChange={e => setExecForm(f => ({ ...f, data_inicio: e.target.value }))} /></Field>
                    <Field label="Data Prevista de Conclusão"><input type="date" className={inputClass} value={execForm.data_prevista_conclusao} onChange={e => setExecForm(f => ({ ...f, data_prevista_conclusao: e.target.value }))} /></Field>
                    <Field label="Data Real de Conclusão"><input type="date" className={inputClass} value={execForm.data_real_conclusao} onChange={e => setExecForm(f => ({ ...f, data_real_conclusao: e.target.value }))} /></Field>
                    <Field label="Equipe"><input className={inputClass} value={execForm.equipe} onChange={e => setExecForm(f => ({ ...f, equipe: e.target.value }))} /></Field>
                </div>
                <Field label={`Avanço Físico: ${execForm.avanco_percentual}%`}>
                    <input type="range" min={0} max={100} value={execForm.avanco_percentual} onChange={e => setExecForm(f => ({ ...f, avanco_percentual: e.target.value }))} className="w-full accent-primary" />
                </Field>
                <div className="mt-3">
                    <Field label="Ocorrências / Não Conformidades">
                        <textarea rows={2} className={`${inputClass} resize-y`} value={execForm.ocorrencias} onChange={e => setExecForm(f => ({ ...f, ocorrencias: e.target.value }))} />
                    </Field>
                </div>
                <div className="flex justify-end mt-3">
                    <PrimaryButton onClick={salvarExecucao} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar Execução'}</PrimaryButton>
                </div>
                {execForm.avanco_percentual === '100' && !execForm.data_real_conclusao && (
                    <p className="text-xs text-amber-500 mt-2">Preencha a data real de conclusão para fechar o status operacional (G7).</p>
                )}
            </Card>

            <Card
                title={usaRelatorioFotografico ? 'Relatório Fotográfico' : 'RFI'}
                action={podeEnviarRfi ? <PrimaryButton onClick={() => setShowRfiForm(v => !v)}>{showRfiForm ? 'Cancelar' : usaRelatorioFotografico ? '+ Enviar Relatório' : '+ Enviar RFI'}</PrimaryButton> : undefined}
            >
                {!podeEnviarRfi && (
                    <p className="text-xs text-muted-foreground mb-3">
                        {usaRelatorioFotografico ? 'O relatório fotográfico' : 'O RFI'} só pode ser enviado com a execução concluída (G7) — marque 100% de avanço e a data real de conclusão acima.
                    </p>
                )}
                {usaRelatorioFotografico && podeEnviarRfi && (
                    <p className="text-xs text-muted-foreground mb-3">Fluxo de Operação — sem exigência de APC; conclusão operacional segue mesmo com PO pendente.</p>
                )}
                {showRfiForm && (
                    <div className="grid grid-cols-2 gap-3 mb-4 border border-border rounded-lg p-3">
                        <Field label="Destinatário"><input className={inputClass} value={rfiForm.destinatario} onChange={e => setRfiForm(f => ({ ...f, destinatario: e.target.value }))} /></Field>
                        {!usaRelatorioFotografico && (
                            <>
                                <Field label="Protocolo"><input className={inputClass} value={rfiForm.protocolo} onChange={e => setRfiForm(f => ({ ...f, protocolo: e.target.value }))} /></Field>
                                <Field label="Condição de Energia">
                                    <select className={inputClass} value={rfiForm.energizado} onChange={e => setRfiForm(f => ({ ...f, energizado: e.target.value }))}>
                                        <option value="">Não informado</option>
                                        <option value="true">Energizado</option>
                                        <option value="false">Sem energia</option>
                                    </select>
                                </Field>
                            </>
                        )}
                        <div className="col-span-2">
                            <Field label="Observações"><input className={inputClass} value={rfiForm.observacoes} onChange={e => setRfiForm(f => ({ ...f, observacoes: e.target.value }))} /></Field>
                        </div>
                        <div className="col-span-2 flex justify-end">
                            <PrimaryButton onClick={enviarRfi} disabled={salvando}>Confirmar Envio</PrimaryButton>
                        </div>
                    </div>
                )}
                {rfis.length === 0 ? (
                    <EmptyState text={usaRelatorioFotografico ? 'Nenhum relatório fotográfico enviado ainda.' : 'Nenhum RFI enviado ainda.'} />
                ) : (
                    rfis.map(r => (
                        <div key={r.id} className="border-b border-border/60 last:border-0 py-2">
                            {!usaRelatorioFotografico && <Row label="Protocolo" value={r.protocolo || '—'} />}
                            <Row label="Data de Envio" value={fmtData(r.data_envio)} />
                            <Row label="Destinatário" value={r.destinatario} />
                            {!usaRelatorioFotografico && <Row label="Energia" value={r.energizado === true ? 'Energizado' : r.energizado === false ? 'Sem energia' : 'Não informado'} />}
                        </div>
                    ))
                )}
            </Card>
        </div>
    );
}
