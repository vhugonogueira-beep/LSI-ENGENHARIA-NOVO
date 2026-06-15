import { useState, useEffect } from 'react';

interface Contratante {
    id: string;
    nome: string;
    contato_nome: string;
    logo_url: string | null;
}

export function Contratantes() {
    const [items, setItems] = useState<Contratante[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [novoNome, setNovoNome] = useState('');
    const [novoContato, setNovoContato] = useState('');
    const [novaLogo, setNovaLogo] = useState('');

    const loadContratantes = () => {
        setLoading(true);
        fetch('/api/contratantes')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setItems(data);
                } else {
                    console.error("API did not return an array:", data);
                    setItems([]);
                }
            })
            .catch(err => {
                console.error(err);
                setItems([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadContratantes();
    }, []);

    const handleUpdateLogo = async (id: string) => {
        const url = prompt("Digite a URL da nova logo para este contratante:");
        if (url === null) return;

        try {
            const resp = await fetch(`/api/contratantes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logo_url: url })
            });
            if (resp.ok) {
                setItems(items.map(i => i.id === id ? { ...i, logo_url: url } : i));
            } else {
                alert("Erro ao atualizar logo");
            }
        } catch {
            alert("Erro ao atualizar logo");
        }
    };

    const handleCreateContratante = async (e: React.FormEvent) => {
        e.preventDefault();

        let tenantId = "";
        try {
            const resp = await fetch('/api/contratantes');
            const data = await resp.json();
            if (data && data.length > 0 && Array.isArray(data)) {
                tenantId = data[0].tenant_id;
            } else {
                tenantId = "a1d30f41-2820-47c4-bab3-dc7a03e81750"; // Fallback demo ID
            }
        } catch (e) {
            tenantId = "a1d30f41-2820-47c4-bab3-dc7a03e81750";
        }

        // If even fallback fails, let's just make sure there's SOME id (for sqlite relation)
        if (!tenantId) tenantId = 'fallback-tenant-id';

        const payload = {
            tenant_id: tenantId,
            nome: novoNome,
            contato_nome: novoContato,
            logo_url: novaLogo || null
        };

        try {
            const resp = await fetch('/api/contratantes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                setIsModalOpen(false);
                setNovoNome('');
                setNovoContato('');
                setNovaLogo('');
                loadContratantes();
            } else {
                alert("Erro ao criar contratante.");
            }
        } catch (e) {
            console.error("Erro ao criar contratante", e);
        }
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Contratantes</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">Novo Contratante</button>
            </div>
            <div className="bg-card rounded-lg shadow-sm border p-6">
                {loading ? <p>Carregando...</p> : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b">
                                <th className="pb-3 font-medium">Logo</th>
                                <th className="pb-3 font-medium">Nome</th>
                                <th className="pb-3 font-medium">Contato</th>
                                <th className="pb-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(c => (
                                <tr key={c.id} className="border-b">
                                    <td className="py-4">
                                        {c.logo_url ? <img src={c.logo_url} alt="Logo" className="h-8 object-contain" /> : <span className="text-muted-foreground text-sm">Sem logo</span>}
                                    </td>
                                    <td className="py-4 font-medium">{c.nome}</td>
                                    <td className="py-4">{c.contato_nome}</td>
                                    <td className="py-4 text-right">
                                        <button onClick={() => handleUpdateLogo(c.id)} className="text-primary hover:underline text-sm mr-4">Trocar Logo</button>
                                        <button className="text-primary hover:underline text-sm">Editar</button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Nenhum contratante cadastrado.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4">Novo Contratante</h3>
                        <form onSubmit={handleCreateContratante} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nome da Empresa</label>
                                <input
                                    type="text"
                                    value={novoNome}
                                    onChange={e => setNovoNome(e.target.value)}
                                    className="w-full border rounded-md p-2"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Contato (Nome)</label>
                                <input
                                    type="text"
                                    value={novoContato}
                                    onChange={e => setNovoContato(e.target.value)}
                                    className="w-full border rounded-md p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">URL da Logo (Opcional)</label>
                                <input
                                    type="text"
                                    value={novaLogo}
                                    onChange={e => setNovaLogo(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full border rounded-md p-2"
                                />
                            </div>
                            <div className="flex justify-end space-x-3 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-md hover:bg-muted font-medium">Cancelar</button>
                                <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
