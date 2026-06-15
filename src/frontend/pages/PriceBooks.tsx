import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Search, Filter, Archive, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { ImportPreview } from '../components/ImportPreview';

interface PriceBook {
    id: string;
    nome_lpu: string;
    regiao: string;
    status: string;
    data_inicio_vigencia: string | null;
    data_fim_vigencia: string | null;
    supplier: { id: string; nome: string; logo_url: string | null };
    _count: { items: number };
}

interface PriceBookItem {
    id: string;
    tipo_escopo: string;
    subtipo: string | null;
    codigo_item: string | null;
    descricao: string;
    unidade: string;
    valor_unitario: number;
}

interface Supplier {
    id: string;
    nome: string;
}

const REGIOES = ['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'];

export function PriceBooks() {
    const [searchParams] = useSearchParams();
    const supplierFilter = searchParams.get('supplier') || '';

    const [priceBooks, setPriceBooks] = useState<PriceBook[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState(supplierFilter);
    const [selectedRegiao, setSelectedRegiao] = useState('');

    // Expanded pricebook ID → items
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [items, setItems] = useState<PriceBookItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemsTotal, setItemsTotal] = useState(0);
    const [itemSearch, setItemSearch] = useState('');
    const [itemTipoFilter, setItemTipoFilter] = useState('');

    // Create LPU modal
    const [createModal, setCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({ supplier_id: '', nome_lpu: '', regiao: 'SUDESTE' });

    // Import modal
    const [importModal, setImportModal] = useState(false);
    const [importPricebookId, setImportPricebookId] = useState('');
    const [importSupplierId, setImportSupplierId] = useState('');

    const BRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const loadSuppliers = async () => {
        try {
            const resp = await fetch('/api/suppliers');
            const data = await resp.json();
            setSuppliers(data.items || []);
        } catch { setSuppliers([]); }
    };

    const loadPriceBooks = useCallback(async () => {
        setLoading(true);
        try {
            let url = '/api/pricebooks?';
            if (selectedSupplierId) url += `supplier_id=${selectedSupplierId}&`;
            if (selectedRegiao) url += `regiao=${selectedRegiao}&`;
            const resp = await fetch(url);
            const data = await resp.json();
            setPriceBooks(Array.isArray(data) ? data : []);
        } catch { setPriceBooks([]); }
        setLoading(false);
    }, [selectedSupplierId, selectedRegiao]);

    useEffect(() => { loadSuppliers(); }, []);
    useEffect(() => { loadPriceBooks(); }, [loadPriceBooks]);

    const loadItems = async (pbId: string, search = '', tipo = '') => {
        setItemsLoading(true);
        try {
            let url = `/api/pricebooks/${pbId}/items?limit=200`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (tipo) url += `&tipo_escopo=${tipo}`;
            const resp = await fetch(url);
            const data = await resp.json();
            setItems(data.items || []);
            setItemsTotal(data.total || 0);
        } catch { setItems([]); }
        setItemsLoading(false);
    };

    const toggleExpand = (pb: PriceBook) => {
        if (expandedId === pb.id) {
            setExpandedId(null);
            setItems([]);
        } else {
            setExpandedId(pb.id);
            setItemSearch('');
            setItemTipoFilter('');
            loadItems(pb.id);
        }
    };

    const handleItemSearch = () => {
        if (expandedId) loadItems(expandedId, itemSearch, itemTipoFilter);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await fetch('/api/pricebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm),
            });
            setCreateModal(false);
            setCreateForm({ supplier_id: '', nome_lpu: '', regiao: 'SUDESTE' });
            loadPriceBooks();
        } catch { alert('Erro ao criar LPU'); }
    };

    const handleArchive = async (id: string) => {
        if (!confirm('Deseja arquivar esta LPU?')) return;
        try {
            await fetch(`/api/pricebooks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'ARQUIVADA' }),
            });
            loadPriceBooks();
        } catch { alert('Erro ao arquivar'); }
    };

    const openImport = (pb: PriceBook) => {
        setImportPricebookId(pb.id);
        setImportSupplierId(pb.supplier.id);
        setImportModal(true);
    };

    const onImportComplete = () => {
        setImportModal(false);
        loadPriceBooks();
        if (expandedId) loadItems(expandedId, itemSearch, itemTipoFilter);
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                        <BookOpen className="text-primary" size={28} />
                        LPU — Lista de Preços Unitários
                    </h2>
                    <p className="text-muted-foreground mt-1">Catálogo central de preços por fornecedor e região</p>
                </div>
                <button
                    onClick={() => setCreateModal(true)}
                    className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-medium shadow-sm"
                >
                    <Plus size={18} /> Nova LPU
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-5">
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-muted-foreground" />
                    <select
                        value={selectedSupplierId}
                        onChange={e => setSelectedSupplierId(e.target.value)}
                        className="border rounded-lg px-3 py-2 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="">Todos Fornecedores</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                </div>
                <select
                    value={selectedRegiao}
                    onChange={e => setSelectedRegiao(e.target.value)}
                    className="border rounded-lg px-3 py-2 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                    <option value="">Todas Regiões</option>
                    {REGIOES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
            </div>

            {/* PriceBook List */}
            {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : priceBooks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border">
                    Nenhuma LPU encontrada. Crie uma nova ou ajuste os filtros.
                </div>
            ) : (
                <div className="space-y-3">
                    {priceBooks.map(pb => (
                        <div key={pb.id} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                            {/* PriceBook Row */}
                            <div
                                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => toggleExpand(pb)}
                            >
                                <div className="flex items-center gap-4">
                                    {expandedId === pb.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    {pb.supplier.logo_url && (
                                        <img src={pb.supplier.logo_url} alt="" className="h-8 w-8 object-contain rounded border bg-white p-0.5" />
                                    )}
                                    <div>
                                        <h4 className="font-bold">{pb.nome_lpu}</h4>
                                        <p className="text-xs text-muted-foreground">
                                            {pb.supplier.nome} • {pb.regiao.replace('_', ' ')} • {pb._count.items} itens
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pb.status === 'ATIVA'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {pb.status}
                                    </span>
                                    <button
                                        onClick={e => { e.stopPropagation(); openImport(pb); }}
                                        className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Upload size={14} /> Importar
                                    </button>
                                    {pb.status === 'ATIVA' && (
                                        <button
                                            onClick={e => { e.stopPropagation(); handleArchive(pb.id); }}
                                            className="text-sm text-muted-foreground hover:text-red-500 flex items-center gap-1"
                                        >
                                            <Archive size={14} /> Arquivar
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Items */}
                            {expandedId === pb.id && (
                                <div className="border-t px-5 py-4 bg-muted/10">
                                    {/* Filters */}
                                    <div className="flex gap-3 mb-3">
                                        <div className="flex-1 relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                            <input
                                                type="text"
                                                placeholder="Buscar item..."
                                                value={itemSearch}
                                                onChange={e => setItemSearch(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleItemSearch()}
                                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                            />
                                        </div>
                                        <select
                                            value={itemTipoFilter}
                                            onChange={e => { setItemTipoFilter(e.target.value); if (expandedId) loadItems(expandedId, itemSearch, e.target.value); }}
                                            className="border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        >
                                            <option value="">Todos Tipos</option>
                                            <option value="SERVICO">SERVIÇO</option>
                                            <option value="INFRA">INFRA</option>
                                        </select>
                                        <button onClick={handleItemSearch} className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium">
                                            Buscar
                                        </button>
                                    </div>

                                    {/* Items Table */}
                                    {itemsLoading ? (
                                        <p className="text-center text-muted-foreground py-4">Carregando itens...</p>
                                    ) : items.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-4">Nenhum item encontrado.</p>
                                    ) : (
                                        <>
                                            <p className="text-xs text-muted-foreground mb-2">{itemsTotal} itens no total</p>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b bg-muted/30">
                                                            <th className="text-left py-2 px-2 font-medium">Código</th>
                                                            <th className="text-left py-2 px-2 font-medium">Tipo</th>
                                                            <th className="text-left py-2 px-2 font-medium">Descrição</th>
                                                            <th className="text-left py-2 px-2 font-medium">Unidade</th>
                                                            <th className="text-right py-2 px-2 font-medium">Valor Unitário</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {items.map(item => (
                                                            <tr key={item.id} className="hover:bg-muted/20">
                                                                <td className="py-2 px-2 text-muted-foreground">{item.codigo_item || '—'}</td>
                                                                <td className="py-2 px-2">
                                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.tipo_escopo === 'SERVICO'
                                                                        ? 'bg-blue-100 text-blue-700'
                                                                        : 'bg-amber-100 text-amber-700'
                                                                        }`}>
                                                                        {item.tipo_escopo === 'SERVICO' ? 'SERVIÇO' : 'INFRA'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 px-2 font-medium">{item.descricao}</td>
                                                                <td className="py-2 px-2 text-muted-foreground">{item.unidade}</td>
                                                                <td className="py-2 px-2 text-right font-semibold">{BRL(item.valor_unitario)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Create LPU Modal */}
            {createModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-5">Nova LPU (Lista de Preços)</h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Fornecedor *</label>
                                <select
                                    required
                                    value={createForm.supplier_id}
                                    onChange={e => setCreateForm({ ...createForm, supplier_id: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">Selecione...</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Nome da LPU *</label>
                                <input
                                    type="text" required
                                    value={createForm.nome_lpu}
                                    onChange={e => setCreateForm({ ...createForm, nome_lpu: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="Ex: LPU Highline 2026 - Sudeste"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Região *</label>
                                <select
                                    value={createForm.regiao}
                                    onChange={e => setCreateForm({ ...createForm, regiao: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    {REGIOES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setCreateModal(false)} className="px-4 py-2.5 border rounded-lg hover:bg-muted font-medium">
                                    Cancelar
                                </button>
                                <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary/90 font-medium shadow-sm">
                                    Criar LPU
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {importModal && (
                <ImportPreview
                    pricebookId={importPricebookId}
                    supplierId={importSupplierId}
                    onClose={() => setImportModal(false)}
                    onComplete={onImportComplete}
                />
            )}
        </div>
    );
}
