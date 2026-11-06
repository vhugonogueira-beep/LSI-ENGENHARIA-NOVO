import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, FileText, Receipt, RefreshCw } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, EmptyState } from './ui';
import { fmtMoeda } from './constants';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

// Custo real (04/11/2026): visão consolidada de tudo o que foi gasto na atividade —
// pagamentos a fornecedores, reembolsos, adiantamentos e rateios — com a leitura
// por IA dos comprovantes e NFs anexados, conferida contra o valor lançado.

const ORIGEM: Record<string, string> = {
    FORNECEDOR: 'Pagamento a fornecedor',
    REEMBOLSO: 'Reembolso / adiantamento',
    RATEIO_PROJETO: 'Rateio de projeto',
    MAO_DE_OBRA_PROPRIA: 'Mão de obra própria (rateio)',
    PRESTACAO_CONTAS: 'Prestação de contas',
};
const emFrase = (v: string) => { const t = String(v || '').replace(/_/g, ' ').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };
const fmtDia = (v?: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';

function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: string }) {
    return (
        <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
            <div className="text-xs text-muted-foreground">{rotulo}</div>
            <div className={`mt-0.5 text-xl font-bold tabular-nums ${tom || 'text-foreground'}`}>{valor}</div>
            {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
    );
}

function Barras({ titulo, itens, total, rotulo }: { titulo: string; itens: { chave: string; valor: number; quantidade: number }[]; total: number; rotulo?: (k: string) => string }) {
    return (
        <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground">{titulo}</div>
            {itens.length === 0 ? <div className="text-xs text-muted-foreground">Nada gasto ainda.</div> : (
                <div className="flex flex-col gap-2.5">
                    {itens.slice(0, 8).map(i => {
                        const pct = total > 0 ? (i.valor / total) * 100 : 0;
                        return (
                            <div key={i.chave} className="text-xs">
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <span className="truncate" title={rotulo ? rotulo(i.chave) : i.chave}>{rotulo ? rotulo(i.chave) : i.chave}</span>
                                    <span className="shrink-0 tabular-nums"><span className="text-muted-foreground">{pct.toFixed(0)}% · </span><strong>{fmtMoeda(i.valor)}</strong></span>
                                </div>
                                <div className="h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} /></div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function TabCustoReal({ atividade }: { atividade: AtividadeDetalhe }) {
    const [dados, setDados] = useState<any | null>(null);
    const [erro, setErro] = useState('');
    const [lendo, setLendo] = useState(false);
    const [aviso, setAviso] = useState('');
    const [aberto, setAberto] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'TODOS' | 'PENDENCIAS'>('TODOS');

    const carregar = useCallback(async () => {
        setErro('');
        try {
            const r = await authFetch(`/api/atividades/${atividade.id}/custo-real`);
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'Erro ao carregar o custo real');
            setDados(j);
        } catch (e: any) { setErro(e.message); }
    }, [atividade.id]);

    useEffect(() => { carregar(); }, [carregar]);

    async function lerDocumentos(forcar = false) {
        setLendo(true); setErro(''); setAviso('');
        try {
            let restantes = 0, lidos = 0, erros = 0;
            // Lê em lotes até acabar (o servidor processa até 15 por chamada).
            do {
                const r = await authFetch(`/api/atividades/${atividade.id}/custo-real/ler`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forcar }),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || 'Erro na leitura dos documentos');
                lidos += j.lidos; erros += j.erros; restantes = j.restantes;
                forcar = false; // depois do primeiro lote, só os que faltam
                if (j.processados === 0) break;
            } while (restantes > 0);
            setAviso(`${lidos} documento(s) lido(s)${erros ? `, ${erros} sem leitura` : ''}.`);
            await carregar();
        } catch (e: any) { setErro(e.message); } finally { setLendo(false); }
    }

    async function lerUm(anexoId: string) {
        setErro('');
        const r = await authFetch(`/api/atividades/custo-real/anexos/${anexoId}/ler`, { method: 'POST' });
        if (!r.ok) { setErro((await r.json().catch(() => ({}))).error || 'Erro na leitura'); return; }
        await carregar();
    }

    if (!dados) {
        return <Card title="Custo real">{erro ? <div className="text-sm text-crit">{erro}</div> : <div className="py-10 text-center text-muted-foreground">Carregando…</div>}</Card>;
    }

    const { resumo, conferencia } = dados;
    const lancamentos: any[] = dados.lancamentos.filter((l: any) => filtro === 'TODOS'
        || (l.origem === 'FORNECEDOR' && l.pago && (!l.tem_comprovante || !l.tem_nf)) || l.divergencia != null
        || l.documentos.some((d: any) => !d.leitura || d.leitura.status !== 'LIDO'));
    const pendencias = conferencia.pagos_sem_comprovante + conferencia.pagos_sem_nf + conferencia.divergencias + conferencia.documentos_nao_lidos + conferencia.documentos_com_erro;

    return (
        <div className="flex flex-col gap-5">
            <Card title="Custo real — tudo o que foi gasto nesta atividade"
                action={
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={carregar} title="Atualizar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-secondary/60"><RefreshCw size={14} aria-hidden /></button>
                        <button type="button" onClick={() => lerDocumentos(false)} disabled={lendo || !dados.ia_disponivel || conferencia.documentos === 0}
                            title={!dados.ia_disponivel ? 'Leitura por IA indisponível: falta a chave da API no servidor' : 'Lê com IA os comprovantes e NFs ainda não lidos'}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            <FileSearch size={14} aria-hidden /> {lendo ? 'Lendo documentos…' : `Ler comprovantes e NFs${conferencia.documentos_nao_lidos ? ` (${conferencia.documentos_nao_lidos})` : ''}`}
                        </button>
                    </div>
                }>
                {erro && <div role="alert" className="mb-3 rounded-lg border border-crit/40 bg-crit/10 p-2.5 text-xs text-crit">{erro}</div>}
                {aviso && <div className="mb-3 rounded-lg border border-ok/40 bg-ok/10 p-2.5 text-xs text-ok">{aviso}</div>}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Kpi rotulo="Custo real (gasto)" valor={fmtMoeda(resumo.realizado)} tom="text-primary"
                        sub={`Fornecedores ${fmtMoeda(resumo.pago_fornecedores)} · despesas ${fmtMoeda(resumo.despesas_comprovadas)}`} />
                    <Kpi rotulo="Contratado com fornecedores" valor={fmtMoeda(resumo.contratado)} sub="valor dos contratos ativos" />
                    <Kpi rotulo="Ainda a pagar" valor={fmtMoeda(resumo.compromissos_a_pagar + resumo.a_reembolsar)} tom={resumo.compromissos_a_pagar + resumo.a_reembolsar > 0 ? 'text-warn' : undefined}
                        sub={`Parcelas ${fmtMoeda(resumo.compromissos_a_pagar)} · reembolsos ${fmtMoeda(resumo.a_reembolsar)}`} />
                    <Kpi rotulo="Adiantado a comprovar" valor={fmtMoeda(resumo.adiantado_a_comprovar)} tom={resumo.adiantado_a_comprovar > 0 ? 'text-warn' : undefined} sub="adiantamento sem despesa lançada" />
                    <Kpi rotulo="Receita da atividade" valor={resumo.receita != null ? fmtMoeda(resumo.receita) : '—'} sub="valor do contrato ou orçado" />
                    <Kpi rotulo="Margem sobre o gasto" valor={resumo.margem_realizada != null ? fmtMoeda(resumo.margem_realizada) : '—'}
                        tom={resumo.margem_realizada == null ? undefined : resumo.margem_realizada >= 0 ? 'text-ok' : 'text-crit'}
                        sub={resumo.receita ? `${((resumo.margem_realizada / resumo.receita) * 100).toFixed(1)}% da receita` : 'sem receita informada'} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <Barras titulo="Por categoria" itens={dados.por_categoria} total={resumo.realizado} rotulo={emFrase} />
                    <Barras titulo="Por favorecido" itens={dados.por_favorecido} total={resumo.realizado} />
                    <Barras titulo="Por origem" itens={dados.por_origem} total={resumo.realizado} rotulo={k => ORIGEM[k] || k} />
                </div>

                {/* Conferência documental: o que falta para o custo estar comprovado. */}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    {[
                        [conferencia.pagos_sem_comprovante, 'pago(s) sem comprovante', 'crit'],
                        [conferencia.pagos_sem_nf, 'pago(s) sem NF', 'warn'],
                        [conferencia.divergencias, 'divergência(s) de valor', 'crit'],
                        [conferencia.documentos_nao_lidos, 'documento(s) não lido(s)', 'warn'],
                        [conferencia.documentos_com_erro, 'documento(s) sem leitura', 'warn'],
                    ].filter(([n]) => (n as number) > 0).map(([n, texto, tom]) => (
                        <span key={texto as string} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${tom === 'crit' ? 'border-crit/40 bg-crit/10 text-crit' : 'border-warn/40 bg-warn/10 text-warn'}`}>
                            <AlertTriangle size={12} aria-hidden /> {n as number} {texto as string}
                        </span>
                    ))}
                    {pendencias === 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ok/40 bg-ok/10 px-2.5 py-1 font-semibold text-ok">
                            <CheckCircle2 size={12} aria-hidden /> Todo o gasto está comprovado e conferido
                        </span>
                    )}
                    <span className="text-muted-foreground">{conferencia.documentos_lidos} de {conferencia.documentos} documento(s) lido(s) pela IA</span>
                </div>
            </Card>

            <Card title={`Lançamentos (${dados.lancamentos.length})`}
                action={
                    <div className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background/50 p-1" role="group" aria-label="Filtro dos lançamentos">
                        {([['TODOS', 'Todos'], ['PENDENCIAS', 'Com pendência']] as const).map(([v, r]) => (
                            <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v}
                                className={`h-6 rounded-md px-3 text-[11px] font-semibold ${filtro === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
                        ))}
                    </div>
                }>
                {lancamentos.length === 0 ? <EmptyState text={filtro === 'TODOS' ? 'Nenhum pagamento ou despesa nesta atividade ainda.' : 'Nenhuma pendência.'} /> : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[980px] text-xs">
                            <thead className="bg-primary text-primary-foreground">
                                <tr className="text-left font-semibold">
                                    <th className="px-3 py-2">Data</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Favorecido</th>
                                    <th className="px-3 py-2">Categoria / descrição</th><th className="px-3 py-2 text-right">Valor</th>
                                    <th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-center">Comprovante</th><th className="px-3 py-2 text-center">NF</th>
                                    <th className="px-3 py-2 text-right">Lido pela IA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lancamentos.map((l: any) => (
                                    <Fragment key={l.id}>
                                        <tr onClick={() => setAberto(aberto === l.id ? null : l.id)}
                                            className={`cursor-pointer border-b border-border/50 hover:bg-secondary/40 ${!l.pago ? 'opacity-70' : ''}`}>
                                            <td className="px-3 py-2 tabular-nums">{fmtDia(l.data)}</td>
                                            <td className="px-3 py-2"><div>{ORIGEM[l.origem]}</div><div className="text-[11px] text-muted-foreground">{l.referencia}</div></td>
                                            <td className="max-w-[180px] truncate px-3 py-2 font-medium" title={l.favorecido}>{l.favorecido}</td>
                                            <td className="max-w-[260px] px-3 py-2"><div>{emFrase(l.categoria)}</div>{l.descricao && <div className="truncate text-[11px] text-muted-foreground" title={l.descricao}>{l.descricao}</div>}</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoeda(l.valor)}</td>
                                            <td className="px-3 py-2"><span className={l.pago ? 'font-semibold text-ok' : 'text-warn'}>{l.pago ? 'Pago' : 'A pagar'}</span><div className="text-[11px] text-muted-foreground">{emFrase(l.status)}{l.forma_pagamento ? ` · ${l.forma_pagamento}` : ''}</div></td>
                                            <td className="px-3 py-2 text-center">{l.tem_comprovante ? <CheckCircle2 size={14} className="mx-auto text-ok" aria-label="Com comprovante" /> : l.pago ? <AlertTriangle size={14} className="mx-auto text-crit" aria-label="Sem comprovante" /> : '—'}</td>
                                            <td className="px-3 py-2 text-center">{l.tem_nf ? <CheckCircle2 size={14} className="mx-auto text-ok" aria-label="Com NF" /> : l.origem === 'FORNECEDOR' && l.pago ? <AlertTriangle size={14} className="mx-auto text-warn" aria-label="Sem NF" /> : '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {l.valor_lido != null ? (
                                                    <span className={l.divergencia != null ? 'font-semibold text-crit' : 'text-ok'} title={l.divergencia != null ? `Diferença de ${fmtMoeda(l.divergencia)} para o lançado` : 'Confere com o lançado'}>
                                                        {fmtMoeda(l.valor_lido)}{l.divergencia != null && ` (${l.divergencia > 0 ? '+' : ''}${fmtMoeda(l.divergencia)})`}
                                                    </span>
                                                ) : <span className="text-muted-foreground">{l.documentos.length ? 'não lido' : '—'}</span>}
                                            </td>
                                        </tr>
                                        {aberto === l.id && (
                                            <tr className="border-b border-border/50 bg-secondary/20">
                                                <td colSpan={9} className="px-4 py-3">
                                                    {l.documentos.length === 0 ? (
                                                        <div className="text-xs text-muted-foreground">Nenhum comprovante ou NF anexado a este lançamento. Anexe na aba Pagamentos.</div>
                                                    ) : (
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            {l.documentos.map((d: any) => (
                                                                <div key={d.id} className="rounded-lg border border-border bg-card p-3 text-xs">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <button type="button" onClick={() => downloadAuthenticatedFile(`/api/payment-attachments/${d.id}/download`, d.nome)}
                                                                            className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-primary hover:underline">
                                                                            {d.tipo === 'DOCUMENTO_FISCAL' ? <FileText size={13} aria-hidden /> : <Receipt size={13} aria-hidden />}
                                                                            <span className="truncate">{d.nome}</span>
                                                                        </button>
                                                                        {dados.ia_disponivel && (
                                                                            <button type="button" onClick={() => lerUm(d.id)} className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
                                                                                {d.leitura ? 'Reler' : 'Ler'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="mt-0.5 text-[11px] text-muted-foreground">{d.tipo === 'DOCUMENTO_FISCAL' ? 'Documento fiscal' : d.tipo === 'COMPROVANTE_PAGAMENTO' ? 'Comprovante de pagamento' : 'Outro documento'}</div>
                                                                    {d.leitura ? (
                                                                        d.leitura.status === 'LIDO' ? (
                                                                            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                                                                <dt className="text-muted-foreground">Tipo</dt><dd>{emFrase(d.leitura.tipo_documento || '—')}</dd>
                                                                                <dt className="text-muted-foreground">Valor</dt><dd className="font-semibold">{d.leitura.valor != null ? fmtMoeda(d.leitura.valor) : '—'}</dd>
                                                                                <dt className="text-muted-foreground">Data</dt><dd>{fmtDia(d.leitura.data_documento)}</dd>
                                                                                <dt className="text-muted-foreground">Número</dt><dd className="font-id">{d.leitura.numero || '—'}</dd>
                                                                                <dt className="text-muted-foreground">Emitente / recebedor</dt><dd>{d.leitura.emitente || '—'}{d.leitura.emitente_documento ? ` · ${d.leitura.emitente_documento}` : ''}</dd>
                                                                                {d.leitura.descricao && <><dt className="text-muted-foreground">Descrição</dt><dd>{d.leitura.descricao}</dd></>}
                                                                                {d.leitura.observacao && <><dt className="text-warn">Ressalva</dt><dd className="text-warn">{d.leitura.observacao}</dd></>}
                                                                            </dl>
                                                                        ) : <div className="mt-2 text-warn">{d.leitura.observacao || 'Não foi possível ler'}</div>
                                                                    ) : <div className="mt-2 text-muted-foreground">Ainda não lido.</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
