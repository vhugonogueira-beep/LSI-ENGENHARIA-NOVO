import { rotuloTipoSite } from './TipoObraCampo';
import { fraseDeTexto } from './constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2, ChevronDown, Download, FileText, Paperclip, RefreshCw,
    Save, Search, Trash2, Upload, XCircle,
} from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, PrimaryButton, ErrorBanner, EmptyState, inputClass } from './ui';

const STATUS_OPTIONS = [
    'NAO_INICIADO', 'SOLICITADO', 'EM_ELABORACAO', 'RECEBIDO', 'EM_VALIDACAO',
    'APROVADO', 'REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO', 'NAO_APLICAVEL',
];
const STATUS_LABEL: Record<string, string> = {
    NAO_INICIADO: 'Não iniciado', SOLICITADO: 'Solicitado', EM_ELABORACAO: 'Em elaboração',
    RECEBIDO: 'Recebido', EM_VALIDACAO: 'Em validação', APROVADO: 'Aprovado',
    REPROVADO: 'Reprovado', NECESSITA_CORRECAO: 'Necessita correção', VENCIDO: 'Vencido',
    NAO_APLICAVEL: 'Não aplicável',
};
const STATUS_CLASS: Record<string, string> = {
    NAO_INICIADO: 'bg-muted text-muted-foreground',
    SOLICITADO: 'bg-info/10 text-info',
    EM_ELABORACAO: 'bg-warn/10 text-warn',
    RECEBIDO: 'bg-info/10 text-info',
    EM_VALIDACAO: 'bg-primary/10 text-primary',
    APROVADO: 'bg-ok/10 text-ok',
    REPROVADO: 'bg-crit/10 text-crit',
    NECESSITA_CORRECAO: 'bg-crit/10 text-crit',
    VENCIDO: 'bg-crit/10 text-crit',
    NAO_APLICAVEL: 'bg-muted text-muted-foreground',
};
const ISSUE_STATUSES = new Set(['REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO']);

interface DocumentAttachment {
    id: string;
    nome_original: string;
    mime_type: string;
    tamanho_bytes: number;
    created_at: string;
}

interface ActivityDocument {
    id: string;
    status: string;
    justificativa_na?: string | null;
    observacao?: string | null;
    data_validade?: string | null;
    arquivos: DocumentAttachment[];
    requisito: {
        codigo: string;
        nome: string;
        categoria?: string | null;
        forma_envio?: string | null;
        obrigatorio: boolean;
        condicional: boolean;
        etapa?: string | null;
        exige_assinatura: boolean;
        ordem: number;
    };
}

interface DocumentDetails {
    observacao: string;
    data_validade: string;
}

function isDocumentComplete(document: ActivityDocument): boolean {
    return document.status === 'APROVADO'
        || (document.status === 'NAO_APLICAVEL' && Boolean(document.justificativa_na));
}

function fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TabDocumentacao({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [documents, setDocuments] = useState<ActivityDocument[]>([]);
    const [details, setDetails] = useState<Record<string, DocumentDetails>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('TODAS');
    const [view, setView] = useState('TODOS');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`/api/documentacao/atividades/${atividade.id}`);
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao carregar checklist');
            const data: ActivityDocument[] = await response.json();
            setDocuments(data);
            setDetails(Object.fromEntries(data.map(document => [document.id, {
                observacao: document.observacao || '',
                data_validade: document.data_validade?.substring(0, 10) || '',
            }])));
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    async function syncMatrix() {
        setSyncing(true);
        setError('');
        try {
            const response = await fetch(`/api/documentacao/atividades/${atividade.id}/gerar-matriz`, { method: 'POST' });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao sincronizar checklist');
            await load();
            onRefresh();
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setSyncing(false);
        }
    }

    async function updateDocument(document: ActivityDocument, payload: object) {
        setBusyId(document.id);
        setError('');
        try {
            const response = await fetch(`/api/documentacao/documentos/${document.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao atualizar documento');
            await load();
            onRefresh();
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setBusyId('');
        }
    }

    async function changeStatus(document: ActivityDocument, status: string) {
        let justification: string | undefined;
        if (status === 'NAO_APLICAVEL' && !document.justificativa_na) {
            const response = window.prompt('Justificativa para marcar como Não Aplicável:');
            if (!response?.trim()) return;
            justification = response.trim();
        }
        await updateDocument(document, { status, justificativa_na: justification });
    }

    async function uploadFile(document: ActivityDocument, file?: File) {
        if (!file) return;
        setBusyId(document.id);
        setError('');
        try {
            const formData = new FormData();
            formData.append('arquivo', file);
            const response = await fetch(`/api/documentacao/documentos/${document.id}/arquivos`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao anexar arquivo');
            await load();
            onRefresh();
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setBusyId('');
        }
    }

    async function deleteFile(attachment: DocumentAttachment, document: ActivityDocument) {
        if (!window.confirm(`Excluir ${attachment.nome_original}?`)) return;
        setBusyId(document.id);
        setError('');
        try {
            const response = await fetch(`/api/documentacao/arquivos/${attachment.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao excluir arquivo');
            await load();
            onRefresh();
        } catch (reason: any) {
            setError(reason.message);
        } finally {
            setBusyId('');
        }
    }

    const summary = useMemo(() => {
        const required = documents.filter(document => document.requisito.obrigatorio);
        const complete = required.filter(isDocumentComplete).length;
        const issues = required.filter(document => ISSUE_STATUSES.has(document.status)).length;
        const attached = required.filter(document => document.arquivos.length > 0).length;
        return {
            total: required.length,
            complete,
            pending: Math.max(required.length - complete, 0),
            issues,
            attached,
            percent: required.length ? Math.round((complete / required.length) * 100) : 0,
        };
    }, [documents]);

    const categories = useMemo(() => Array.from(new Set(documents.map(document =>
        document.requisito.categoria || 'Documentação da obra'
    ))), [documents]);

    const filtered = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return documents.filter(document => {
            const requirement = document.requisito;
            if (category !== 'TODAS' && (requirement.categoria || 'Documentação da obra') !== category) return false;
            if (view === 'PENDENTES' && isDocumentComplete(document)) return false;
            if (view === 'CONCLUIDOS' && !isDocumentComplete(document)) return false;
            if (view === 'CORRECAO' && !ISSUE_STATUSES.has(document.status)) return false;
            if (!term) return true;
            return `${requirement.nome} ${requirement.categoria || ''} ${requirement.codigo}`
                .toLocaleLowerCase('pt-BR').includes(term);
        });
    }, [category, documents, search, view]);

    const grouped = useMemo(() => {
        const groups = new Map<string, ActivityDocument[]>();
        for (const document of filtered) {
            const key = document.requisito.categoria || 'Documentação da obra';
            groups.set(key, [...(groups.get(key) || []), document]);
        }
        return Array.from(groups.entries());
    }, [filtered]);

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando checklist documental...</div>;

    return (
        <Card
            title={`Documentação — ${atividade.tipo_obra ? rotuloTipoSite(atividade.tipo_obra) : 'tipo de site não definido'}`}
            action={(
                <PrimaryButton onClick={syncMatrix} disabled={syncing}>
                    <RefreshCw size={14} aria-hidden className={`inline mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                    Sincronizar checklist
                </PrimaryButton>
            )}
        >
            <ErrorBanner message={error} />
            {documents.length === 0 ? (
                <EmptyState text="Nenhum requisito documental aplicável para este tipo de obra." />
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-5 border border-border mb-4">
                        {/* Pendente primeiro: pendentes e correção são os únicos números
                            com cor, e só quando existem. Zero é ausência: "—". */}
                        {([
                            ['Pendentes', summary.pending ? String(summary.pending) : '', 'text-warn'],
                            ['Correção', summary.issues ? String(summary.issues) : '', 'text-crit'],
                            ['Progresso', `${summary.percent}%`, ''],
                            ['Concluídos', `${summary.complete}/${summary.total}`, ''],
                            ['Com arquivo', `${summary.attached}/${summary.total}`, ''],
                        ] as [string, string, string][]).map(([label, value, tom], index) => (
                            <div key={label} className={`px-3 py-3 ${index > 0 ? 'border-l border-border' : ''}`}>
                                <div className="text-[11px] text-muted-foreground">{label}</div>
                                {value
                                    ? <div className={`text-lg font-bold mt-0.5 ${tom}`}>{value}</div>
                                    : <div className="text-lg mt-0.5 text-muted-foreground">—</div>}
                            </div>
                        ))}
                    </div>
                    <div className="h-1.5 bg-muted mb-4 overflow-hidden">
                        <div className="h-full bg-ok transition-all" style={{ width: `${summary.percent}%` }} />
                    </div>

                    <div className="flex flex-col lg:flex-row gap-2 mb-5">
                        <div className="relative flex-1 min-w-0">
                            <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input className={`${inputClass} pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar documento" aria-label="Buscar documento" />
                        </div>
                        <select aria-label="Categoria" className={`${inputClass} lg:w-72`} value={category} onChange={event => setCategory(event.target.value)}>
                            <option value="TODAS">Todas as categorias</option>
                            {categories.map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                        <div className="flex border border-border overflow-x-auto" role="tablist" aria-label="Situação documental">
                            {[
                                ['TODOS', 'Todos'], ['PENDENTES', 'Pendentes'], ['CONCLUIDOS', 'Concluídos'], ['CORRECAO', 'Correção'],
                            ].map(([value, label]) => (
                                <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={`h-10 px-3 text-xs font-semibold whitespace-nowrap ${view === value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {grouped.map(([groupName, groupDocuments]) => (
                            <section key={groupName}>
                                <div className="flex items-center justify-between gap-3 border-b border-border pb-2 mb-1">
                                    <h3 className="text-sm font-bold">{groupName}</h3>
                                    <span className="text-xs text-muted-foreground">
                                        {groupDocuments.filter(isDocumentComplete).length}/{groupDocuments.length}
                                    </span>
                                </div>
                                <div className="divide-y divide-border">
                                    {groupDocuments.map(document => {
                                        const requirement = document.requisito;
                                        const isBusy = busyId === document.id;
                                        return (
                                            <div key={document.id} className="py-3">
                                                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_230px_130px] gap-3 xl:items-start">
                                                    <div className="min-w-0">
                                                        <div className="flex items-start gap-2">
                                                            {isDocumentComplete(document)
                                                                ? <CheckCircle2 size={16} aria-hidden className="mt-0.5 text-ok flex-none" />
                                                                : ISSUE_STATUSES.has(document.status)
                                                                    ? <XCircle size={16} aria-hidden className="mt-0.5 text-crit flex-none" />
                                                                    : <FileText size={16} aria-hidden className="mt-0.5 text-muted-foreground flex-none" />}
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium break-words">{requirement.nome}</div>
                                                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                                                                    {requirement.forma_envio && <span>{fraseDeTexto(requirement.forma_envio)}</span>}
                                                                    {requirement.exige_assinatura && <span>Assinatura exigida</span>}
                                                                    {requirement.condicional && <span>Condicional</span>}
                                                                    {requirement.etapa && <span>{fraseDeTexto(requirement.etapa)}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <select
                                                        value={document.status}
                                                        disabled={isBusy}
                                                        onChange={event => changeStatus(document, event.target.value)}
                                                        aria-label={`Status de ${requirement.nome}`}
                                                        className={`${inputClass} h-9 text-xs font-semibold ${STATUS_CLASS[document.status] || ''}`}
                                                    >
                                                        {STATUS_OPTIONS.map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                                                    </select>
                                                    <div className="flex xl:justify-end">
                                                        <input
                                                            id={`upload-${document.id}`}
                                                            type="file"
                                                            className="sr-only"
                                                            accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.xlsm,.jpg,.jpeg,.png,.tif,.tiff,.zip,.rar,.7z"
                                                            disabled={isBusy}
                                                            onChange={event => {
                                                                uploadFile(document, event.target.files?.[0]);
                                                                event.currentTarget.value = '';
                                                            }}
                                                        />
                                                        <label htmlFor={`upload-${document.id}`} title="Anexar documento" className={`h-9 px-3 rounded-md border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2 cursor-pointer ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
                                                            <Upload size={15} aria-hidden /> Anexar
                                                        </label>
                                                    </div>
                                                </div>

                                                {document.arquivos.length > 0 && (
                                                    <div className="ml-0 sm:ml-6 mt-2 flex flex-wrap gap-2">
                                                        {document.arquivos.map(attachment => (
                                                            <div key={attachment.id} className="h-8 max-w-full flex items-center border border-border bg-background">
                                                                <Paperclip size={14} aria-hidden className="ml-2 text-muted-foreground flex-none" />
                                                                <a href={`/api/documentacao/arquivos/${attachment.id}/download`} className="px-2 text-xs truncate hover:underline" title={attachment.nome_original}>
                                                                    {attachment.nome_original}<span className="ml-2 text-muted-foreground">{fileSize(attachment.tamanho_bytes)}</span>
                                                                </a>
                                                                <a href={`/api/documentacao/arquivos/${attachment.id}/download`} className="h-8 w-8 flex items-center justify-center hover:bg-secondary" title="Baixar arquivo" aria-label="Baixar arquivo">
                                                                    <Download size={14} aria-hidden />
                                                                </a>
                                                                <button type="button" onClick={() => deleteFile(attachment, document)} disabled={isBusy} className="h-8 w-8 flex items-center justify-center hover:bg-crit/10 hover:text-crit disabled:opacity-50" title="Excluir arquivo" aria-label="Excluir arquivo">
                                                                    <Trash2 size={14} aria-hidden />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <details className="ml-0 sm:ml-6 mt-2 group">
                                                    <summary className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer list-none">
                                                        <ChevronDown size={14} aria-hidden className="group-open:rotate-180 transition-transform" />
                                                        Validade e observações
                                                    </summary>
                                                    <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_40px] gap-2 mt-2">
                                                        <input
                                                            type="date"
                                                            aria-label="Data de validade"
                                                            className={`${inputClass} h-9`}
                                                            value={details[document.id]?.data_validade || ''}
                                                            onChange={event => setDetails(current => ({ ...current, [document.id]: { ...current[document.id], data_validade: event.target.value } }))}
                                                        />
                                                        <input
                                                            className={`${inputClass} h-9`}
                                                            value={details[document.id]?.observacao || ''}
                                                            onChange={event => setDetails(current => ({ ...current, [document.id]: { ...current[document.id], observacao: event.target.value } }))}
                                                            placeholder="Observação"
                                                            aria-label="Observação"
                                                        />
                                                        <button
                                                            onClick={() => updateDocument(document, details[document.id] || {})}
                                                            disabled={isBusy}
                                                            className="h-9 w-10 flex items-center justify-center border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-50"
                                                            type="button"
                                                            title="Salvar detalhes"
                                                            aria-label="Salvar detalhes"
                                                        >
                                                            <Save size={15} aria-hidden />
                                                        </button>
                                                    </div>
                                                    {document.justificativa_na && <p className="mt-2 text-xs text-muted-foreground">Justificativa: {document.justificativa_na}</p>}
                                                </details>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                        {grouped.length === 0 && <EmptyState text="Nenhum documento corresponde aos filtros." />}
                    </div>
                </>
            )}
        </Card>
    );
}
