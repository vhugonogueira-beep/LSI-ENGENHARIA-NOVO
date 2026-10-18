import { useState, useEffect, useCallback } from 'react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, inputClass, ErrorBanner, EmptyState, Row } from './ui';
import { fmtData } from './constants';
import { FileSpreadsheet, FileText, Paperclip } from 'lucide-react';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

const ACEITA_RELATORIO = '.pdf,.xlsx,.xls,.xlsm,.csv';
const nomeDoArquivo = (url?: string | null) => (url ? decodeURIComponent(url.split('/').pop() || '') : '');

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
    // Arquivo do relatório que foi ao cliente (Excel ou PDF) — 18/10/2026.
    const [arquivoRfi, setArquivoRfi] = useState<File | null>(null);
    const [anexando, setAnexando] = useState<string | null>(null);

    async function subirArquivo(rfiId: string, arquivo: File) {
        const dados = new FormData();
        dados.append('arquivo', arquivo);
        const r = await authFetch(`/api/execucao/rfis/${rfiId}/arquivo`, { method: 'POST', body: dados });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao anexar o arquivo');
    }
    async function anexarEmExistente(rfiId: string, arquivo: File) {
        setErro(''); setAnexando(rfiId);
        try { await subirArquivo(rfiId, arquivo); await load(); } catch (e: any) { setErro(e.message); } finally { setAnexando(null); }
    }

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
            const criado = await r.json();
            if (arquivoRfi) await subirArquivo(criado.id, arquivoRfi);
            setArquivoRfi(null);
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

            <Card title="Registro de execução">
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <Field label="Data de início"><input type="date" className={inputClass} value={execForm.data_inicio} onChange={e => setExecForm(f => ({ ...f, data_inicio: e.target.value }))} /></Field>
                    <Field label="Data prevista de conclusão"><input type="date" className={inputClass} value={execForm.data_prevista_conclusao} onChange={e => setExecForm(f => ({ ...f, data_prevista_conclusao: e.target.value }))} /></Field>
                    <Field label="Data real de conclusão"><input type="date" className={inputClass} value={execForm.data_real_conclusao} onChange={e => setExecForm(f => ({ ...f, data_real_conclusao: e.target.value }))} /></Field>
                    <Field label="Equipe"><input className={inputClass} value={execForm.equipe} onChange={e => setExecForm(f => ({ ...f, equipe: e.target.value }))} /></Field>
                </div>
                <Field label={`Avanço físico: ${execForm.avanco_percentual}%`}>
                    <input type="range" min={0} max={100} value={execForm.avanco_percentual} onChange={e => setExecForm(f => ({ ...f, avanco_percentual: e.target.value }))} className="w-full accent-primary" />
                </Field>
                <div className="mt-3">
                    <Field label="Ocorrências e não conformidades">
                        <textarea rows={2} className={`${inputClass} resize-y`} value={execForm.ocorrencias} onChange={e => setExecForm(f => ({ ...f, ocorrencias: e.target.value }))} />
                    </Field>
                </div>
                <div className="flex justify-end mt-3">
                    <PrimaryButton onClick={salvarExecucao} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar execução'}</PrimaryButton>
                </div>
                {execForm.avanco_percentual === '100' && !execForm.data_real_conclusao && (
                    <p className="text-xs text-warn mt-2">Preencha a data real de conclusão para encerrar a execução.</p>
                )}
            </Card>

            <Card
                title={usaRelatorioFotografico ? 'Relatório fotográfico' : 'RFI'}
                action={podeEnviarRfi ? <PrimaryButton onClick={() => setShowRfiForm(v => !v)}>{showRfiForm ? 'Cancelar' : usaRelatorioFotografico ? 'Enviar relatório' : 'Enviar RFI'}</PrimaryButton> : undefined}
            >
                {!podeEnviarRfi && (
                    <p className="text-xs text-muted-foreground mb-3">
                        {usaRelatorioFotografico ? 'O relatório fotográfico' : 'O RFI'} só pode ser enviado com a execução concluída: marque 100% de avanço e a data real de conclusão acima.
                    </p>
                )}
                {usaRelatorioFotografico && podeEnviarRfi && (
                    <p className="text-xs text-muted-foreground mb-3">Fluxo de operação — sem exigência de APC; conclusão operacional segue mesmo com PO pendente.</p>
                )}
                {showRfiForm && (
                    <div className="grid grid-cols-2 gap-3 mb-4 border border-border rounded-lg p-3">
                        <Field label="Destinatário"><input className={inputClass} value={rfiForm.destinatario} onChange={e => setRfiForm(f => ({ ...f, destinatario: e.target.value }))} /></Field>
                        {!usaRelatorioFotografico && (
                            <>
                                <Field label="Protocolo"><input className={inputClass} value={rfiForm.protocolo} onChange={e => setRfiForm(f => ({ ...f, protocolo: e.target.value }))} /></Field>
                                <Field label="Condição de energia">
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
                        <div className="col-span-2">
                            <Field label={`Arquivo do ${usaRelatorioFotografico ? 'relatório enviado ao cliente' : 'RFI'} (Excel ou PDF)`}>
                                <input type="file" accept={ACEITA_RELATORIO} className={`${inputClass} py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground`}
                                    onChange={e => setArquivoRfi(e.target.files?.[0] || null)} />
                            </Field>
                        </div>
                        <div className="col-span-2 flex justify-end">
                            <PrimaryButton onClick={enviarRfi} disabled={salvando}>Confirmar envio</PrimaryButton>
                        </div>
                    </div>
                )}
                {rfis.length === 0 ? (
                    <EmptyState text={usaRelatorioFotografico ? 'Nenhum relatório fotográfico enviado ainda.' : 'Nenhum RFI enviado ainda.'} />
                ) : (
                    rfis.map(r => (
                        <div key={r.id} className="border-b border-border/60 last:border-0 py-2">
                            {!usaRelatorioFotografico && <Row label="Protocolo" value={r.protocolo && <span className="font-id">{r.protocolo}</span>} />}
                            <Row label="Data de envio" value={fmtData(r.data_envio)} />
                            <Row label="Destinatário" value={r.destinatario} />
                            <Row label="Arquivo" value={
                                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                    {r.relatorio_url && r.relatorio_url.startsWith('relatorios/') ? (
                                        <button type="button" onClick={() => downloadAuthenticatedFile(`/api/execucao/rfis/${r.id}/arquivo`, nomeDoArquivo(r.relatorio_url)).catch((e: any) => setErro(e.message))}
                                            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                                            {/\.pdf$/i.test(r.relatorio_url) ? <FileText size={14} aria-hidden /> : <FileSpreadsheet size={14} aria-hidden />}
                                            {nomeDoArquivo(r.relatorio_url)}
                                        </button>
                                    ) : <span className="text-warn">Nenhum arquivo anexado</span>}
                                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold hover:bg-secondary/60">
                                        <Paperclip size={12} aria-hidden /> {anexando === r.id ? 'Enviando…' : r.relatorio_url ? 'Trocar' : 'Anexar'}
                                        <input type="file" hidden accept={ACEITA_RELATORIO} disabled={anexando === r.id}
                                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexarEmExistente(r.id, f); }} />
                                    </label>
                                </span>
                            } />
                            {!usaRelatorioFotografico && <Row label="Energia" value={r.energizado === true ? 'Energizado' : r.energizado === false ? 'Sem energia' : 'Não informado'} />}
                        </div>
                    ))
                )}
            </Card>
        </div>
    );
}
