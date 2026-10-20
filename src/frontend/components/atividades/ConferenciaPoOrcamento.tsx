import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { Card } from './ui';
import { fmtMoeda } from './constants';

// PO × orçamento da atividade (19/10/2026) — a regra está em po-conferencia.service:
// referência = negociação aprovada ou orçamento (PV O&M na operação Highline);
// o total é a conferência principal; linha a linha só quando a PO detalha os itens.
const SITUACAO: Record<string, { rotulo: string; classe: string; Icone: typeof CheckCircle2 }> = {
    CONFERE: { rotulo: 'Confere com o orçamento', classe: 'border-ok/40 bg-ok/10 text-ok', Icone: CheckCircle2 },
    ATENCAO: { rotulo: 'Conferir', classe: 'border-warn/40 bg-warn/10 text-warn', Icone: AlertTriangle },
    DIVERGE: { rotulo: 'Diverge do orçamento', classe: 'border-crit/40 bg-crit/10 text-crit', Icone: XCircle },
    SEM_ORCAMENTO: { rotulo: 'Sem orçamento para conferir', classe: 'border-border bg-secondary/40 text-muted-foreground', Icone: Info },
    SEM_PO: { rotulo: 'Sem PO', classe: 'border-border bg-secondary/40 text-muted-foreground', Icone: Info },
};
const LINHA: Record<string, { rotulo: string; classe: string }> = {
    CONFERE: { rotulo: 'Confere', classe: 'text-ok' },
    QUANTIDADE: { rotulo: 'Quantidade diferente', classe: 'text-crit' },
    VALOR: { rotulo: 'Valor diferente', classe: 'text-crit' },
    SEM_CORRESPONDENTE: { rotulo: 'Fora do orçamento', classe: 'text-warn' },
};
const STATUS_ORC: Record<string, string> = { RASCUNHO: 'rascunho', ENVIADO: 'enviado', APROVADO: 'aprovado', REPROVADO: 'reprovado', REVISAO: 'em revisão' };

