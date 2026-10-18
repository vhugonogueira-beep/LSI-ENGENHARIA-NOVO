import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

// Nova base (LPU) pela tela (18/10/2026): natureza, área e cliente decidem em
// quais atividades ela vale; a planilha é opcional e pode vir depois.

const CAMPO = 'h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
const ROTULO = 'mb-1 block text-xs font-semibold text-muted-foreground';

export const ACEITA_PLANILHA = '.xlsx,.xls,.xlsm,.csv';

/** Sobe a planilha para a base e devolve o resumo. */
export async function importarPlanilha(baseId: string, arquivo: File) {
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    const r = await authFetch(`/api/pricebooks/${baseId}/importar-planilha`, { method: 'POST', body: dados });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Erro ao importar a planilha');
    return d as { criados: number; atualizados: number; ignorados: number };
}

export default function NovaLpuModal({ clientes, onFechar, onCriada }: {
    clientes: { id: string; nome: string }[];
    onFechar: () => void;
    onCriada: (id: string, aviso: string) => void;
}) {
    const [form, setForm] = useState({ nome_lpu: '', origem: 'PV_CLIENTE', tipo: 'IMPLANTACAO', contratante_id: '', supplier_id: '', regiao: 'NACIONAL', padrao: true });
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));
    useEffect(() => {
        if (form.origem !== 'FORNECEDOR' || fornecedores.length) return;
        authFetch('/api/suppliers?limit=500').then(r => (r.ok ? r.json() : { items: [] })).then(d => setFornecedores(d.items || [])).catch(() => setFornecedores([]));
    }, [form.origem, fornecedores.length]);

    async function criar() {
        setErro(''); setSalvando(true);
        try {
            const r = await authFetch('/api/pricebooks/nova', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, tipo: form.tipo || null, contratante_id: form.contratante_id || null, supplier_id: form.supplier_id || null }),
            });
            const base = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(base.error || 'Erro ao criar a base');
            let aviso = `Base "${base.nome_lpu}" criada.`;
            if (arquivo) {
                const res = await importarPlanilha(base.id, arquivo);
                aviso += ` ${res.criados} item(ns) importado(s) da planilha.`;
            }
            onCriada(base.id, aviso);
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Nova LPU">
            <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-foreground">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">Nova LPU</h3>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden /></button>
                </div>
                {erro && <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</div>}
                <div className="grid grid-cols-2 gap-3">
                    <label className="col-span-2"><span className={ROTULO}>Nome *</span>
                        <input autoFocus className={CAMPO} value={form.nome_lpu} onChange={e => set('nome_lpu', e.target.value)} placeholder="Ex.: PV Padrão Highline, LPU Operações IHS" /></label>
                    <label><span className={ROTULO}>Natureza *</span>
                        <select className={CAMPO} value={form.origem} onChange={e => set('origem', e.target.value)}>
                            <option value="PV_CLIENTE">PV do cliente (preço ao cliente)</option>
                            <option value="LPU_LS_OFFICE">LPU LS Office (custo LS)</option>
                            <option value="FORNECEDOR">Fornecedor</option>
                        </select></label>
                    <label><span className={ROTULO}>Área *</span>
                        <select className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                            <option value="IMPLANTACAO">Implantação</option>
                            <option value="OPERACAO">Operação</option>
                            <option value="">Serve às duas</option>
                        </select></label>
                    <label><span className={ROTULO}>Cliente</span>
                        <select className={CAMPO} value={form.contratante_id} onChange={e => set('contratante_id', e.target.value)}>
                            <option value="">Genérica (sem cliente)</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select></label>
                    {form.origem === 'FORNECEDOR' ? (
                        <label><span className={ROTULO}>Fornecedor *</span>
                            <select className={CAMPO} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                                <option value="">Selecione…</option>
                                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </select></label>
                    ) : (
                        <label><span className={ROTULO}>Região</span>
                            <input className={CAMPO} value={form.regiao} onChange={e => set('regiao', e.target.value)} /></label>
                    )}
                    <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.padrao} onChange={e => set('padrao', e.target.checked)} />
                        Padrão para este cliente e área <span className="text-xs text-muted-foreground">(é a que a atividade usa quando há mais de uma)</span>
                    </label>
                    <label className="col-span-2"><span className={ROTULO}>Planilha de itens (opcional — Excel ou CSV)</span>
                        <input type="file" accept={ACEITA_PLANILHA} onChange={e => setArquivo(e.target.files?.[0] || null)}
                            className={`${CAMPO} py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground`} />
                        <span className="mt-1 block text-[11px] text-muted-foreground">Colunas lidas pelo nome do cabeçalho: Descrição (obrigatória), Código, Unidade, Categoria, Valor, Custo.</span>
                    </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onFechar} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold">Cancelar</button>
                    <button type="button" onClick={criar} disabled={salvando || form.nome_lpu.trim().length < 3 || (form.origem === 'FORNECEDOR' && !form.supplier_id)}
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{salvando ? 'Criando…' : 'Criar LPU'}</button>
                </div>
            </div>
        </div>
    );
}
