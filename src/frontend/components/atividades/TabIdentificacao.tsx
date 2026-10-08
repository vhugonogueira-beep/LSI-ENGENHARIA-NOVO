import TipoObraCampo, { rotuloTipoSite } from './TipoObraCampo';
import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, Row, AreaChip, OperadoraChip, SharingNome } from './ui';
import {
    TIPOS_DEMANDA, TIPOS_DEMANDA_LABEL, SUBTIPOS_OPERACAO, SUBTIPOS_OPERACAO_LABEL,
    UFS, normalizarUf, SHARINGS, OPERADORAS, MODELO_OPERACAO_LABEL, modeloOperacaoPadrao, modelosPermitidos, fmtData,
} from './constants';
import MunicipioInput from '../cadastros/MunicipioInput';

export default function TabIdentificacao({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        titulo: atividade.titulo,
        tipo_demanda: atividade.tipo_demanda,
        subtipo_demanda: atividade.subtipo_demanda || '',
        tipo_obra: atividade.tipo_obra || '',
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
        diretorio_url: atividade.diretorio_url || '',
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
            <Card title="Identificação" action={<GhostButton onClick={() => setEditing(true)}><Pencil size={14} className="inline mr-1" aria-hidden />Editar</GhostButton>}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                        <Row label="Detentora" value={atividade.sharing && <SharingNome sharing={atividade.sharing} />} />
                        <Row label="Operadora" value={atividade.operadora && <OperadoraChip operadora={atividade.operadora} />} />
                        <Row label="Contratante" value={atividade.contratante?.nome} />
                        <Row label="Contrato" value={atividade.contrato} />
                        <Row label="ID do site na detentora" value={atividade.id_site_sharing && <span className="font-id">{atividade.id_site_sharing}</span>} />
                        <Row label="ID do site na operadora" value={atividade.id_site_operadora && <span className="font-id">{atividade.id_site_operadora}</span>} />
                        <Row label="UF e município" value={[normalizarUf(atividade.estado) || atividade.estado, atividade.municipio].filter(Boolean).join(' / ') || '—'} />
                        <Row label="Tipo de demanda" value={
                            <span className="inline-flex items-center gap-1.5">
                                <AreaChip tipo={atividade.tipo_demanda} />
                                {atividade.subtipo_demanda && <span>{SUBTIPOS_OPERACAO_LABEL[atividade.subtipo_demanda] || atividade.subtipo_demanda}</span>}
                            </span>
                        } />
                    </div>
                    <div>
                        <Row label="Tipo de site" value={rotuloTipoSite(atividade.tipo_obra)} />
                        <Row label="Tipo de atividade" value={atividade.tipo_atividade} />
                        <Row label="Modelo de operação" value={MODELO_OPERACAO_LABEL[atividade.modelo_operacao] || atividade.modelo_operacao} />
                        <Row label="Responsável" value={atividade.responsavel} />
                        <Row label="Gestor" value={atividade.gestor} />
                        <Row label="Diretório da atividade" value={atividade.diretorio_url} />
                        <Row label="Prazo" value={atividade.data_inicio_planejada || atividade.data_fim_planejada ? `${fmtData(atividade.data_inicio_planejada)} a ${fmtData(atividade.data_fim_planejada)}` : null} />
                    </div>
                </div>
                {atividade.descricao && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="text-xs text-muted-foreground mb-1">Descrição e escopo</div>
                        <p className="text-sm">{atividade.descricao}</p>
                    </div>
                )}
            </Card>
        );
    }

    return (
        <Card title="Editar identificação">
            <ErrorBanner message={erro} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <Field label="Título">
                        <input className={inputClass} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                    </Field>
                </div>
                <Field label="Tipo de demanda">
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
                    <Field label="Subtipo de operação">
                        <select className={inputClass} value={form.subtipo_demanda} onChange={e => setForm(f => ({ ...f, subtipo_demanda: e.target.value }))}>
                            <option value="">—</option>
                            {SUBTIPOS_OPERACAO.map(s => <option key={s} value={s}>{SUBTIPOS_OPERACAO_LABEL[s]}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="Tipo de site">
                    <TipoObraCampo className={inputClass} value={form.tipo_obra} onChange={v => setForm(f => ({ ...f, tipo_obra: v }))} />
                </Field>
                <Field label="Modelo de operação">
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
                <Field label="Tipo de atividade"><input className={inputClass} value={form.tipo_atividade} onChange={e => setForm(f => ({ ...f, tipo_atividade: e.target.value }))} /></Field>
                <Field label="Contratante">
                    <select className={inputClass} value={form.contratante_id} onChange={e => setForm(f => ({ ...f, contratante_id: e.target.value }))}>
                        <option value="">—</option>
                        {contratantes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </Field>
                <Field label="ID do site na detentora"><input className={inputClass} value={form.id_site_sharing} onChange={e => setForm(f => ({ ...f, id_site_sharing: e.target.value }))} /></Field>
                <Field label="ID do site na operadora"><input className={inputClass} value={form.id_site_operadora} onChange={e => setForm(f => ({ ...f, id_site_operadora: e.target.value }))} /></Field>
                <Field label="Contrato"><input className={inputClass} value={form.contrato} onChange={e => setForm(f => ({ ...f, contrato: e.target.value }))} /></Field>
                <Field label={`UF${form.sharing === 'HIGHLINE' && form.tipo_demanda === 'IMPLANTACAO' ? ' *' : ''}`}>
                    <select className={inputClass} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value, municipio: e.target.value === f.estado ? f.municipio : '' }))}>
                        <option value="">— Selecione —</option>
                        {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
                    </select>
                </Field>
                <Field label="Município">
                    <MunicipioInput uf={form.estado} value={form.municipio} className={inputClass}
                        onChange={nome => setForm(f => ({ ...f, municipio: nome }))} />
                </Field>
                <Field label="Responsável"><input className={inputClass} value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} /></Field>
                <Field label="Gestor">
                    <input className={inputClass} value={form.gestor} onChange={e => setForm(f => ({ ...f, gestor: e.target.value }))} placeholder="Vai na coluna GESTOR da planilha de faturamento" />
                </Field>
                <div className="md:col-span-2">
                    <Field label="Diretório da atividade no servidor">
                        <input
                            className={inputClass}
                            value={form.diretorio_url}
                            onChange={e => setForm(f => ({ ...f, diretorio_url: e.target.value }))}
                            placeholder="Ex.: \\servidor\ENGENHARIA\OBRAS\IMPLANTAÇÃO\SITE"
                        />
                    </Field>
                </div>
                <Field label="Início planejado"><input type="date" className={inputClass} value={form.data_inicio_planejada} onChange={e => setForm(f => ({ ...f, data_inicio_planejada: e.target.value }))} /></Field>
                <Field label="Fim planejado"><input type="date" className={inputClass} value={form.data_fim_planejada} onChange={e => setForm(f => ({ ...f, data_fim_planejada: e.target.value }))} /></Field>
                <div className="md:col-span-2">
                    <Field label="Descrição e escopo">
                        <textarea rows={3} className={`${inputClass} resize-y`} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                    </Field>
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <GhostButton onClick={() => setEditing(false)}>Cancelar</GhostButton>
                <PrimaryButton onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</PrimaryButton>
            </div>
        </Card>
    );
}
