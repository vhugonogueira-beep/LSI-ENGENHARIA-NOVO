import { Fragment, useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react';
import {
    STATUS_COMERCIAL, STATUS_DOCUMENTAL, STATUS_FINANCEIRO, STATUS_FATURAMENTO,
    StatusPill,
} from './constants';
import StatusOperacionalControl from './StatusOperacionalControl';
import TabIdentificacao from './TabIdentificacao';
import TabComercial from './TabComercial';
import TabCotacaoLs from './TabCotacaoLs';
import TabPlanejamento from './TabPlanejamento';
import TabExecucao from './TabExecucao';
import TabDocumentacao from './TabDocumentacao';
import TabFornecedores from './TabFornecedores';
import TabFaturamento from './TabFaturamento';
import TabResultado from './TabResultado';

interface Pendencia { nivel: 'ALERTA' | 'AVISO'; mensagem: string }
type PendenciasPorAba = Record<string, Pendencia[]>;

/**
 * O que falta nesta aba. ALERTA é pendência de preenchimento e conta no selo;
 * AVISO é contexto (ex.: qual pagamento está sem comprovante) e só aparece aqui.
 */
function PainelPendencias({ itens }: { itens: Pendencia[] }) {
    const [aberto, setAberto] = useState(false);
    if (!itens.length) return null;
    const alertas = itens.filter(i => i.nivel === 'ALERTA');
    const avisos = itens.filter(i => i.nivel === 'AVISO');
    const visiveis = aberto ? avisos : avisos.slice(0, 4);
    const temAlerta = alertas.length > 0;
    return (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${temAlerta ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-border bg-secondary/30'}`}>
            <div className={`flex items-center gap-2 font-semibold ${temAlerta ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {temAlerta ? <AlertTriangle size={16} /> : <Info size={16} />}
                {temAlerta
                    ? `${alertas.length} ${alertas.length === 1 ? 'item pendente' : 'itens pendentes'} nesta aba`
                    : 'Observações desta aba'}
            </div>
            {alertas.length > 0 && (
                <ul className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                    {alertas.map((a, i) => (
                        <li key={i} className="flex gap-2 text-foreground"><span className="text-amber-500">•</span>{a.mensagem}</li>
                    ))}
                </ul>
            )}
            {avisos.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {visiveis.map((a, i) => <li key={i}>– {a.mensagem}</li>)}
                    {avisos.length > 4 && (
                        <li>
                            <button onClick={() => setAberto(v => !v)} className="font-semibold text-primary hover:underline">
                                {aberto ? 'Mostrar menos' : `Ver mais ${avisos.length - 4}`}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

export interface AtividadeDetalhe {
    id: string;
    codigo: string;
    titulo: string;
    tipo_demanda: string;
    subtipo_demanda?: string | null;
    tipo_obra?: string | null;
    tipo_site_highline?: string | null;
    tipo_atividade?: string | null;
    modelo_operacao: string;
    sharing: string;
    operadora?: string | null;
    contratante_id?: string | null;
    contratante?: { id: string; nome: string } | null;
    contrato?: string | null;
    id_site_sharing?: string | null;
    id_site_operadora?: string | null;
    estado?: string | null;
    municipio?: string | null;
    status_operacional: string;
    status_comercial: string;
    status_documental: string;
    status_financeiro: string;
    status_faturamento: string;
    valor_contrato?: number | null;
    valor_orcado?: number | null;
    responsavel?: string | null;
    gestor?: string | null;
    descricao?: string | null;
    /** Pasta da obra no servidor; sai nos e-mails financeiros. */
    diretorio_url?: string | null;
    data_inicio_planejada?: string | null;
    data_fim_planejada?: string | null;
    data_conclusao?: string | null;
    acionamento?: { codigo: string; titulo: string } | null;
    orcamentos?: { id: string; assunto?: string | null; status: string; versao_atual: number; created_at: string; tipo_orcamento?: string }[];
    tenant_id?: string;
    [key: string]: any;
}

// Blueprint LSI, seção 02 — três trilhas reais, não duas. Cada uma é um desenho de
// abas diferente, não apenas "esconder uma aba":
//
// EXECUCAO_DIRETA — "Operação direta (Modelo 1)": sem aprovação prévia nenhuma.
//   Inclusão → Execução & Relatório Fotográfico → Resultado. Fornecedores/PO&Faturamento
//   continuam existindo (pode ter prestador pago ou precisar de PO antes de faturar),
//   mas são secundários — nada bloqueia a conclusão operacional por causa deles.
//
// EXECUCAO_COM_APROVACAO — "Operação com aprovação (Modelo 2 simplificado)": tem
//   Orçamento/Negociação completos (igual Implantação), Execução com relatório
//   fotográfico (não RFI), Fornecedores e PO&Faturamento como parte do fluxo principal —
//   mas sem Planejamento/APC/Documentação (esses são específicos de obra/Implantação).
//
// MEDIANTE_APROVACAO — "Implantação (Modelo 2 completo)": fluxo inteiro. Dentro dela,
//   o orçamento vira DUAS abas no mesmo registro: "PV Highline" (só existe pra sharing
//   Highline — é o formato oficial do cliente) e "Cotação LS" (sempre presente em toda
//   Implantação — a lista de itens/preços internos da LS Office, mesmo orçamento,
//   itens complementares aos do catálogo Highline). Planejamento/APC/Execução & RFI não
//   são três abas irmãs — viram etapas dentro de uma única aba "Planejamento"
//   (ver TabPlanejamento.tsx), que é quem decide como somar novas etapas no futuro.
function buildTabs(modelo: string, sharing: string) {
    if (modelo === 'EXECUCAO_DIRETA') {
        return [
            { id: 'identificacao', label: 'Identificação', secondary: false },
            // Operação também precisa saber o que cobra e o que gasta. Mesmo par
            // da Implantação, com os nomes que a LS usa em operação.
            { id: 'comercial', label: 'Orçamento LS', secondary: false },
            { id: 'cotacao-ls', label: 'Custo LS', secondary: false },
            { id: 'execucao', label: 'Execução & Relatório Fotográfico', secondary: false },
            { id: 'resultado', label: 'Resultado', secondary: false },
            { id: 'fornecedores', label: 'Pagamentos', secondary: true },
            { id: 'faturamento', label: 'PO & Faturamento', secondary: true },
        ];
    }
    if (modelo === 'EXECUCAO_COM_APROVACAO') {
        return [
            { id: 'identificacao', label: 'Identificação', secondary: false },
            { id: 'comercial', label: 'Orçamento LS', secondary: false },
            { id: 'cotacao-ls', label: 'Custo LS', secondary: false },
            { id: 'execucao', label: 'Execução & Relatório Fotográfico', secondary: false },
            { id: 'fornecedores', label: 'Pagamentos', secondary: false },
            { id: 'faturamento', label: 'PO & Faturamento', secondary: false },
            { id: 'resultado', label: 'Resultado', secondary: false },
        ];
    }
    // MEDIANTE_APROVACAO
    const ehHighline = sharing?.trim().toUpperCase() === 'HIGHLINE';
    return [
        { id: 'identificacao', label: 'Identificação', secondary: false },
        { id: 'comercial', label: ehHighline ? 'PV Highline' : 'Comercial', secondary: false },
        { id: 'cotacao-ls', label: 'Cotação LS', secondary: false },
        { id: 'planejamento', label: 'Planejamento', secondary: false },
        { id: 'documentacao', label: 'Documentação', secondary: false },
        { id: 'fornecedores', label: 'Pagamentos', secondary: false },
        { id: 'faturamento', label: 'PO & Faturamento', secondary: false },
        { id: 'resultado', label: 'Resultado', secondary: false },
    ];
}

export default function AtividadeCockpit({ atividadeId, onBack }: { atividadeId: string; onBack: () => void }) {
    const [atividade, setAtividade] = useState<AtividadeDetalhe | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('identificacao');
    const [pendencias, setPendencias] = useState<PendenciasPorAba>({});

    // Recalcula ao abrir, a cada recarga e a cada troca de aba: várias abas
    // gravam direto na API sem passar pelo onRefresh (ex.: anexar comprovante).
    const carregarPendencias = useCallback(async () => {
        try {
            const r = await fetch(`/api/atividades/${atividadeId}/pendencias`);
            if (r.ok) setPendencias(await r.json());
        } catch { /* sem painel, a aba continua funcionando */ }
    }, [atividadeId]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/atividades/${atividadeId}`);
            if (r.ok) setAtividade(await r.json());
        } finally {
            setLoading(false);
        }
    }, [atividadeId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { carregarPendencias(); }, [carregarPendencias, activeTab, atividade]);

    useEffect(() => {
        if (!atividade) return;
        const ids = buildTabs(atividade.modelo_operacao, atividade.sharing).map(t => t.id);
        if (!ids.includes(activeTab)) setActiveTab('identificacao');
    }, [atividade?.modelo_operacao, atividade?.sharing]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading || !atividade) {
        return <div className="p-8 text-center text-muted-foreground">Carregando atividade...</div>;
    }

    const modelo = atividade.modelo_operacao;
    const isImplantacaoCompleta = modelo === 'MEDIANTE_APROVACAO';
    const usaRelatorioFotografico = !isImplantacaoCompleta;
    const tabs = buildTabs(modelo, atividade.sharing);
    const tabProps = { atividade, onRefresh: load, usaRelatorioFotografico };

    return (
        <div className="p-6 md:p-8 text-foreground">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
                <ArrowLeft size={16} /> Voltar para o Kanban
            </button>

            <div className="bg-card border border-border rounded-xl p-5 mb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="font-mono text-xs text-muted-foreground mb-1">{atividade.codigo}</div>
                        <h1 className="text-2xl font-bold">{atividade.titulo}</h1>
                        <div className="text-sm text-muted-foreground mt-1">
                            {atividade.sharing} · {atividade.id_site_sharing || 'Sem ID Sharing'} · {atividade.id_site_operadora || 'Sem ID Operadora'} · {atividade.tipo_demanda}
                            {atividade.tipo_obra ? ` (${atividade.tipo_obra})` : ''}
                        </div>
                        {atividade.acionamento && (
                            <div className="text-xs text-muted-foreground mt-1">
                                Originada do acionamento <span className="font-mono">{atividade.acionamento.codigo}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end max-w-md">
                        <StatusOperacionalControl
                            atividadeId={atividade.id}
                            status={atividade.status_operacional}
                            onSaved={load}
                        />
                        <StatusPill status={atividade.status_comercial} map={STATUS_COMERCIAL} />
                        <StatusPill status={atividade.status_documental} map={STATUS_DOCUMENTAL} />
                        <StatusPill status={atividade.status_financeiro} map={STATUS_FINANCEIRO} />
                        <StatusPill status={atividade.status_faturamento} map={STATUS_FATURAMENTO} />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto border-b border-border mb-6">
                {tabs.map((t, i) => (
                    <Fragment key={t.id}>
                        {t.secondary && !tabs[i - 1]?.secondary && (
                            <span className="w-px h-4 bg-border mx-1.5 flex-shrink-0" />
                        )}
                        <button
                            onClick={() => setActiveTab(t.id)}
                            // O realce ao passar o mouse usa o mesmo azul da sidebar
                            // (rgba(0,102,255,0.07)): a aba e o item de menu são a
                            // mesma ação — escolher onde se está —, então respondem
                            // do mesmo jeito. A aba ativa leva o tom mais forte para
                            // continuar distinta de uma aba só apontada pelo mouse.
                            className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px rounded-t-lg transition-colors ${activeTab === t.id
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : t.secondary
                                        ? 'border-transparent text-muted-foreground/60 hover:bg-primary/[0.07] hover:text-muted-foreground'
                                        : 'border-transparent text-muted-foreground hover:bg-primary/[0.07] hover:text-foreground'
                                }`}
                        >
                            {t.label}
                            {(() => {
                                const n = (pendencias[t.id] || []).filter(x => x.nivel === 'ALERTA').length;
                                return n > 0 && (
                                    <span title={`${n} pendência(s)`}
                                        className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                                        {n}
                                    </span>
                                );
                            })()}
                        </button>
                    </Fragment>
                ))}
            </div>

            <div>
                <PainelPendencias key={activeTab} itens={pendencias[activeTab] || []} />
                {activeTab === 'identificacao' &&<TabIdentificacao {...tabProps} />}
                {activeTab === 'comercial' && <TabComercial {...tabProps} />}
                {activeTab === 'cotacao-ls' && <TabCotacaoLs {...tabProps} />}
                {activeTab === 'planejamento' && isImplantacaoCompleta && <TabPlanejamento {...tabProps} />}
                {activeTab === 'execucao' && !isImplantacaoCompleta && <TabExecucao {...tabProps} />}
                {activeTab === 'documentacao' && isImplantacaoCompleta && <TabDocumentacao {...tabProps} />}
                {activeTab === 'fornecedores' && <TabFornecedores {...tabProps} />}
                {activeTab === 'faturamento' && <TabFaturamento {...tabProps} />}
                {activeTab === 'resultado' && <TabResultado {...tabProps} />}
            </div>
        </div>
    );
}
