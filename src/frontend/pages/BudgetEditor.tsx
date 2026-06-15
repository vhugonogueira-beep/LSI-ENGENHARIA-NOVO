import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AddItemModal } from '../components/AddItemModal';
import { v4 as uuidv4 } from 'uuid';
import { Info, Zap, Building2, FileDown } from 'lucide-react';

interface Supplier {
    id: string;
    nome: string;
    logo_url: string | null;
}

interface PriceLookupResult {
    pricebook_item_id: string;
    descricao: string;
    unidade: string;
    valor_unitario: number;
    tipo_escopo: string;
    supplier_nome: string;
    pricebook_nome: string;
    score: number;
}

const REGIOES = [
    { value: 'SUDESTE', label: 'Sudeste' },
    { value: 'SUL', label: 'Sul' },
    { value: 'NORDESTE', label: 'Nordeste' },
    { value: 'NORTE', label: 'Norte' },
    { value: 'CENTRO_OESTE', label: 'Centro-Oeste' },
];

export function BudgetEditor() {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('cabecalho');

    // Header State
    const [siteRegion, setSiteRegion] = useState('SUDESTE');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [assunto, setAssunto] = useState('');

    // Detailed Budget State
    const [items, setItems] = useState<any[]>([]);
    const [isAddModalOpen, setAddModalOpen] = useState(false);

    // Price lookup state
    const [lookupQuery, setLookupQuery] = useState('');
    const [lookupResults, setLookupResults] = useState<PriceLookupResult[]>([]);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [showLookup, setShowLookup] = useState(false);

    // Load suppliers
    useEffect(() => {
        fetch('/api/suppliers')
            .then(r => r.json())
            .then(data => setSuppliers(data.items || []))
            .catch(() => setSuppliers([]));
    }, []);

    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

    // Price lookup from PriceBook
    const handlePriceLookup = async () => {
        if (!lookupQuery.trim()) return;
        setLookupLoading(true);
        try {
            let url = `/api/pricebooks/lookup-price?descricao=${encodeURIComponent(lookupQuery)}&regiao=${siteRegion}`;
            if (selectedSupplierId) url += `&supplier_id=${selectedSupplierId}`;
            const resp = await fetch(url);
            const data = await resp.json();
            setLookupResults(Array.isArray(data) ? data : []);
        } catch {
            setLookupResults([]);
        }
        setLookupLoading(false);
    };

    const addFromPriceLookup = async (result: PriceLookupResult) => {
        // Try to get BDI suggestion
        let bdiPercent = 0;
        let bdiHint = '';
        try {
            const bdiRes = await fetch(`/api/bdi/suggest?categoria=${result.tipo_escopo === 'SERVICO' ? 'ENERGIA' : 'CIVIL'}&regiao=${siteRegion}`);
            const bdiData = await bdiRes.json();
            bdiPercent = bdiData.sugerido || 0;
            bdiHint = bdiData.mensagem || '';
        } catch { /* use defaults */ }

        const newItem = {
            id: uuidv4(),
            codigo: '',
            descricao: result.descricao,
            quantidade: 1,
            valor_unitario: result.valor_unitario,
            bdi_percent: bdiPercent,
            bdi_hint: bdiHint,
            categoria: result.tipo_escopo,
            user_overridden: false,
            source_pricebook_item_id: result.pricebook_item_id,
            source_info: `${result.supplier_nome} — ${result.pricebook_nome}`,
        };

        setItems([...items, newItem]);
        setShowLookup(false);
        setLookupQuery('');
        setLookupResults([]);
    };

    const handleAddItem = async (catalogItem: any) => {
        try {
            const bdiRes = await fetch(`/api/bdi/suggest?categoria=${catalogItem.categoria}&regiao=${siteRegion}`);
            const bdiData = await bdiRes.json();

            const newItem = {
                id: uuidv4(),
                codigo: catalogItem.codigo,
                descricao: catalogItem.descricao_original,
                quantidade: 1,
                valor_unitario: catalogItem.valor_base || 0,
                bdi_percent: bdiData.sugerido || 0,
                bdi_hint: bdiData.mensagem || '',
                categoria: catalogItem.categoria,
                user_overridden: false
            };

            setItems([...items, newItem]);
            setAddModalOpen(false);
        } catch (e) {
            console.error("Failed to fetch auto BDI:", e);
            const newItemFallback = {
                id: uuidv4(),
                codigo: catalogItem.codigo,
                descricao: catalogItem.descricao_original,
                quantidade: 1,
                valor_unitario: catalogItem.valor_base || 0,
                bdi_percent: 0,
                bdi_hint: '',
                categoria: catalogItem.categoria,
                user_overridden: false
            };
            setItems([...items, newItemFallback]);
            setAddModalOpen(false);
        }
    };

    const updateItem = (id: string, field: string, value: any) => {
        setItems(items.map(i => {
            if (i.id === id) {
                const updated = { ...i, [field]: value };
                if (field === 'bdi_percent') {
                    updated.user_overridden = true;
                }
                return updated;
            }
            return i;
        }));
    };

    const removeItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const BRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const totalLines = items.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario * (1 + (i.bdi_percent / 100))), 0);

    return (
        <div className="p-8 pb-24">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Editor de Orçamento</h2>
                <div className="flex items-center gap-3">
                    <a
                        href={id ? `/api/budgets/${id}/export/excel` : '#'}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium"
                    >
                        <FileDown size={16} /> Excel
                    </a>
                    <button className="bg-secondary text-secondary-foreground border px-4 py-2 rounded-md hover:bg-muted">Salvar Rascunho</button>
                    <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">Aprovar / Enviar</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 border-b mb-6">
                <button
                    className={`px-4 py-2 font-medium border-b-2 ${activeTab === 'cabecalho' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('cabecalho')}
                >
                    Cabeçalho
                </button>
                <button
                    className={`px-4 py-2 font-medium border-b-2 ${activeTab === 'detalhado' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('detalhado')}
                >
                    Orçamento Detalhado
                </button>
                <button
                    className={`px-4 py-2 font-medium border-b-2 ${activeTab === 'resumo' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('resumo')}
                >
                    Resumo
                </button>
            </div>

            <div className="bg-card rounded-lg shadow-sm border p-6 min-h-[400px]">
                {activeTab === 'cabecalho' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium mb-1">Contratante</label>
                                <select className="w-full border rounded-md p-2">
                                    <option>HIGHLINE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Região do Orçamento</label>
                                <select
                                    className="w-full border rounded-md p-2"
                                    value={siteRegion}
                                    onChange={(e) => setSiteRegion(e.target.value)}
                                >
                                    {REGIOES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Supplier Selection */}
                        <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg">
                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2 text-blue-800">
                                <Building2 size={16} />
                                Fornecedor-Base (LPU)
                            </label>
                            <p className="text-xs text-blue-600 mb-2">
                                Ao selecionar um fornecedor, os valores unitários serão sugeridos a partir da LPU ativa para a região escolhida.
                            </p>
                            <select
                                className="w-full border border-blue-200 rounded-md p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                            >
                                <option value="">Nenhum (preços manuais)</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.nome}</option>
                                ))}
                            </select>
                            {selectedSupplier?.logo_url && (
                                <div className="mt-2 inline-block p-1.5 bg-white rounded border">
                                    <img src={selectedSupplier.logo_url} alt="" className="h-8 object-contain" />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Assunto/Objeto</label>
                            <input
                                type="text"
                                className="w-full border rounded-md p-2"
                                placeholder="Ex: Adequação de infraestrutura..."
                                value={assunto}
                                onChange={e => setAssunto(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'detalhado' && (
                    <div>
                        <h3 className="font-bold text-lg mb-4 text-primary w-full flex justify-between items-center">
                            <span>Bloco Principal</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowLookup(!showLookup)}
                                    className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 flex items-center gap-1.5 font-medium"
                                >
                                    <Zap size={14} /> Buscar na LPU
                                </button>
                                <button
                                    onClick={() => setAddModalOpen(true)}
                                    className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-100 font-medium"
                                >
                                    + Catálogo Interno
                                </button>
                            </div>
                        </h3>

                        {/* PriceBook Lookup */}
                        {showLookup && (
                            <div className="mb-4 p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                                <p className="text-sm font-semibold text-emerald-800 mb-2">Buscar preço na LPU do fornecedor</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ex: instalação de UR, mobilização, eletroduto..."
                                        value={lookupQuery}
                                        onChange={e => setLookupQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handlePriceLookup()}
                                        className="flex-1 border border-emerald-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                                    />
                                    <button
                                        onClick={handlePriceLookup}
                                        disabled={lookupLoading}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {lookupLoading ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                                {!selectedSupplierId && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        ⚠ Nenhum fornecedor selecionado — buscando em todas as LPUs ativas da região {siteRegion}.
                                    </p>
                                )}

                                {lookupResults.length > 0 && (
                                    <div className="mt-3 space-y-1.5">
                                        {lookupResults.map((r, i) => (
                                            <div key={i} className="flex items-center justify-between p-2.5 bg-white rounded-md border hover:border-emerald-400 transition-colors">
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">{r.descricao}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {r.supplier_nome} • {r.unidade} • Score: {r.score}%
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-emerald-700">{BRL(r.valor_unitario)}</span>
                                                    <button
                                                        onClick={() => addFromPriceLookup(r)}
                                                        className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-200"
                                                    >
                                                        + Adicionar
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {lookupResults.length === 0 && lookupQuery && !lookupLoading && (
                                    <p className="text-xs text-muted-foreground mt-2">Nenhum item encontrado na LPU.</p>
                                )}
                            </div>
                        )}

                        <table className="w-full text-left bg-muted/20 rounded-md">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="p-2 w-16">Item</th>
                                    <th className="p-2">Descrição</th>
                                    <th className="p-2 w-20">Qtd</th>
                                    <th className="p-2 w-32">Valor Unit.</th>
                                    <th className="p-2 w-32">BDI %</th>
                                    <th className="p-2 w-32 text-right">Total</th>
                                    <th className="p-2 w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it, idx) => {
                                    const total = it.quantidade * it.valor_unitario * (1 + (it.bdi_percent / 100));
                                    return (
                                        <tr key={it.id} className="border-b hover:bg-gray-50/50">
                                            <td className="p-2 font-medium">{it.codigo || (idx + 1).toString().padStart(2, '0')}</td>
                                            <td className="p-2 text-sm">
                                                <div>{it.descricao}</div>
                                                {it.source_info && (
                                                    <span className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                                                        <Zap size={10} /> {it.source_info}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={it.quantidade}
                                                    onChange={e => updateItem(it.id, 'quantidade', parseFloat(e.target.value))}
                                                    className="w-full border rounded p-1 text-sm outline-none focus:border-primary"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={it.valor_unitario}
                                                    onChange={e => updateItem(it.id, 'valor_unitario', parseFloat(e.target.value))}
                                                    className={`w-full border rounded p-1 text-sm outline-none focus:border-primary ${it.source_pricebook_item_id && !it.user_overridden ? 'bg-emerald-50 border-emerald-200' : ''}`}
                                                />
                                            </td>
                                            <td className="p-2 relative group">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={it.bdi_percent}
                                                        onChange={e => updateItem(it.id, 'bdi_percent', parseFloat(e.target.value))}
                                                        className={`w-full border rounded p-1 text-sm outline-none focus:border-primary ${!it.user_overridden && it.bdi_hint ? 'bg-green-50 border-green-200' : ''}`}
                                                    />
                                                    {it.bdi_hint && !it.user_overridden && (
                                                        <Info size={16} className="text-green-600 cursor-help" />
                                                    )}
                                                </div>
                                                {it.bdi_hint && !it.user_overridden && (
                                                    <div className="absolute left-1/2 bottom-full mb-1 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded p-2 z-10 -translate-x-1/2">
                                                        {it.bdi_hint}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-medium text-sm">{BRL(total)}</td>
                                            <td className="p-2 text-right">
                                                <button onClick={() => removeItem(it.id)} className="text-red-500 hover:text-red-700 text-xs font-bold px-2">X</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {items.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-gray-500">
                                            Nenhum item adicionado. Use "Buscar na LPU" para adicionar itens com preço do fornecedor.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-primary/5">
                                    <td colSpan={5} className="p-2 font-bold text-right uppercase text-sm">Subtotal</td>
                                    <td className="p-2 text-right font-bold">{BRL(totalLines)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {activeTab === 'resumo' && (
                    <div className="max-w-2xl mx-auto mt-8">
                        {selectedSupplier && (
                            <div className="flex items-center gap-3 mb-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                {selectedSupplier.logo_url && (
                                    <img src={selectedSupplier.logo_url} alt="" className="h-8 object-contain" />
                                )}
                                <span className="text-sm font-medium text-blue-800">
                                    Fornecedor: {selectedSupplier.nome} • Região: {siteRegion}
                                </span>
                            </div>
                        )}
                        <table className="w-full text-left text-lg">
                            <tbody className="divide-y">
                                <tr>
                                    <td className="py-4">Serviços Orçados</td>
                                    <td className="py-4 text-right">{BRL(totalLines)}</td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-primary">
                                    <td className="py-4 font-bold text-xl uppercase">Total Geral</td>
                                    <td className="py-4 text-right font-bold text-xl text-primary">{BRL(totalLines)}</td>
                                </tr>
                            </tfoot>
                        </table>
                        <div className="mt-8 flex justify-end gap-3">
                            <a
                                href={id ? `/api/budgets/${id}/export/excel` : '#'}
                                className="bg-emerald-600 text-white px-6 py-3 rounded-md font-medium text-lg shadow-sm hover:bg-emerald-700 flex items-center gap-2"
                            >
                                <FileDown size={18} /> Exportar Excel
                            </a>
                            <a
                                href={id ? `/api/budgets/${id}/export/html` : '#'}
                                target="_blank"
                                className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium text-lg shadow-sm hover:bg-primary/90"
                            >
                                Exportar PDF/HTML
                            </a>
                        </div>
                    </div>
                )}
            </div>

            <AddItemModal
                isOpen={isAddModalOpen}
                onClose={() => setAddModalOpen(false)}
                onAdd={handleAddItem}
                targetRegion={siteRegion}
            />
        </div>
    );
}
