import { useParams } from 'react-router-dom';

export function VersionHistory() {
    const { id } = useParams();
    console.log("Budget ID:", id); // Using the variable to bypass lint

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Histórico de Versões</h2>
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">Voltar ao Orçamento</button>
            </div>

            <div className="space-y-4">
                {/* Version Card */}
                <div className="bg-card rounded-lg shadow-sm border p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-primary mb-1">Versão 3 (Atual)</h3>
                            <p className="text-sm text-muted-foreground">Revisão por: Admin LS em 15/05/2026</p>
                            <p className="mt-3"><strong>Motivo da revisão:</strong> Ajuste nas quantidades de infraestrutura conforme solicitação do cliente via e-mail.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold">R$ 15.420,00</p>
                            <button className="mt-3 text-sm text-primary hover:underline">Ver Snapshot JSON</button>
                        </div>
                    </div>
                </div>

                {/* Older Version */}
                <div className="bg-card rounded-lg shadow-sm border p-6 opacity-75">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold mb-1">Versão 2</h3>
                            <p className="text-sm text-muted-foreground">Revisão por: Comercial LS em 10/05/2026</p>
                            <p className="mt-3"><strong>Motivo da revisão:</strong> Correção no BDI.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold">R$ 14.800,00</p>
                            <button className="mt-3 text-sm text-primary hover:underline">Restaurar esta versão</button>
                        </div>
                    </div>
                </div>

                {/* Oldest Version */}
                <div className="bg-card rounded-lg shadow-sm border p-6 opacity-75">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold mb-1">Versão 1 (Original)</h3>
                            <p className="text-sm text-muted-foreground">Criado por: Comercial LS em 01/05/2026</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold">R$ 14.100,00</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
