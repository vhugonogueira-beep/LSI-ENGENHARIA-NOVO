import { useState, useEffect, useCallback } from 'react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Row } from './ui';
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
            <Card title="Receita & Custo">
                <Row label="Receita (valor de contrato)" value={fmtMoeda(receita)} />
                <Row label="Custo previsto (orçado)" value={fmtMoeda(custoPrevisto)} />
                <Row label="Custo comprometido (contratado)" value={fmtMoeda(custoComprometido)} />
                <Row label="Custo pago" value={fmtMoeda(custoPago)} />
                <Row label="Custo a pagar" value={fmtMoeda(custoAPagar)} />
            </Card>

            <Card title="Margem">
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-secondary/40 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Margem Projetada</div>
                        <div className="text-2xl font-bold">{margemProjetada.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground mt-1">{fmtMoeda(resultadoProjetado)}</div>
                    </div>
                    <div className="text-center p-4 bg-secondary/40 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Margem Realizada</div>
                        <div className="text-2xl font-bold">{margemRealizada.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground mt-1">{fmtMoeda(resultadoRealizado)}</div>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border text-center">
                    <span className={`text-sm font-semibold ${desvio >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        Desvio: {desvio >= 0 ? '+' : ''}{desvio.toFixed(1)} p.p.
                    </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                    Cálculo simplificado (v1) — "realizado" considera apenas custo efetivamente pago, não o custo a pagar comprometido.
                </p>
            </Card>
        </div>
    );
}
