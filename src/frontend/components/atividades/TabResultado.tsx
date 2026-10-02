import { useState, useEffect, useCallback } from 'react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Row, Dinheiro, Vazio } from './ui';
import { fmtMoeda } from './constants';

export default function TabResultado({ atividade }: { atividade: AtividadeDetalhe }) {
    const [financeiro, setFinanceiro] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/contratacoes/financeiro/${atividade.id}`);
            setFinanceiro(r.ok ? await r.json() : null);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    const receita = atividade.valor_contrato ?? 0;
    const custoPrevisto = atividade.valor_orcado ?? 0;
    const custoComprometido = financeiro?.custo_comprometido ?? 0;
    const custoPago = financeiro?.custo_pago ?? 0;
    const custoAPagar = financeiro?.custo_a_pagar ?? 0;

    const resultadoProjetado = receita - custoPrevisto;
    const margemProjetada = receita > 0 ? (resultadoProjetado / receita) * 100 : 0;
    const resultadoRealizado = receita - custoPago;
    const margemRealizada = receita > 0 ? (resultadoRealizado / receita) * 100 : 0;
    const desvio = margemRealizada - margemProjetada;

    return (
        <div>
            <Card title="Receita e custo">
                <Row label="Receita (valor de contrato)" value={<Dinheiro v={receita} />} />
                <Row label="Custo previsto (orçado)" value={<Dinheiro v={custoPrevisto} />} />
                <Row label="Custo comprometido (contratado)" value={<Dinheiro v={custoComprometido} className={receita > 0 && custoComprometido > receita ? 'text-crit' : undefined} />} />
                <Row label="Custo pago" value={<Dinheiro v={custoPago} className={receita > 0 && custoPago > receita ? 'text-crit' : undefined} />} />
                <Row label="Custo a pagar" value={<Dinheiro v={custoAPagar} />} />
            </Card>

            <Card title="Margem">
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-secondary/40 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Margem projetada</div>
                        <div className={`text-2xl font-bold ${margemProjetada < 0 ? 'text-crit' : ''}`}>{receita > 0 ? `${margemProjetada.toFixed(1)}%` : <Vazio />}</div>
                        <div className="text-xs text-muted-foreground mt-1">{receita > 0 ? fmtMoeda(resultadoProjetado) : 'Sem valor de contrato'}</div>
                    </div>
                    <div className="text-center p-4 bg-secondary/40 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Margem realizada</div>
                        <div className={`text-2xl font-bold ${margemRealizada < 0 ? 'text-crit' : ''}`}>{receita > 0 ? `${margemRealizada.toFixed(1)}%` : <Vazio />}</div>
                        <div className="text-xs text-muted-foreground mt-1">{receita > 0 ? fmtMoeda(resultadoRealizado) : 'Sem valor de contrato'}</div>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border text-center">
                    {receita > 0 ? (
                        <span className={`text-sm font-semibold ${desvio < 0 ? 'text-crit' : 'text-foreground'}`}>
                            Desvio: {desvio >= 0 ? '+' : ''}{desvio.toFixed(1)} p.p.
                        </span>
                    ) : <span className="text-sm text-muted-foreground">Desvio: —</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                    Cálculo simplificado (v1) — "realizado" considera apenas custo efetivamente pago, não o custo a pagar comprometido.
                </p>
            </Card>
        </div>
    );
}