export default function ConferenciaPoOrcamento({ atividadeId, versao }: { atividadeId: string; versao: number }) {
    const [c, setC] = useState<any>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        fetch(`/api/pos/conferencia-orcamento?atividade_id=${atividadeId}`)
            .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro na conferência'); return j; })
            .then(j => { if (vivo) { setC(j); setErro(''); } })
            .catch(e => vivo && setErro(e.message));
        return () => { vivo = false; };
    }, [atividadeId, versao]);

    if (erro) return <Card title="Conferência PO × orçamento"><div className="text-xs text-crit">{erro}</div></Card>;
    if (!c || c.situacao === 'SEM_PO') return null;
    const s = SITUACAO[c.situacao] || SITUACAO.ATENCAO;
    const dif = c.diferenca;

    return (
        <Card title="Conferência PO × orçamento">
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold ${s.classe}`}>
                <s.Icone size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
                <div>
                    {s.rotulo}
                    <div className="text-xs font-normal text-foreground/80 mt-0.5">{c.resumo}</div>
                </div>
            </div>

            {c.referencia && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                    <Bloco rotulo="Total da(s) PO(s)" valor={fmtMoeda(c.total_po)} />
                    <Bloco rotulo={`Referência · ${c.referencia.nome}`} valor={fmtMoeda(c.referencia.valor)}
                        extra={c.orcamento ? `${c.orcamento.numero || 'orçamento'} · ${STATUS_ORC[c.orcamento.status] || c.orcamento.status}` : undefined} />
                    <Bloco rotulo="Diferença (PO − referência)" valor={dif == null ? '—' : `${dif > 0 ? '+' : ''}${fmtMoeda(dif)}`}
                        extra={c.diferenca_pct != null && dif !== 0 ? `${c.diferenca_pct > 0 ? '+' : ''}${c.diferenca_pct.toLocaleString('pt-BR')}%` : undefined}
                        classe={c.total_confere ? 'text-ok' : 'text-crit'} />
                    <Bloco rotulo="Site" valor={c.sites.confere === null ? '—' : c.sites.confere ? 'Confere' : 'Diferente'}
                        extra={`PO: ${c.sites.po.join(', ') || '—'} · atividade: ${c.sites.atividade.join(', ') || '—'}`}
                        classe={c.sites.confere === false ? 'text-crit' : c.sites.confere ? 'text-ok' : ''} />
                </div>
            )}
            {c.total_ls != null && c.orcamento?.nome === 'PV O&M Highline' && (
                <div className="mt-2 text-[11px] text-muted-foreground">Orçamento LS desta operação: {fmtMoeda(c.total_ls)}</div>
            )}

            {c.avisos?.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-[11px] text-warn">
                    {c.avisos.map((a: string, i: number) => <li key={i} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden />{a}</li>)}
                </ul>
            )}

            {c.referencia && c.modo_linhas === 'TOTAL' && c.linhas.length > 0 && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                    As linhas da PO não detalham os itens do orçamento (ex.: material / serviço) — a conferência é feita pelo valor total.
                </div>
            )}

            {c.modo_linhas === 'ITENS' && (
                <div className="mt-3 border border-border rounded-lg overflow-x-auto">
                    <div className="px-3 py-2 bg-secondary/50 text-[11px] font-semibold">Linhas da PO × itens do orçamento</div>
                    <table className="w-full text-[11px] min-w-[760px]">
                        <thead className="text-muted-foreground">
                            <tr className="text-left border-b border-border">
                                <th className="py-1.5 px-2">Linha PO</th>
                                <th className="py-1.5 px-2">Descrição na PO</th>
                                <th className="py-1.5 px-2">Item do orçamento</th>
                                <th className="py-1.5 px-2 text-right">Quant. PO / orç.</th>
                                <th className="py-1.5 px-2 text-right">Unit. PO / orç.</th>
                                <th className="py-1.5 px-2 text-right">Total PO / orç.</th>
                                <th className="py-1.5 px-2">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {c.linhas.map((l: any, i: number) => {
                                const r = l.referencia, st = LINHA[l.situacao];
                                return (
                                    <tr key={i} className="border-b border-border/40 last:border-0 align-top">
                                        <td className="py-1.5 px-2 font-id">{l.po_numero ? `${l.po_numero} · ` : ''}{l.numero_linha}</td>
                                        <td className="py-1.5 px-2">{l.descricao}</td>
                                        <td className="py-1.5 px-2">{r ? <><span className="font-id">{r.codigo}</span> {r.descricao}</> : <span className="text-muted-foreground">—</span>}</td>
                                        <td className="py-1.5 px-2 text-right">{l.quantidade ?? '—'} / {r ? r.quantidade : '—'}</td>
                                        <td className="py-1.5 px-2 text-right">{l.valor_unitario != null ? fmtMoeda(l.valor_unitario) : '—'} / {r ? fmtMoeda(r.valor_unitario) : '—'}</td>
                                        <td className="py-1.5 px-2 text-right">{fmtMoeda(l.valor_total)} / {r ? fmtMoeda(r.total) : '—'}</td>
                                        <td className={`py-1.5 px-2 font-semibold ${st.classe}`}>
                                            {st.rotulo}
                                            {l.diferenca ? <span className="block font-normal">{l.diferenca > 0 ? '+' : ''}{fmtMoeda(l.diferenca)}</span> : null}
                                        </td>
                                    </tr>
                                );
                            })}
                            {c.sem_po.map((r: any, i: number) => (
                                <tr key={`s${i}`} className="border-b border-border/40 last:border-0 bg-warn/5">
                                    <td className="py-1.5 px-2 text-muted-foreground">—</td>
                                    <td className="py-1.5 px-2 text-muted-foreground">sem linha na PO</td>
                                    <td className="py-1.5 px-2"><span className="font-id">{r.codigo}</span> {r.descricao}</td>
                                    <td className="py-1.5 px-2 text-right">— / {r.quantidade}</td>
                                    <td className="py-1.5 px-2 text-right">— / {fmtMoeda(r.valor_unitario)}</td>
                                    <td className="py-1.5 px-2 text-right">— / {fmtMoeda(r.total)}</td>
                                    <td className="py-1.5 px-2 font-semibold text-warn">Não veio na PO</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function Bloco({ rotulo, valor, extra, classe = '' }: { rotulo: string; valor: string; extra?: string; classe?: string }) {
    return (
        <div className="bg-background/60 border border-border/60 rounded px-2.5 py-2">
            <div className="text-[11px] text-muted-foreground">{rotulo}</div>
            <div className={`text-sm font-bold mt-0.5 ${classe}`}>{valor}</div>
            {extra && <div className="text-[11px] text-muted-foreground mt-0.5">{extra}</div>}
        </div>
    );
}
