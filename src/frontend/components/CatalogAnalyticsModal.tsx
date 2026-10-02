import { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { X } from 'lucide-react';
import { T } from '../theme';

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
        fetch(`/api/analytics/dispersion?itemKey=${itemKey}&regiao=GERAL&mode=${mode}`)
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
            <div className="bg-card rounded-lg shadow-lg w-full max-w-4xl p-6 relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} aria-label="Fechar" title="Fechar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
                    <X size={20} aria-hidden />
                </button>

                <h3 className="text-2xl font-bold mb-2">Análise de preços (dispersão)</h3>
                <p className="text-muted-foreground mb-6 font-medium">{itemTitle}</p>

                <div className="flex bg-muted p-1 rounded-md w-fit mb-6">
                    <button
                        onClick={() => setMode('ORIGINAL')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors ${mode === 'ORIGINAL' ? 'bg-card border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Valor original
                    </button>
                    <button
                        onClick={() => setMode('CORRIGIDO')}
                        className={`px-4 py-1.5 rounded-md font-medium text-sm transition-colors ${mode === 'CORRIGIDO' ? 'bg-card border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Corrigido (inflação)
                    </button>
                </div>

                {loading ? (
                    <div className="h-64 flex items-center justify-center">Carregando dados...</div>
                ) : !data || !data.stats ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">Sem histórico de preços para este item.</div>
                ) : (
                    <div className="space-y-8">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-5 gap-4">
                            <div className="bg-secondary/40 border p-4 rounded-xl">
                                <p className="text-sm text-muted-foreground font-medium">Contagem</p>
                                <p className="text-xl font-bold">{data.stats.count}
                                    <span className="text-xs text-muted-foreground font-normal ml-1">ocorr.</span>
                                </p>
                            </div>
                            <div className="bg-info/10 border border-info/30 p-4 rounded-xl">
                                <p className="text-sm text-info font-medium">Mediana</p>
                                <p className="text-xl font-bold text-foreground">{BRL(data.stats.median)}</p>
                            </div>
                            <div className="bg-secondary/40 border p-4 rounded-xl">
                                <p className="text-sm text-muted-foreground font-medium">Média</p>
                                <p className="text-xl font-bold">{BRL(data.stats.mean)}</p>
                            </div>
                            <div className="bg-secondary/40 border p-4 rounded-xl">
                                <p className="text-sm text-muted-foreground font-medium">Faixa típica (P25-P75)</p>
                                <p className="text-lg font-bold">{BRL(data.stats.p25)} - {BRL(data.stats.p75)}</p>
                            </div>
                            <div className="bg-secondary/40 border p-4 rounded-xl">
                                <p className="text-sm text-muted-foreground font-medium">Mín. e máx.</p>
                                <p className="text-lg font-bold">{BRL(data.stats.min)} - {BRL(data.stats.max)}</p>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="h-80 w-full border rounded-xl bg-card p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.brBase} />
                                    <XAxis
                                        type="category"
                                        dataKey="date"
                                        name="Data"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: T.txMut, fontSize: 12 }}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="value"
                                        name="Valor"
                                        tickFormatter={(val) => `R$ ${val}`}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: T.txMut, fontSize: 12 }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const p = payload[0].payload;
                                                return (
                                                    <div className="bg-card border shadow-lg rounded-lg p-3">
                                                        <p className="font-bold text-sm mb-1">{BRL(p.value)}</p>
                                                        <p className="text-xs text-muted-foreground">Data: {p.date}</p>
                                                        <p className="text-xs text-muted-foreground">Site: {p.site}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Scatter name="Preços" data={data.dataset} fill={T.blue} fillOpacity={0.6} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
