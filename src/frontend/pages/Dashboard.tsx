import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [contratantes, setContratantes] = useState<any[]>([]);
    const [sites, setSites] = useState<any[]>([]);

    const [selectedContratante, setSelectedContratante] = useState('');
    const [selectedSite, setSelectedSite] = useState('');
    const [assunto, setAssunto] = useState('');

    useEffect(() => {
        if (isModalOpen && contratantes.length === 0) {
            Promise.all([
                fetch('/api/contratantes').then(r => r.json()),
                fetch('/api/sites').then(r => r.json())
            ]).then(([cData, sData]) => {
                setContratantes(cData);
                setSites(sData);
                if (cData.length > 0) setSelectedContratante(cData[0].id);
                if (sData.length > 0) setSelectedSite(sData[0].id);
            });
        }
    }, [isModalOpen]);

    const handleCreateBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        const tenantId = contratantes[0]?.tenant_id || sites[0]?.tenant_id;

        const payload = {
            tenant_id: tenantId,
            contratante_id: selectedContratante,
            site_id: selectedSite,
            assunto
        };

        try {
            const resp = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (data.id) {
                navigate(`/budgets/${data.id}`);
            }
        } catch (e) {
            console.error("Erro ao criar orçamento", e);
        }
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Dashboard</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
                >
                    Novo Orçamento
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-card p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-medium text-muted-foreground">Rascunhos</h3>
                    <p className="text-4xl font-bold mt-2">5</p>
                </div>
                <div className="bg-card p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-medium text-muted-foreground">Enviados</h3>
                    <p className="text-4xl font-bold mt-2">12</p>
                </div>
                <div className="bg-card p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-medium text-muted-foreground">Aprovados</h3>
                    <p className="text-4xl font-bold mt-2">34</p>
                </div>
            </div>

            <div className="bg-card rounded-lg shadow-sm border p-6">
                <h3 className="text-xl font-bold mb-4">Últimos Orçamentos</h3>
                <p className="text-muted-foreground">Carregando lista...</p>
            </div>

            {/* Modal Novo Orçamento */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4">Criar Novo Orçamento</h3>
                        <form onSubmit={handleCreateBudget} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Contratante</label>
                                <select
                                    value={selectedContratante}
                                    onChange={e => setSelectedContratante(e.target.value)}
                                    className="w-full border rounded-md p-2"
                                    required
                                >
                                    {contratantes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Site</label>
                                <select
                                    value={selectedSite}
                                    onChange={e => setSelectedSite(e.target.value)}
                                    className="w-full border rounded-md p-2"
                                    required
                                >
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.id_site}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Assunto / Objeto</label>
                                <input
                                    type="text"
                                    value={assunto}
                                    onChange={e => setAssunto(e.target.value)}
                                    placeholder="Assunto da proposta"
                                    className="w-full border rounded-md p-2"
                                />
                            </div>
                            <div className="flex justify-end space-x-3 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-md hover:bg-muted font-medium">Cancelar</button>
                                <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium">Criar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
