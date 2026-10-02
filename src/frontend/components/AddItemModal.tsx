import { useState, useEffect } from 'react';
import { X, Search, Zap, CheckCircle2 } from 'lucide-react';

export function AddItemModal({ isOpen, onClose, onAdd, targetRegion }: any) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            setLoading(true);
            fetch(`/api/price-engine/suggest?query=${encodeURIComponent(query)}&regiao=${targetRegion}`)
                .then(res => res.json())
                .then(data => {
                    setResults(Array.isArray(data) ? data : []);
                    setLoading(false);
                })
                .catch(e => {
                    console.error(e);
                    setLoading(false);
                });
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [query, targetRegion]);

    if (!isOpen) return null;

    const BRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg shadow-lg w-full max-w-3xl p-6 relative h-[80vh] flex flex-col">
                <button onClick={onClose} aria-label="Fechar" title="Fechar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
                    <X size={20} aria-hidden />
                </button>

                <h3 className="text-2xl font-bold mb-4">Adicionar item</h3>

                <div className="relative mb-6">
                    <Search className="absolute left-3 top-3 text-muted-foreground" size={20} aria-hidden />
                    <input
                        type="text"
                        autoFocus
                        className="w-full border rounded-lg pl-10 pr-4 py-3 text-lg bg-secondary focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                        placeholder="Busque por nome ou código do item..."
                        aria-label="Buscar item por nome ou código"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 bg-secondary/40 rounded-lg border p-2">
                    {loading && <p className="text-center text-muted-foreground mt-4">Buscando inteligência de preços...</p>}
                    {!loading && results.length === 0 && query.length >= 2 && (
                        <p className="text-center text-muted-foreground mt-4">Nenhum item com nível de confiança suficiente foi encontrado.</p>
                    )}

                    <div className="space-y-2">
                        {results.map((r, i) => (
                            <div key={i} className="bg-card border rounded-md p-4 flex justify-between items-center hover:border-primary/40 transition-colors">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-id text-xs font-semibold bg-muted px-2 py-0.5 rounded text-muted-foreground">{r.codigo}</span>
                                        {r.match_type === 'STRONG_MATCH' && (
                                            <span className="text-xs font-bold bg-ok/10 text-ok px-2 py-0.5 rounded flex items-center gap-1">
                                                <CheckCircle2 size={14} aria-hidden /> Alta confiança ({r.score_fuzzy}%)
                                            </span>
                                        )}
                                        {r.match_type === 'POSSIBLE_MATCH' && (
                                            <span className="text-xs font-bold bg-warn/10 text-warn px-2 py-0.5 rounded flex items-center gap-1">
                                                <Zap size={14} aria-hidden /> Sugestão ({r.score_fuzzy}%)
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="font-semibold text-lg">{r.descricao_original}</h4>
                                    <p className="text-sm text-muted-foreground mt-1">Categoria: <span className="font-medium text-foreground">{r.categoria}</span></p>

                                    {/* Regional Stats Hint */}
                                    {r.stats_regiao && (
                                        <p className="text-xs text-info mt-1 font-medium bg-info/10 w-fit px-2 py-0.5 rounded">
                                            Média regional: {BRL(r.stats_regiao.mean)} ({r.stats_regiao.count} orçamentos)
                                        </p>
                                    )}
                                </div>

                                <div className="text-right">
                                    <p className="text-xl font-bold text-foreground mb-2">{BRL(r.valor_base)} <span className="text-xs font-normal text-muted-foreground">/{r.unidade_padrao}</span></p>
                                    <button
                                        onClick={() => onAdd(r)}
                                        className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90"
                                    >
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
