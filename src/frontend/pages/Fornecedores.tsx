import { useState, useEffect } from 'react';
import { Building2, Plus, Search, ExternalLink, Pencil, Trash2, Image } from 'lucide-react';

interface Supplier {
    id: string;
    nome: string;
    cnpj: string | null;
    email: string | null;
    telefone: string | null;
    logo_url: string | null;
    ativo: boolean;
    _count?: { priceBooks: number };
}

export function Fornecedores() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState({
        nome: '', cnpj: '', email: '', telefone: '', logo_url: ''
    });

    const loadSuppliers = async () => {
        setLoading(true);
        try {
            const resp = await fetch('/api/suppliers');
            const data = await resp.json();
            setSuppliers(data.items || []);
        } catch (e) {
            console.error(e);
            setSuppliers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSuppliers(); }, []);

    const resetForm = () => {
        setForm({ nome: '', cnpj: '', email: '', telefone: '', logo_url: '' });
        setEditingId(null);
    };

    const openCreate = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const openEdit = (s: Supplier) => {
        setForm({
            nome: s.nome,
            cnpj: s.cnpj || '',
            email: s.email || '',
            telefone: s.telefone || '',
            logo_url: s.logo_url || '',
        });
        setEditingId(s.id);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                nome: form.nome,
                cnpj: form.cnpj || null,
                email: form.email || null,
                telefone: form.telefone || null,
                logo_url: form.logo_url || null,
            };

            if (editingId) {
                await fetch(`/api/suppliers/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                await fetch('/api/suppliers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            setIsModalOpen(false);
            resetForm();
            loadSuppliers();
        } catch (e) {
            alert('Erro ao salvar fornecedor');
        }
    };

    const handleDelete = async (id: string, nome: string) => {
        if (!confirm(`Deseja desativar o fornecedor "${nome}"?`)) return;
        try {
            await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
            loadSuppliers();
        } catch (e) {
            alert('Erro ao remover fornecedor');
        }
    };

    const filtered = suppliers.filter(s =>
        s.nome.toLowerCase().includes(search.toLowerCase()) ||
        (s.cnpj && s.cnpj.includes(search))
    );

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                        <Building2 className="text-primary" size={28} />
                        Fornecedores
                    </h2>
                    <p className="text-muted-foreground mt-1">Gerencie fornecedores e suas listas de preços (LPU)</p>
                </div>
                <button
                    onClick={openCreate}
                    className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-medium shadow-sm"
                >
                    <Plus size={18} /> Novo Fornecedor
                </button>
            </div>

            {/* Search */}
            <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                    type="text"
                    placeholder="Buscar por nome ou CNPJ..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </div>

            {/* Supplier Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">Carregando...</div>
                ) : filtered.length === 0 ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">
                        {search ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado. Clique em "Novo Fornecedor" para começar.'}
                    </div>
                ) : filtered.map(s => (
                    <div key={s.id} className="bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {s.logo_url ? (
                                    <img src={s.logo_url} alt={s.nome} className="w-12 h-12 object-contain rounded-lg border bg-white p-1" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Building2 className="text-primary" size={24} />
                                    </div>
                                )}
                                <div>
                                    <h3 className="font-bold text-lg">{s.nome}</h3>
                                    {s.cnpj && <p className="text-xs text-muted-foreground">{s.cnpj}</p>}
                                </div>
                            </div>
                        </div>

                        {(s.email || s.telefone) && (
                            <div className="text-sm text-muted-foreground mb-3 space-y-0.5">
                                {s.email && <p>✉ {s.email}</p>}
                                {s.telefone && <p>☎ {s.telefone}</p>}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t">
                            <a
                                href={`/pricebooks?supplier=${s.id}`}
                                className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
                            >
                                <ExternalLink size={14} />
                                {s._count?.priceBooks || 0} LPU(s)
                            </a>
                            <div className="flex gap-2">
                                <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-muted" title="Editar">
                                    <Pencil size={16} className="text-muted-foreground" />
                                </button>
                                <button onClick={() => handleDelete(s.id, s.nome)} className="p-1.5 rounded-md hover:bg-red-50" title="Desativar">
                                    <Trash2 size={16} className="text-red-500" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-5">
                            {editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nome *</label>
                                <input
                                    type="text" required
                                    value={form.nome}
                                    onChange={e => setForm({ ...form, nome: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="Ex: Highline, Winity, SBA..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1">CNPJ</label>
                                    <input
                                        type="text"
                                        value={form.cnpj}
                                        onChange={e => setForm({ ...form, cnpj: e.target.value })}
                                        className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                        placeholder="00.000.000/0001-00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Telefone</label>
                                    <input
                                        type="text"
                                        value={form.telefone}
                                        onChange={e => setForm({ ...form, telefone: e.target.value })}
                                        className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">E-mail</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">URL da Logo</label>
                                <input
                                    type="text"
                                    value={form.logo_url}
                                    onChange={e => setForm({ ...form, logo_url: e.target.value })}
                                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="https://..."
                                />
                                {form.logo_url && (
                                    <div className="mt-2 p-2 border rounded-lg bg-white inline-block">
                                        <img src={form.logo_url} alt="Preview" className="h-12 object-contain" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); resetForm(); }}
                                    className="px-4 py-2.5 border rounded-lg hover:bg-muted font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary/90 font-medium shadow-sm"
                                >
                                    {editingId ? 'Salvar' : 'Criar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
