import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { usePermissao, useSessao } from '../../lib/permissoes';
// Cor com significado: aguardando âmbar, aprovado verde, recusado rosa.
import { CHIP, FAIXA } from '../../lib/cores';

// Fila de aprovação de pagamentos. Quem aprova vê os pedidos de todos e
// decide; quem pediu vê os próprios, com a resposta. Aprovado, o pagamento
// continua PENDENTE até a pessoa repetir a solicitação — a aprovação só
// libera; quem manda o pedido ao financeiro continua sendo quem pediu.

interface Pedido {
    id: string; origem: string; descricao: string; valor: number; status: string; created_at: string;
    motivo_decisao: string | null; decidido_em: string | null; solicitante_id: string;
    solicitante: { nome: string; email: string }; decisor: { nome: string } | null;
    atividade: { codigo: string; id_site_sharing: string | null } | null;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (v: string) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function FilaAprovacoes({ onDecidido }: { onDecidido?: () => void }) {
    const podeAprovar = usePermissao('pagamentos.aprovar');
    const sessao = useSessao();
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [erro, setErro] = useState('');
    const [mostrarDecididos, setMostrarDecididos] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/aprovacoes-pagamento');
            if (r.ok) setPedidos(await r.json());
        } catch { /* a fila só não aparece */ }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    async function decidir(p: Pedido, decisao: 'APROVADA' | 'RECUSADA') {
        let motivo = '';
        if (decisao === 'RECUSADA') {
            motivo = prompt(`Motivo da recusa (aparece para ${p.solicitante.nome}):`) || '';
            if (!motivo.trim()) return;
        } else if (!confirm(`Aprovar ${moeda(p.valor)} — ${p.descricao}?`)) return;
        setErro('');
        const r = await fetch(`/api/aprovacoes-pagamento/${p.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisao, motivo }),
        });
        if (!r.ok) { setErro((await r.json().catch(() => null))?.error || 'Erro ao decidir'); return; }
        await carregar();
        onDecidido?.();
    }

    const pendentes = pedidos.filter(p => p.status === 'PENDENTE');
    const decididos = pedidos.filter(p => p.status !== 'PENDENTE').slice(0, 15);
    if (!pendentes.length && !decididos.length) return null;
    const total = pendentes.reduce((s, p) => s + p.valor, 0);

    return (
        <div className={`rounded-xl border p-4 ${pendentes.length ? 'border-warn/40 bg-warn/[0.06]' : 'border-border bg-card'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                    <Clock size={16} aria-hidden className={pendentes.length ? 'text-warn' : 'text-muted-foreground'} />
                    {pendentes.length
                        ? `${pendentes.length} pagamento(s) aguardando aprovação — ${moeda(total)}`
                        : podeAprovar ? 'Nenhum pagamento aguardando aprovação' : 'Seus pedidos de aprovação'}
                </div>
                {decididos.length > 0 && (
                    <button onClick={() => setMostrarDecididos(v => !v)} className="text-xs font-semibold text-primary hover:underline">
                        {mostrarDecididos ? 'Ocultar decididos' : `Ver decididos (${decididos.length})`}
                    </button>
                )}
            </div>
            {erro && <div className="mt-2 text-xs text-destructive">{erro}</div>}

            {pendentes.length > 0 && (
                <div className="mt-3 space-y-2">
                    {pendentes.map(p => (
                        // Descrição (flexível) | valor | ações em colunas fixas: valor e
                        // botões caem na mesma vertical de pedido para pedido.
                        <div key={p.id} className={`grid grid-cols-1 items-start gap-3 rounded-lg border border-border border-l-4 ${FAIXA.amber} bg-card px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_130px_200px]`}>
                            <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold" title={p.descricao}>{p.descricao}</div>
                                <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                    <span>Pedido por {p.solicitante.nome} em {data(p.created_at)}</span>
                                    {p.atividade?.id_site_sharing && <span>Site <span className="font-id">{p.atividade.id_site_sharing}</span></span>}
                                </div>
                            </div>
                            <span className="text-sm font-bold tabular-nums md:text-right">{moeda(p.valor)}</span>
                            <div className="flex items-center gap-2 md:justify-end">
                                {podeAprovar && p.solicitante_id !== sessao?.id ? (
                                    <>
                                        <button onClick={() => decidir(p, 'APROVADA')} className="flex h-8 items-center gap-1 rounded-lg bg-ok px-3 text-xs font-semibold text-background"><Check size={14} aria-hidden /> Aprovar</button>
                                        <button onClick={() => decidir(p, 'RECUSADA')} className="flex h-8 items-center gap-1 rounded-lg border border-crit/40 px-3 text-xs font-semibold text-crit"><X size={14} aria-hidden /> Recusar</button>
                                    </>
                                ) : (
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP.amber}`}>Aguardando</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {mostrarDecididos && (
                <div className="mt-3 space-y-1.5">
                    {decididos.map(p => (
                        <div key={p.id} className={`grid grid-cols-[minmax(0,1fr)_130px_84px] items-start gap-3 rounded-lg border-l-4 ${p.status === 'APROVADA' ? FAIXA.green : FAIXA.rose} bg-secondary/30 px-3 py-2 text-xs`}>
                            <span className="min-w-0">
                                <span className="block truncate font-semibold" title={p.descricao}>{p.descricao}</span>
                                <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                    <span>Pedido por {p.solicitante.nome}</span>
                                    <span>Decidido por {p.decisor?.nome || '—'}{p.decidido_em ? ` em ${data(p.decidido_em)}` : ''}</span>
                                    {p.motivo_decisao && <span>Motivo: "{p.motivo_decisao}"</span>}
                                    {p.status === 'APROVADA' && <span>Agora é só repetir a solicitação.</span>}
                                </span>
                            </span>
                            <span className="text-right font-semibold tabular-nums">{moeda(p.valor)}</span>
                            <span className="text-right"><b className={`rounded-full px-2 py-px text-[11px] ${p.status === 'APROVADA' ? CHIP.green : CHIP.rose}`}>{p.status === 'APROVADA' ? 'Aprovado' : 'Recusado'}</b></span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
