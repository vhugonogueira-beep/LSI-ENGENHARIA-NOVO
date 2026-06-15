export function Sites() {
    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Sites</h2>
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">Novo Site</button>
            </div>
            <div className="bg-card rounded-lg shadow-sm border p-6">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b">
                            <th className="pb-3 font-medium">ID Site</th>
                            <th className="pb-3 font-medium">Cidade/UF</th>
                            <th className="pb-3 font-medium text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="py-4">RJCAM15_001 / RJCMP031</td>
                            <td className="py-4">Rio de Janeiro / RJ</td>
                            <td className="py-4 text-right">
                                <button className="text-primary hover:underline">Editar</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
