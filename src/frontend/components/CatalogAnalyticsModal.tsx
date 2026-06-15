import { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { X } from 'lucide-react';

interface StatsProps {
    stats: any;
    dataset: any[];
}

export function CatalogAnalyticsModal({ isOpen, onClose, itemKey, itemTitle }: any) {
    if (!isOpen) return null;

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<StatsProps | null>(null);
    const [mode, setMode] = useState<'ORIGINAL' | 'CORRIGIDO'>('ORIGINAL');

    useEffect(() => {
        if (!itemKey) return;
        setLoading(true);
        // Hardcoded regiao GERAL for now as there's no UI to select region beforehand here
        fetch(`http://localhost:3001/api/analytics/dispersion?itemKey=${itemKey}&regiao=GERAL&mode=${mode}`)
            .then(res => res.json())
            .then(data => {
                setData(data);
                setLoading(false);
            })
            .catch((e) => {
                console.error(e);
                setLoading(false);
            });
    }, [itemKey, mode]);

    const BRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-black">
                    <X size={24} />
                </button>

                <h3 className="text-2xl font-bold mb-2">Análise de Preços (Dispersão)</h3>
                <p className="text-gray-600 mb-6 font-medium">{itemTitle}</p>

                <div className="flex bg-gray-100 p-1 rounded-md w-fit mb-6">
                    <button
                        onClick={() => setMode('ORIGINAL')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors ${mode === 'ORIGINAL' ? 'bg-white shadow text-black' : 'text-gray-600 hover:text-black'}`}
                    >
                        Valor Original
                    </button>
                    <button
                        onClick={() => setMode('CORRIGIDO')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors ${mode === 'CORRIGIDO' ? 'bg-white shadow text-black' : 'text-gray-600 hover:text-black'}`}
                    >
                        Corrigido (Inflação)
                    </button>
                </div>

                {loading ? (
                    <div className="h-64 flex items-center justify-center">Carregando dados...</div>
                ) : !data || !data.stats ? (
                    <div className="h-64 flex items-center justify-center text-gray-500">Sem histórico de preços para este item.</div>
                ) : (
                    <div className="space-y-8">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-5 gap-4">
                            <div className="bg-gray-50 border p-4 rounded-xl">
                                <p className="text-sm text-gray-500 font-medium">Contagem</p>
                                <p className="text-xl font-bold">{data.stats.count}
                                    <span className="text-xs text-gray-400 font-normal ml-1">ocorr.</span>
                                </p>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                                <p className="text-sm text-blue-600 font-medium">Mediana</p>
                                <p className="text-xl font-bold text-blue-900">{BRL(data.stats.median)}</p>
                            </div>
                            <div className="bg-gray-50 border p-4 rounded-xl">
                                <p className="text-sm text-gray-500 font-medium">Média</p>
                                <p className="text-xl font-bold">{BRL(data.stats.mean)}</p>
                            </div>
                            <div className="bg-gray-50 border p-4 rounded-xl">
                                <p className="text-sm text-gray-500 font-medium">Faixa Típica (P25-P75)</p>
                                <p className="text-lg font-bold">{BRL(data.stats.p25)} - {BRL(data.stats.p75)}</p>
                            </div>
                            <div className="bg-gray-50 border p-4 rounded-xl">
                                <p className="text-sm text-gray-500 font-medium">Mín. e Máx.</p>
                                <p className="text-lg font-bold">{BRL(data.stats.min)} - {BRL(data.stats.max)}</p>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="h-80 w-full border rounded-xl bg-white p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        type="category"
                                        dataKey="date"
                                        name="Data"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#6B7280', fontSize: 12 }}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="value"
                                        name="Valor"
                                        tickFormatter={(val) => `R$ ${val}`}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#6B7280', fontSize: 12 }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const p = payload[0].payload;
                                                return (
                                                    <div className="bg-white border shadow-lg rounded-lg p-3">
                                                        <p className="font-bold text-sm mb-1">{BRL(p.value)}</p>
                                                        <p className="text-xs text-gray-500">Data: {p.date}</p>
                                                        <p className="text-xs text-gray-500">Site: {p.site}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Scatter name="Preços" data={data.dataset} fill="#3B82F6" fillOpacity={0.6} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
