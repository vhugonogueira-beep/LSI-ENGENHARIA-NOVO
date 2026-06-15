import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, ArrowRight } from 'lucide-react';

interface ParsedRow {
    rowIndex: number;
    descricao: string;
    valor_unitario: number;
    unidade: string;
    tipo_escopo: string;
    codigo_item?: string;
    subtipo?: string;
    observacoes?: string;
    valid: boolean;
    errors: string[];
}

interface ImportPreviewProps {
    pricebookId: string;
    supplierId: string;
    onClose: () => void;
    onComplete: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'done';

export function ImportPreview({ pricebookId, supplierId, onClose, onComplete }: ImportPreviewProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<Step>('upload');
    const [uploading, setUploading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState('');

    // Data from server
    const [batchId, setBatchId] = useState('');
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [validCount, setValidCount] = useState(0);
    const [invalidCount, setInvalidCount] = useState(0);
    const [pendingTipoEscopo, setPendingTipoEscopo] = useState(0);

    // Import result
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

    const BRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const handleFileSelect = async (file: File) => {
        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('supplier_id', supplierId);
            formData.append('pricebook_id', pricebookId);

            const resp = await fetch('/api/import/upload', {
                method: 'POST',
                body: formData,
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Erro ao processar arquivo');
            }

            const data = await resp.json();
            setBatchId(data.batchId);
            setDetectedHeaders(data.detectedHeaders || []);
            setMapping(data.suggestedMapping || {});
            setPreviewRows(data.previewRows || []);
            setTotalRows(data.totalRows || 0);
            setValidCount(data.validCount || 0);
            setInvalidCount(data.invalidCount || 0);
            setPendingTipoEscopo(data.pendingTipoEscopo || 0);

            // If mapping looks good, jump straight to preview
            if (data.suggestedMapping?.descricao && data.suggestedMapping?.valor_unitario) {
                setStep('preview');
            } else {
                setStep('mapping');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const updateRowField = (index: number, field: keyof ParsedRow, value: string) => {
        setPreviewRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            const updated = { ...row, [field]: value };
            // Revalidate
            const errors: string[] = [];
            if (!updated.descricao) errors.push('Descrição obrigatória');
            if (!updated.unidade) errors.push('Unidade obrigatória');
            if (!updated.tipo_escopo || !['SERVICO', 'INFRA'].includes(updated.tipo_escopo)) {
                if (!updated.tipo_escopo) errors.push('Tipo escopo obrigatório');
            }
            updated.errors = errors;
            updated.valid = errors.length === 0 && !!updated.tipo_escopo;
            return updated;
        }));
    };

    const handleConfirm = async () => {
        setConfirming(true);
        setError('');
        try {
            const resp = await fetch(`/api/import/batches/${batchId}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: previewRows }),
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Erro ao confirmar importação');
            }

            const result = await resp.json();
            setImportResult(result);
            setStep('done');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setConfirming(false);
        }
    };

    const validRows = previewRows.filter(r => r.valid);
    const invalidRows = previewRows.filter(r => !r.valid);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="text-primary" size={22} />
                        <h3 className="text-xl font-bold">Importar Itens da LPU</h3>
                        <div className="flex items-center gap-1 ml-4">
                            {['upload', 'mapping', 'preview', 'done'].map((s, i) => (
                                <div key={s} className="flex items-center gap-1">
                                    <div className={`w-2.5 h-2.5 rounded-full ${s === step ? 'bg-primary' :
                                            ['upload', 'mapping', 'preview', 'done'].indexOf(step) > i ? 'bg-emerald-500' : 'bg-gray-300'
                                        }`} />
                                    {i < 3 && <div className="w-6 h-0.5 bg-gray-200" />}
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-md">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
                            <AlertTriangle size={18} />
                            {error}
                        </div>
                    )}

                    {/* Step: Upload */}
                    {step === 'upload' && (
                        <div
                            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                className="hidden"
                                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            />
                            <Upload size={48} className="mx-auto text-muted-foreground mb-4" />
                            <h4 className="text-lg font-semibold mb-2">
                                {uploading ? 'Processando arquivo...' : 'Arraste o arquivo ou clique para selecionar'}
                            </h4>
                            <p className="text-muted-foreground text-sm">Formatos aceitos: CSV, XLSX, XLS — máximo 10MB</p>
                        </div>
                    )}

                    {/* Step: Mapping */}
                    {step === 'mapping' && (
                        <div>
                            <h4 className="font-semibold mb-3">Mapeamento de Colunas</h4>
                            <p className="text-sm text-muted-foreground mb-4">
                                Associe as colunas do arquivo às colunas do sistema:
                            </p>
                            <div className="space-y-3">
                                {['descricao', 'valor_unitario', 'unidade', 'tipo_escopo', 'codigo_item'].map(field => (
                                    <div key={field} className="flex items-center gap-3">
                                        <label className="w-40 font-medium text-sm capitalize">
                                            {field.replace('_', ' ')}
                                            {['descricao', 'valor_unitario', 'unidade'].includes(field) && <span className="text-red-500 ml-1">*</span>}
                                        </label>
                                        <ArrowRight size={16} className="text-muted-foreground" />
                                        <select
                                            value={mapping[field] || ''}
                                            onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
                                            className="flex-1 border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        >
                                            <option value="">— Selecionar coluna —</option>
                                            {detectedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end mt-6">
                                <button
                                    onClick={() => {
                                        // Re-upload with custom mapping
                                        setStep('preview');
                                    }}
                                    className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium shadow-sm"
                                >
                                    Próximo: Preview
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step: Preview */}
                    {step === 'preview' && (
                        <div>
                            {/* Stats */}
                            <div className="grid grid-cols-4 gap-3 mb-4">
                                <div className="p-3 bg-muted/30 rounded-lg text-center">
                                    <p className="text-2xl font-bold">{totalRows}</p>
                                    <p className="text-xs text-muted-foreground">Linhas lidas</p>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                                    <p className="text-xs text-emerald-600">Válidas</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-red-600">{invalidRows.length}</p>
                                    <p className="text-xs text-red-500">Com erros</p>
                                </div>
                                <div className="p-3 bg-amber-50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-amber-600">{previewRows.filter(r => !r.tipo_escopo).length}</p>
                                    <p className="text-xs text-amber-500">Sem tipo escopo</p>
                                </div>
                            </div>

                            {/* Preview Table */}
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/30 border-b">
                                            <th className="text-left py-2 px-2 font-medium w-8">#</th>
                                            <th className="text-left py-2 px-2 font-medium">Status</th>
                                            <th className="text-left py-2 px-2 font-medium">Tipo</th>
                                            <th className="text-left py-2 px-2 font-medium">Código</th>
                                            <th className="text-left py-2 px-2 font-medium">Descrição</th>
                                            <th className="text-left py-2 px-2 font-medium">Unidade</th>
                                            <th className="text-right py-2 px-2 font-medium">Valor Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {previewRows.map((row, i) => (
                                            <tr key={i} className={`${row.valid ? '' : 'bg-red-50/50'} hover:bg-muted/20`}>
                                                <td className="py-1.5 px-2 text-muted-foreground text-xs">{row.rowIndex}</td>
                                                <td className="py-1.5 px-2">
                                                    {row.valid ? (
                                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                                    ) : (
                                                        <span title={row.errors.join(', ')} className="cursor-help">
                                                            <AlertTriangle size={16} className="text-red-500" />
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    <select
                                                        value={row.tipo_escopo}
                                                        onChange={e => updateRowField(i, 'tipo_escopo', e.target.value)}
                                                        className={`border rounded px-1.5 py-0.5 text-xs font-semibold ${!row.tipo_escopo ? 'border-amber-400 bg-amber-50' : 'bg-background'
                                                            }`}
                                                    >
                                                        <option value="">—</option>
                                                        <option value="SERVICO">SERVIÇO</option>
                                                        <option value="INFRA">INFRA</option>
                                                    </select>
                                                </td>
                                                <td className="py-1.5 px-2 text-muted-foreground text-xs">{row.codigo_item || '—'}</td>
                                                <td className="py-1.5 px-2 font-medium text-xs max-w-xs truncate" title={row.descricao}>{row.descricao}</td>
                                                <td className="py-1.5 px-2">
                                                    <input
                                                        type="text"
                                                        value={row.unidade}
                                                        onChange={e => updateRowField(i, 'unidade', e.target.value)}
                                                        className={`border rounded px-1.5 py-0.5 text-xs w-14 ${!row.unidade ? 'border-red-400 bg-red-50' : ''}`}
                                                    />
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-semibold text-xs">{BRL(row.valor_unitario)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {previewRows.length < totalRows && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    Mostrando {previewRows.length} de {totalRows} linhas. Todas serão importadas na confirmação.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step: Done */}
                    {step === 'done' && importResult && (
                        <div className="text-center py-8">
                            <CheckCircle2 size={56} className="mx-auto text-emerald-500 mb-4" />
                            <h4 className="text-2xl font-bold mb-2">Importação Concluída!</h4>
                            <p className="text-muted-foreground">
                                <span className="text-emerald-600 font-semibold">{importResult.imported}</span> itens importados
                                {importResult.skipped > 0 && <>, <span className="text-amber-600 font-semibold">{importResult.skipped}</span> ignorados</>}.
                            </p>
                            <button
                                onClick={onComplete}
                                className="mt-6 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium shadow-sm"
                            >
                                Fechar
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'preview' && (
                    <div className="border-t px-6 py-4 flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                            {validRows.length} linhas serão importadas
                        </p>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-4 py-2.5 border rounded-lg hover:bg-muted font-medium">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={confirming || validRows.length === 0}
                                className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {confirming ? 'Importando...' : `Confirmar Importação (${validRows.length} itens)`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
