import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, Row } from './ui';
import {
    TIPOS_DEMANDA, TIPOS_DEMANDA_LABEL, SUBTIPOS_OPERACAO, SUBTIPOS_OPERACAO_LABEL,
    TIPOS_OBRA, TIPOS_SITE_HIGHLINE, UFS, normalizarUf, SHARINGS, OPERADORAS, MODELO_OPERACAO_LABEL, modeloOperacaoPadrao, modelosPermitidos, fmtData,
} from './constants';

export default function TabIdentificacao({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        titulo: atividade.titulo,
        tipo_demanda: atividade.tipo_demanda,
        subtipo_demanda: atividade.subtipo_demanda || '',
        tipo_obra: atividade.tipo_obra || '',
        tipo_site_highline: atividade.tipo_site_highline || '',
        tipo_atividade: atividade.tipo_atividade || '',
        modelo_operacao: modelosPermitidos(atividade.tipo_demanda).includes(atividade.modelo_operacao)
            ? atividade.modelo_operacao
            : modeloOperacaoPadrao(atividade.tipo_demanda),
        sharing: atividade.sharing,
        operadora: atividade.operadora || '',
        contratante_id: atividade.contratante_id || '',
        id_site_sharing: atividade.id_site_sharing || '',
        id_site_operadora: atividade.id_site_operadora || '',
        contrato: atividade.contrato || '',
        estado: normalizarUf(atividade.estado),
        municipio: atividade.municipio || '',
        responsavel: atividade.responsavel || '',
        gestor: atividade.gestor || '',
        descricao: atividade.descricao || '',
        data_inicio_planejada: atividade.data_inicio_planejada ? atividade.data_inicio_planejada.substring(0, 10) : '',
        data_fim_planejada: atividade.data_fim_planejada ? atividade.data_fim_planejada.substring(0, 10) : '',
    });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState('');
    const [contratantes, setContratantes] = useState<{ id: string; nome: string }[]>([]);

    useEffect(() => {
        if (!editing) return;
        fetch('/api/contratantes').then(r => r.ok ? r.json() : []).then(setContratantes).catch(() => {});
    }, [editing]);

    async function salvar() {
        setErro('');
        if (form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' && !form.estado) {
            setErro('Selecione a UF da atividade');
            return;
        }
        setSaving(true);
        try {
            const r = await fetch(`/api/atividades/${atividade.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    subtipo_demanda: form.tipo_demanda === 'OPERACAO' ? (form.subtipo_demanda || null) : null,
                    tipo_obra: form.tipo_obra || null,
                    tipo_site_highline: form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO'
                        ? (form.tipo_site_highline || null)
                        : null,
                    tipo_atividade: form.tipo_atividade || null,
                    operadora: form.operadora || null,
                    contratante_id: form.contratante_id || null,
                    id_site_sharing: form.id_site_sharing || null,
                    id_site_operadora: form.id_site_operadora || null,
                    contrato: form.contrato || null,
                    estado: normalizarUf(form.estado) || null,
                    municipio: form.municipio || null,
                    responsavel: form.responsavel || null,
                    gestor: form.gestor || null,
                    descricao: form.descricao || null,
                    data_inicio_planejada: form.data_inicio_planejada || null,
                    data_fim_planejada: form.data_fim_planejada || null,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar');
            setEditing(false);
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSaving(false);
        }
    }

    if (!editing) {
        return (
            <Card title="Identificação" action={<GhostButton onClick={() => setEditing(true)}><Pencil size={13} className="inline mr-1" />Editar</GhostButton>}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                        <Row label="Cliente / Sharing" value={atividade.sharing} />
                        <Row label="Operadora" value={atividade.operadora} />
                        <Row label="Contratante" value={atividade.contratante?.nome} />
                        <Row label="Contrato" value={atividade.contrato} />
                        <Row label="Site ID Sharing" value={atividade.id_site_sharing} />
                        <Row label="Site ID Operadora" value={atividade.id_site_operadora} />
                        <Row label="UF / Município" value={[normalizarUf(atividade.estado) || atividade.estado, atividade.municipio].filter(Boolean).join(' / ') || '—'} />
                        <Row label="Tipo de Demanda" value={`${TIPOS_DEMANDA_LABEL[atividade.tipo_demanda] || atividade.tipo_demanda}${atividade.subtipo_demanda ? ` · ${SUBTIPOS_OPERACAO_LABEL[atividade.subtipo_demanda] || atividade.subtipo_demanda}` : ''}`} />
                    </div>
                    <div>
                        <Row label="Tipo de Obra" value={atividade.tipo_obra} />
                        {atividade.sharing === 'HIGHLINE' && atividade.tipo_demanda === 'IMPLANTACAO' && (
                            <Row label="Tipo de Site Highline" value={atividade.tipo_site_highline} />
                        )}
                        <Row label="Tipo de Atividade" value={atividade.tipo_atividade} />
                        <Row label="Modelo de Operação" value={MODELO_OPERACAO_LABEL[atividade.modelo_operacao] || atividade.modelo_operacao} />
                        <Row label="Responsável" value={atividade.responsavel} />
                        <Row label="Gestor" value={atividade.gestor} />
                        <Row label="Prazo" value={`${fmtData(atividade.data_inicio_planejada)} → ${fmtData(atividade.data_fim_planejada)}`} />
                    </div>
                </div>
                {atividade.descricao && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="text-xs text-muted-foreground mb-1">Descrição / Escopo</div>
                        <p className="text-sm">{atividade.descricao}</p>
                    </div>
                )}
            </Card>
        );
    }

    return (
        <Card title="Editar Identificação">
            <ErrorBanner message={erro} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <Field label="Título">
                        <input className={inputClass} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                    </Field>
                </div>
                <Field label="Tipo de Demanda">
                    <select
                        className={inputClass}
                        value={form.tipo_demanda}
                        onChange={e => {
                            const novoTipo = e.target.value;
                            setForm(f => ({ ...f, tipo_demanda: novoTipo, modelo_operacao: modeloOperacaoPadrao(novoTipo), subtipo_demanda: '' }));
                        }}
                    >
                        {TIPOS_DEMANDA.map(t => <option key={t} value={t}>{TIPOS_DEMANDA_LABEL[t]}</option>)}
                    </select>
                </Field>
                <Field label="Sharing">
                    <select className={inputClass} value={form.sharing} onChange={e => setForm(f => ({ ...f, sharing: e.target.value }))}>
                        {SHARINGS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </Field>
                <Field label="Operadora">
                    <select className={inputClass} value={form.operadora} onChange={e => setForm(f => ({ ...f, operadora: e.target.value }))}>
                        <option value="">—</option>
                        {OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </Field>
                {form.tipo_demanda === 'OPERACAO' && (
                    <Field label="Subtipo de Operação">
                        <select className={inputClass} value={form.subtipo_demanda} onChange={e => setForm(f => ({ ...f, subtipo_demanda: e.target.value }))}>
                            <option value="">—</option>
                            {SUBTIPOS_OPERACAO.map(s => <option key={s} value={s}>{SUBTIPOS_OPERACAO_LABEL[s]}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="Tipo de Obra">
                    <select className={inputClass} value={form.tipo_obra} onChange={e => setForm(f => ({ ...f, tipo_obra: e.target.value }))}>
                        <option value="">—</option>
                        {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
                {form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' && (
                    <Field label="Tipo de Site Highline">
                        <select required className={inputClass} value={form.tipo_site_highline} onChange={e => setForm(f => ({ ...f, tipo_site_highline: e.target.value }))}>
                            <option value="">Selecione...</option>
                            {TIPOS_SITE_HIGHLINE.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="Modelo de Operação">
                    {(() => {
                        const opcoes = modelosPermitidos(form.tipo_demanda);
                        return (
                            <select
                                className={inputClass}
                                value={form.modelo_operacao}
                                disabled={opcoes.length === 1}
                                onChange={e => setForm(f => ({ ...f, modelo_operacao: e.target.value }))}
                            >
                                {opcoes.map(m => <option key={m} value={m}>{MODELO_OPERACAO_LABEL[m]}</option>)}
                            </select>
                        );
                    })()}
                    {form.tipo_demanda === 'IMPLANTACAO' && (
                        <p className="text-[11px] text-muted-foreground mt-1">Implantação sempre segue o fluxo completo (Mediante Aprovação) — Blueprint LSI, seção 02.</p>
                    )}
                </Field>
                <Field label="Tipo de Atividade"><input className={inputClass} value={form.tipo_atividade} onChange={e => setForm(f => ({ ...f, tipo_atividade: e.target.value }))} /></Field>
                <Field label="Contratante">
                    <select className={inputClass} value={form.contratante_id} onChange={e => setForm(f => ({ ...f, contratante_id: e.target.value }))}>
                        <option value="">—</option>
                        {contratantes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </Field>
                <Field label="Site ID Sharing"><input className={inputClass} value={form.id_site_sharing} onChange={e => setForm(f => ({ ...f, id_site_sharing: e.target.value }))} /></Field>
                <Field label="Site ID Operadora"><input className={inputClass} value={form.id_site_operadora} onChange={e => setForm(f => ({ ...f, id_site_operadora: e.target.value }))} /></Field>
                <Field label="Contrato"><input className={inputClass} value={form.contrato} onChange={e => setForm(f => ({ ...f, contrato: e.target.value }))} /></Field>
                <Field label={`UF${form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' ? ' *' : ''}`}>
                    <select className={inputClass} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                        <option value="">— Selecione —</option>
                        {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
                    </select>
                </Field>
                <Field label="Município"><input className={inputClass} value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} /></Field>
                <Field label="Responsável"><input className={inputClass} value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} /></Field>
                <Field label="Gestor">
                    <input className={inputClass} value={form.gestor} onChange={e => setForm(f => ({ ...f, gestor: e.target.value }))} placeholder="Vai na coluna GESTOR da planilha de faturamento" />
                </Field>
                <Field label="Início Planejado"><input type="date" className={inputClass} value={form.data_inicio_planejada} onChange={e => setForm(f => ({ ...f, data_inicio_planejada: e.target.value }))} /></Field>
                <Field label="Fim Planejado"><input type="date" className={inputClass} value={form.data_fim_planejada} onChange={e => setForm(f => ({ ...f, data_fim_planejada: e.target.value }))} /></Field>
                <div className="md:col-span-2">
                    <Field label="Descrição / Escopo">
                        <textarea rows={3} className={`${inputClass} resize-y`} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                    </Field>
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <GhostButton onClick={() => setEditing(false)}>Cancelar</GhostButton>
                <PrimaryButton onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</PrimaryButton>
            </div>
        </Card>
    );
}
