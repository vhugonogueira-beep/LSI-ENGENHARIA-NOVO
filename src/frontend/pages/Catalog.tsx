import { useState, useEffect } from 'react';
import { CatalogAnalyticsModal } from '../components/CatalogAnalyticsModal';
import { BarChart3 } from 'lucide-react';

export function Catalog() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
    const [selectedItemTitle, setSelectedItemTitle] = useState<string>('');

    useEffect(() => {
        fetch('http://localhost:3001/api/catalog-services')
            .then(res => res.json())
            .then(data => {
                setItems(data);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });
    }, []);

    const openAnalytics = (item: any) => {
        setSelectedItemKey(item.id);
        setSelectedItemTitle(item.titulo);
        setModalOpen(true);
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Catálogo de Serviços</h2>
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">Novo Item</button>
            </div>

            <div className="bg-card rounded-lg shadow-sm border p-6">
                {loading ? (
                    <div className="p-4 text-center text-muted-foreground">Carregando catálogo...</div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b">
                                <th className="pb-3 font-medium">Código</th>
                                <th className="pb-3 font-medium">Título</th>
                                <th className="pb-3 font-medium">Categoria</th>
                                <th className="pb-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-muted/30">
                                    <td className="py-4 font-medium">{item.codigo}</td>
                                    <td className="py-4">{item.titulo}</td>
                                    <td className="py-4">
                                        <span className="bg-muted px-2 py-1 rounded-md text-xs font-semibold">{item.categoria}</span>
                                    </td>
                                    <td className="py-4 text-right flex justify-end gap-4">
                                        <button
                                            onClick={() => openAnalytics(item)}
                                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-medium"
                                        >
                                            <BarChart3 size={16} /> Dispersão e Valores
                                        </button>
                                        <button className="text-primary hover:underline font-medium text-sm">Editar</button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum item no catálogo.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <CatalogAnalyticsModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                itemKey={selectedItemKey}
                itemTitle={selectedItemTitle}
            />
        </div>
    );
}
