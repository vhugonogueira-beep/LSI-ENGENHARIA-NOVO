import { useState, useEffect, useCallback } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, EmptyState, Row } from './ui';
import { fmtMoeda, fmtData, TIPOS_ORCAMENTO, TIPO_ORCAMENTO_LABEL, exigeEscolhaTipoOrcamento } from './constants';
import HighlineBudgetEditor from './HighlineBudgetEditor';
import OrcamentoLsEditor from './OrcamentoLsEditor';
import { authFetch } from '../../lib/authFetch';

// Blueprint LSI, seção 02: tanto "Implantação" quanto "Operação com Aprovação" passam
// pelo Orçamento/Negociação completos — só "Execução Direta" (sem aprovação prévia)
// não mostra esta aba (ver AtividadeCockpit.buildTabs). Não há mais uma versão
// "simplificada" aqui — os dois modelos que chegam nesta tela usam o mesmo fluxo.

interface Negociacao {
    id: string;
    status: string;
    valor_original: number;
    valor_final?: number | null;
    margem_minima_aceitavel?: number | null;
    contrapropostas: Contraproposta[];
}
interface Contraproposta {
    id: string;
    rodada: number;
    origem: string;
    valor_proposto: number;
    valor_referencia: number;
    diferenca: number;
    percentual_variacao: number;
    margem_projetada_pos?: number | null;
    decisao: string;
    observacao?: string | null;
}

