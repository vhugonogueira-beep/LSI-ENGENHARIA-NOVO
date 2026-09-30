import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { usePermissao, useSessao } from '../../lib/permissoes';

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
        <div className={`rounded-xl border p-4 ${pendentes.length ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-border bg-card'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                    <Clock size={16} className={pendentes.length ? 'text-amber-500' : 'text-muted-foreground'} />
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
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold">{p.descricao}</div>
                                <div className="text-[11px] text-muted-foreground">
                                    Pedido por {p.solicitante.nome} em {data(p.created_at)}
                                    {p.atividade?.id_site_sharing ? ` · site ${p.atividade.id_site_sharing}` : ''}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{moeda(p.valor)}</span>
                                {podeAprovar && p.solicitante_id !== sessao?.id ? (
                                    <>
                                        <button onClick={() => decidir(p, 'APROVADA')} className="flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"><Check size={14} /> Aprovar</button>
                                        <button onClick={() => decidir(p, 'RECUSADA')} className="flex h-8 items-center gap-1 rounded-lg border border-red-500/40 px-3 text-xs font-bold text-red-500"><X size={14} /> Recusar</button>
                                    </>
                                ) : (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">AGUARDANDO</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {mostrarDecididos && (
                <div className="mt-3 space-y-1.5">
                    {decididos.map(p => (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-[12px]">
                            <span className="min-w-0">
                                <b className={p.status === 'APROVADA' ? 'text-emerald-500' : 'text-red-500'}>{p.status === 'APROVADA' ? 'Aprovado' : 'Recusado'}</b>
                                {' · '}{p.descricao} · {moeda(p.valor)}
                                <span className="block text-[11px] text-muted-foreground">
                                    {p.solicitante.nome} → {p.decisor?.nome || '—'}{p.decidido_em ? ` em ${data(p.decidido_em)}` : ''}
                                    {p.motivo_decisao ? ` — "${p.motivo_decisao}"` : ''}
                                    {p.status === 'APROVADA' ? ' · agora é só repetir a solicitação' : ''}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