export default function TabComercial({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [budgets, setBudgets] = useState<any[]>([]);
    const [budgetEscolhido, setBudgetEscolhido] = useState('');
    const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const [rodadaForm, setRodadaForm] = useState({ origem: 'CLIENTE', valor_proposto: '', custo_previsto: '', observacao: '' });
    const [tipoOrcamentoNovo, setTipoOrcamentoNovo] = useState('PV_HIGHLINE');
    const [mostrarVincular, setMostrarVincular] = useState(false);
    const [contratantes, setContratantes] = useState<{ id: string; nome: string }[]>([]);
    const [contratanteEscolhido, setContratanteEscolhido] = useState('');
    // LPU de preço ao cliente escolhida por área + cliente (lpu-atividade.service).
    const [lpuCliente, setLpuCliente] = useState<{ id: string; nome: string; motivo: string } | null>(null);

    const orcamentoAtivo = atividade.orcamentos && atividade.orcamentos.length > 0 ? atividade.orcamentos[0] : null;
    const precisaEscolherTipo = exigeEscolhaTipoOrcamento(atividade);
    const faltaContratante = !atividade.contratante_id;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [negR, budR, lpuR] = await Promise.all([
                fetch(`/api/negociacoes?atividade_id=${atividade.id}`),
                fetch('/api/budgets'),
                fetch(`/api/atividades/${atividade.id}/lpus`),
            ]);
            setLpuCliente(lpuR.ok ? (await lpuR.json()).precoCliente : null);
            setNegociacoes(negR.ok ? await negR.json() : []);
            setBudgets(budR.ok ? await budR.json() : []);
            if (!atividade.contratante_id) {
                const cR = await fetch('/api/contratantes');
                setContratantes(cR.ok ? await cR.json() : []);
            }
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    async function vincularOrcamento() {
        if (!budgetEscolhido) return;
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/budgets/${budgetEscolhido}/header`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ atividade_id: atividade.id }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao vincular orçamento');
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    // Vincula o contratante sem sair da aba — é o único dado que falta para o orçamento.
    async function vincularContratante() {
        if (!contratanteEscolhido) return;
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/atividades/${atividade.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contratante_id: contratanteEscolhido }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao vincular o contratante');
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function criarOrcamento() {
        if (faltaContratante) {
            setErro('Preencha o Contratante na aba Identificação antes de criar o orçamento.');
            return;
        }
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenant_id: atividade.tenant_id,
                    contratante_id: atividade.contratante_id,
                    atividade_id: atividade.id,
                    assunto: atividade.titulo,
                    tipo_orcamento: precisaEscolherTipo ? tipoOrcamentoNovo : 'COTACAO_INTERNA',
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao criar orçamento');
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function abrirNegociacao() {
        if (!orcamentoAtivo) return;
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch('/api/negociacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budget_id: orcamentoAtivo.id, atividade_id: atividade.id }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao abrir negociação');
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function registrarRodada(negociacaoId: string) {
        if (!rodadaForm.valor_proposto) return;
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/negociacoes/${negociacaoId}/contrapropostas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origem: rodadaForm.origem,
                    valor_proposto: parseFloat(rodadaForm.valor_proposto),
                    custo_previsto: rodadaForm.custo_previsto ? parseFloat(rodadaForm.custo_previsto) : undefined,
                    observacao: rodadaForm.observacao || undefined,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao registrar rodada');
            setRodadaForm({ origem: 'CLIENTE', valor_proposto: '', custo_previsto: '', observacao: '' });
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    async function decidir(negociacaoId: string, rodadaId: string, decisao: string) {
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/negociacoes/${negociacaoId}/contrapropostas/${rodadaId}/decisao`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decisao }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao decidir');
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    const negociacaoAberta = negociacoes.find(n => n.status === 'ABERTA');
    const historico = negociacoes.filter(n => n.status !== 'ABERTA');
    const ultimaProposta = negociacaoAberta?.contrapropostas
        ?.reduce<Contraproposta | undefined>((latest, proposal) => (
            !latest || proposal.rodada > latest.rodada ? proposal : latest
        ), undefined);
    const valorUltimaProposta = Number(ultimaProposta?.valor_proposto || 0);
    const valorContrato = Number(atividade.valor_contrato || 0);
    const targetValue = valorUltimaProposta > 0
        ? valorUltimaProposta
        : valorContrato > 0 ? valorContrato : undefined;
    const targetLabel = valorUltimaProposta > 0
        ? 'Última proposta'
        : valorContrato > 0 ? 'Valor do contrato' : undefined;

    return (
        <div>
            <ErrorBanner message={erro} />

            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${lpuCliente ? 'border-primary/30 bg-primary/[0.05]' : 'border-warn/40 bg-warn/[0.07]'}`}>
                <div className="text-xs font-semibold text-muted-foreground">LPU aplicada (preço ao cliente)</div>
                {lpuCliente ? (
                    <>
                        <div className="mt-0.5 font-semibold">{lpuCliente.nome}</div>
                        <div className="text-xs text-muted-foreground">Escolhida automaticamente: {lpuCliente.motivo}. Para mudar, ajuste a área e o cliente da base em Bases e LPUs.</div>
                    </>
                ) : (
                    <div className="mt-0.5 text-xs text-warn">Nenhuma LPU de cliente cadastrada para esta área — cadastre ou classifique uma em Bases e LPUs.</div>
                )}
            </div>

            <Card title="Orçamento">
                {orcamentoAtivo ? (
                    <>
                        <Row label="Assunto" value={orcamentoAtivo.assunto || '—'} />
                        <Row label="Tipo" value={TIPO_ORCAMENTO_LABEL[orcamentoAtivo.tipo_orcamento || 'COTACAO_INTERNA']} />
                        <Row label="Status" value={orcamentoAtivo.status} />
                        <Row label="Versão atual" value={orcamentoAtivo.versao_atual} />
                        <Row label="Criado em" value={fmtData(orcamentoAtivo.created_at)} />
                    </>
                ) : (
                    <div>
                        {faltaContratante && (
                            <div className="mb-3 p-3 rounded-lg border border-warn/40 bg-warn/10">
                                <p className="text-xs text-warn mb-2">
                                    Esta atividade ainda não tem Contratante — escolha aqui mesmo para liberar a criação do orçamento.
                                </p>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1 max-w-xs">
                                        <Field label="Contratante">
                                            <select className={inputClass} value={contratanteEscolhido} onChange={e => setContratanteEscolhido(e.target.value)}>
                                                <option value="">Selecione...</option>
                                                {contratantes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                    <GhostButton onClick={vincularContratante} disabled={!contratanteEscolhido || salvando}>
                                        Vincular
                                    </GhostButton>
                                </div>
                            </div>
                        )}
                        <div className="bg-secondary/40 border border-border rounded-lg p-4">
                            {precisaEscolherTipo && (
                                <div className="mb-3">
                                    <Field label="Tipo de orçamento (Implantação Highline)">
                                        <select className={inputClass} value={tipoOrcamentoNovo} onChange={e => setTipoOrcamentoNovo(e.target.value)}>
                                            {TIPOS_ORCAMENTO.map(t => <option key={t} value={t}>{TIPO_ORCAMENTO_LABEL[t]}</option>)}
                                        </select>
                                    </Field>
                                </div>
                            )}
                            <PrimaryButton onClick={criarOrcamento} disabled={salvando || faltaContratante}><Plus size={14} className="inline mr-1" aria-hidden />Criar orçamento</PrimaryButton>
                        </div>

                        {!mostrarVincular ? (
                            <button type="button" onClick={() => setMostrarVincular(true)} className="text-xs text-muted-foreground hover:text-foreground mt-3">
                                Ou vincular um orçamento já existente
                            </button>
                        ) : (
                            <div className="flex gap-2 mt-3">
                                <select aria-label="Orçamento existente" className={`${inputClass} max-w-xs`} value={budgetEscolhido} onChange={e => setBudgetEscolhido(e.target.value)}>
                                    <option value="">Selecione um orçamento...</option>
                                    {budgets.map(b => <option key={b.id} value={b.id}>{b.assunto || b.id.substring(0, 8)} — {b.status}</option>)}
                                </select>
                                <GhostButton onClick={vincularOrcamento} disabled={!budgetEscolhido || salvando}>Vincular</GhostButton>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {orcamentoAtivo && atividade.sharing.toUpperCase() === 'HIGHLINE' && atividade.tipo_demanda === 'IMPLANTACAO' && (() => {
                // Seguir com a PV Highline ou com o Orçamento LS (08/10/2026). Trocável em rascunho.
                const modoLs = orcamentoAtivo.tipo_orcamento === 'ORCAMENTO_LS';
                const editavel = orcamentoAtivo.status === 'RASCUNHO';
                async function trocar(modelo: 'PV_HIGHLINE' | 'ORCAMENTO_LS') {
                    if (!orcamentoAtivo || orcamentoAtivo.tipo_orcamento === modelo) return;
                    setErro('');
                    const r = await authFetch(`/api/budgets/${orcamentoAtivo.id}/modelo`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelo }),
                    });
                    if (!r.ok) { setErro((await r.json()).error || 'Erro ao trocar o modelo'); return; }
                    onRefresh();
                }
                const opcao = (modelo: 'PV_HIGHLINE' | 'ORCAMENTO_LS', titulo: string, texto: string) => {
                    const ativo = modelo === 'ORCAMENTO_LS' ? modoLs : !modoLs;
                    return (
                        <button type="button" aria-pressed={ativo} disabled={!editavel && !ativo} onClick={() => trocar(modelo)}
                            className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${ativo ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30 hover:border-primary/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
                            <div className={`text-sm font-bold ${ativo ? 'text-primary' : ''}`}>{titulo}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{texto}</div>
                        </button>
                    );
                };
                return (
                    <>
                        <div className="mb-4 rounded-xl border border-border bg-card p-4">
                            <p className="mb-2 text-xs font-semibold text-muted-foreground">Seguir com</p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {opcao('PV_HIGHLINE', 'PV Highline', 'Planilha oficial do cliente, montada pelo catálogo da PV')}
                                {opcao('ORCAMENTO_LS', 'Orçamento LS', 'Modelo da LS: importe um orçamento pronto (Excel ou PDF) ou monte os itens')}
                            </div>
                            {!editavel && <p className="mt-2 text-xs text-muted-foreground">O orçamento já saiu do rascunho ({orcamentoAtivo.status}); o modelo não pode mais ser trocado.</p>}
                        </div>
                        {modoLs
                            ? <OrcamentoLsEditor budgetId={orcamentoAtivo.id} editavel={editavel} onMudou={onRefresh} />
                            : <HighlineBudgetEditor budgetId={orcamentoAtivo.id} targetValue={targetValue} targetLabel={targetLabel} />}
                    </>
                );
            })()}

            {orcamentoAtivo && (
                <Card title="Negociação">
                    {!negociacaoAberta && (
                        <EmptyState
                            text="Nenhuma negociação aberta para o orçamento vinculado."
                            action={<PrimaryButton onClick={abrirNegociacao} disabled={salvando}>Abrir negociação</PrimaryButton>}
                        />
                    )}

                    {negociacaoAberta && (
                        <div>
                            <div className="flex gap-6 mb-4 text-sm">
                                <div><span className="text-muted-foreground">Valor original: </span><strong>{fmtMoeda(negociacaoAberta.valor_original)}</strong></div>
                                {negociacaoAberta.margem_minima_aceitavel != null && (
                                    <div><span className="text-muted-foreground">Margem mínima: </span><strong>{negociacaoAberta.margem_minima_aceitavel}%</strong></div>
                                )}
                            </div>

                            <div className="flex flex-col gap-2 mb-4">
                                {negociacaoAberta.contrapropostas.map(c => (
                                    <div key={c.id} className="bg-secondary/40 border border-border rounded-lg p-3">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-sm font-semibold">Rodada {c.rodada} — {c.origem === 'CLIENTE' ? 'Cliente' : 'LS Office'}</div>
                                            <DecisaoBadge decisao={c.decisao} />
                                        </div>
                                        <div className="text-sm mb-1">{fmtMoeda(c.valor_proposto)} <span className="text-xs text-muted-foreground">({c.diferenca >= 0 ? '+' : ''}{c.percentual_variacao}% vs. anterior)</span></div>
                                        {c.margem_projetada_pos != null && <div className="text-xs text-muted-foreground">Margem projetada se aceita: {c.margem_projetada_pos}%</div>}
                                        {c.observacao && <div className="text-xs text-muted-foreground mt-1">{c.observacao}</div>}
                                        {c.decisao === 'PENDENTE' && (
                                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                                <GhostButton onClick={() => decidir(negociacaoAberta.id, c.id, 'ACEITA')} disabled={salvando}><Check size={14} className="inline mr-1" aria-hidden />Aceitar</GhostButton>
                                                <GhostButton onClick={() => decidir(negociacaoAberta.id, c.id, 'RECUSADA')} disabled={salvando}><X size={14} className="inline mr-1" aria-hidden />Recusar</GhostButton>
                                                <GhostButton onClick={() => decidir(negociacaoAberta.id, c.id, 'ANALISE_INTERNA')} disabled={salvando}>Análise interna</GhostButton>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-border pt-4">
                                <div className="text-xs font-semibold text-muted-foreground mb-2">Registrar nova rodada</div>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <Field label="Origem">
                                        <select className={inputClass} value={rodadaForm.origem} onChange={e => setRodadaForm(f => ({ ...f, origem: e.target.value }))}>
                                            <option value="CLIENTE">Cliente</option>
                                            <option value="LS_OFFICE">LS Office</option>
                                        </select>
                                    </Field>
                                    <Field label="Valor proposto (R$)">
                                        <input type="number" step="0.01" className={inputClass} value={rodadaForm.valor_proposto} onChange={e => setRodadaForm(f => ({ ...f, valor_proposto: e.target.value }))} />
                                    </Field>
                                    <Field label="Custo previsto (R$, opcional)">
                                        <input type="number" step="0.01" className={inputClass} value={rodadaForm.custo_previsto} onChange={e => setRodadaForm(f => ({ ...f, custo_previsto: e.target.value }))} />
                                    </Field>
                                    <Field label="Observação">
                                        <input className={inputClass} value={rodadaForm.observacao} onChange={e => setRodadaForm(f => ({ ...f, observacao: e.target.value }))} />
                                    </Field>
                                </div>
                                <PrimaryButton onClick={() => registrarRodada(negociacaoAberta.id)} disabled={salvando || !rodadaForm.valor_proposto}>Registrar rodada</PrimaryButton>
                            </div>
                        </div>
                    )}

                    {historico.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-border">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Negociações anteriores</div>
                            {historico.map(n => (
                                <Row key={n.id} label={`${fmtMoeda(n.valor_original)} para ${n.valor_final != null ? fmtMoeda(n.valor_final) : '—'}`} value={n.status} />
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}

function DecisaoBadge({ decisao }: { decisao: string }) {
    const tomMap: Record<string, string> = {
        PENDENTE: 'bg-muted text-muted-foreground', ACEITA: 'bg-ok/15 text-ok', RECUSADA: 'bg-crit/15 text-crit',
        NOVA_CONTRAPROPOSTA: 'bg-warn/15 text-warn', ANALISE_INTERNA: 'bg-primary/15 text-primary',
    };
    const rotulo = decisao.replace(/_/g, ' ').toLowerCase();
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tomMap[decisao] || tomMap.PENDENTE}`}>{rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}</span>;
}
