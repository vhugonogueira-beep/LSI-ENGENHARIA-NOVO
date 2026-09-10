// Rótulos e cores dos status do Blueprint LSI — mantidos centralizados para
// as telas de Atividades/Cockpit não divergirem entre si.

export const STATUS_OPERACIONAL: Record<string, { label: string; color: string }> = {
    PLANEJAMENTO: { label: 'Planejamento', color: '#94a3b8' },
    AGUARDANDO_APC: { label: 'Aguardando APC', color: '#f59e0b' },
    APC_LIBERADO: { label: 'APC Liberado', color: '#3b82f6' },
    EM_EXECUCAO: { label: 'Em Execução', color: '#3b82f6' },
    CONCLUIDA: { label: 'Concluída', color: '#22c55e' },
    PAUSADA: { label: 'Pausada', color: '#ef4444' },
};

export const STATUS_COMERCIAL: Record<string, { label: string; color: string }> = {
    EM_ORCAMENTO: { label: 'Em Orçamento', color: '#94a3b8' },
    EM_NEGOCIACAO: { label: 'Em Negociação', color: '#f59e0b' },
    APROVADO: { label: 'Aprovado', color: '#22c55e' },
    REPROVADO: { label: 'Reprovado', color: '#ef4444' },
};

export const STATUS_DOCUMENTAL: Record<string, { label: string; color: string }> = {
    NAO_INICIADO: { label: 'Não Iniciado', color: '#94a3b8' },
    EM_ELABORACAO: { label: 'Em Elaboração', color: '#f59e0b' },
    PENDENCIAS_POS_RFI: { label: 'Pendências Pós-RFI', color: '#f59e0b' },
    COMPLETO: { label: 'Completo', color: '#22c55e' },
};

export const STATUS_FINANCEIRO: Record<string, { label: string; color: string }> = {
    SEM_COMPROMETIMENTO: { label: 'Sem Comprometimento', color: '#94a3b8' },
    CUSTO_COMPROMETIDO: { label: 'Custo Comprometido', color: '#f59e0b' },
    CUSTO_PAGO: { label: 'Custo Pago', color: '#22c55e' },
};

export const STATUS_FATURAMENTO: Record<string, { label: string; color: string }> = {
    NAO_INICIADO: { label: 'Não Iniciado', color: '#94a3b8' },
    PRONTO_PARA_FATURAR: { label: 'Pronto para Faturar', color: '#22c55e' },
    ENVIADO_FINANCEIRO: { label: 'Enviado ao Financeiro', color: '#3b82f6' },
    EM_FATURAMENTO: { label: 'Em Faturamento', color: '#3b82f6' },
    NF_EMITIDA: { label: 'NF Emitida', color: '#3b82f6' },
    FATURADO: { label: 'Faturado', color: '#8b5cf6' },
    RECEBIDO: { label: 'Recebido', color: '#22c55e' },
};

// Tipo de Demanda agora é binário — ele decide o modelo de operação padrão
// (Implantação → Mediante Aprovação; Operação → Execução Direta). A antiga
// granularidade (Manutenção/Adequação/Emergencial/Vistoria/Engenharia/Outro)
// virou um subtipo, só relevante quando tipo_demanda = OPERACAO.
export const TIPOS_DEMANDA = ['IMPLANTACAO', 'OPERACAO'];
export const TIPOS_DEMANDA_LABEL: Record<string, string> = { IMPLANTACAO: 'Implantação', OPERACAO: 'Operação' };
export const SUBTIPOS_OPERACAO = ['MANUTENCAO', 'ADEQUACAO', 'EMERGENCIAL', 'VISTORIA', 'ENGENHARIA', 'OUTRO'];
export const SUBTIPOS_OPERACAO_LABEL: Record<string, string> = {
    MANUTENCAO: 'Manutenção', ADEQUACAO: 'Adequação', EMERGENCIAL: 'Emergencial',
    VISTORIA: 'Vistoria', ENGENHARIA: 'Engenharia', OUTRO: 'Outro',
};
export const TIPOS_OBRA = ['BTS', 'COLLO', 'RETROFIT', 'REFORCO_EV_FUNDACAO', 'SLS', 'OUTROS'];
export const TIPOS_SITE_HIGHLINE = ['BTS', 'Roof Top', 'Collo - BTS', 'Collo RT', 'Reforço'];
export const UFS = [
    { sigla: 'AC', nome: 'Acre' },
    { sigla: 'AL', nome: 'Alagoas' },
    { sigla: 'AP', nome: 'Amapá' },
    { sigla: 'AM', nome: 'Amazonas' },
    { sigla: 'BA', nome: 'Bahia' },
    { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'DF', nome: 'Distrito Federal' },
    { sigla: 'ES', nome: 'Espírito Santo' },
    { sigla: 'GO', nome: 'Goiás' },
    { sigla: 'MA', nome: 'Maranhão' },
    { sigla: 'MT', nome: 'Mato Grosso' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MG', nome: 'Minas Gerais' },
    { sigla: 'PA', nome: 'Pará' },
    { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'PR', nome: 'Paraná' },
    { sigla: 'PE', nome: 'Pernambuco' },
    { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' },
    { sigla: 'RN', nome: 'Rio Grande do Norte' },
    { sigla: 'RS', nome: 'Rio Grande do Sul' },
    { sigla: 'RO', nome: 'Rondônia' },
    { sigla: 'RR', nome: 'Roraima' },
    { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'SP', nome: 'São Paulo' },
    { sigla: 'SE', nome: 'Sergipe' },
    { sigla: 'TO', nome: 'Tocantins' },
] as const;

function chaveUf(value: string): string {
    return value
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

export function normalizarUf(value?: string | null): string {
    if (!value?.trim()) return '';
    const chave = chaveUf(value);
    return UFS.find(uf => uf.sigla === chave || chaveUf(uf.nome) === chave)?.sigla || '';
}
// Compartilhadora/detentora (sharing) e operadora móvel são dimensões independentes —
// a mesma confusão que existia no Controle de Obras legado ("Cliente/Sharing" x "Operadora").
export const SHARINGS = ['HIGHLINE', 'IHS', 'WINITY', 'SBA', 'OUTROS'];
export const OPERADORAS = ['VIVO', 'CLARO', 'TIM', 'OI', 'OUTROS'];
export const OPERADORA_COLOR: Record<string, string> = { VIVO: '#818cf8', CLARO: '#ef4444', TIM: '#3b82f6', OI: '#f59e0b', OUTROS: '#94a3b8' };
// Blueprint LSI, seção 02 — três fluxos reais, não dois:
// EXECUCAO_DIRETA = "Operação direta (Modelo 1)", sem aprovação prévia nenhuma.
// EXECUCAO_COM_APROVACAO = "Operação com aprovação (Modelo 2 simplificado)": tem
//   Orçamento/Negociação/Aprovação, mas sem Planejamento/APC/RFI/Documentação.
// MEDIANTE_APROVACAO = "Implantação (Modelo 2 completo)": fluxo inteiro, com APC e RFI.
export const MODELOS_OPERACAO = ['EXECUCAO_DIRETA', 'EXECUCAO_COM_APROVACAO', 'MEDIANTE_APROVACAO'];
export const MODELO_OPERACAO_LABEL: Record<string, string> = {
    EXECUCAO_DIRETA: 'Execução Direta (sem aprovação)',
    EXECUCAO_COM_APROVACAO: 'Execução com Aprovação',
    MEDIANTE_APROVACAO: 'Mediante Aprovação (Implantação)',
};

// Modelo de operação padrão a partir do tipo de demanda (Blueprint LSI, seção 05) —
// sempre editável manualmente depois, isso é só o valor inicial sugerido. Operação
// nasce no caminho mais simples (sem aprovação); "com aprovação" é escolha manual.
export function modeloOperacaoPadrao(tipoDemanda: string): string {
    return tipoDemanda === 'IMPLANTACAO' ? 'MEDIANTE_APROVACAO' : 'EXECUCAO_DIRETA';
}

// Blueprint LSI, seção 02 — a correspondência não é "sugestão", é 1:1: MEDIANTE_APROVACAO
// (Modelo 2 completo, com Planejamento/APC/RFI/Documentação) só existe para Implantação;
// Operação só escolhe entre os dois modelos "de operação" (com ou sem aprovação prévia).
// Combinações fora disso (ex.: Implantação + Execução Direta) escondem a aba Comercial
// e todo o fluxo de obra por engano — por isso o formulário não deve mais permitir.
export function modelosPermitidos(tipoDemanda: string): string[] {
    return tipoDemanda === 'IMPLANTACAO'
        ? ['MEDIANTE_APROVACAO']
        : ['EXECUCAO_DIRETA', 'EXECUCAO_COM_APROVACAO'];
}

// Implantação + sharing Highline usa o mesmo conjunto de itens para a cotação interna
// e para a planilha PV oficial. O tipo indica apenas qual documento iniciou o fluxo.
export const TIPOS_ORCAMENTO = ['COTACAO_INTERNA', 'PV_HIGHLINE'];
export const TIPO_ORCAMENTO_LABEL: Record<string, string> = {
    COTACAO_INTERNA: 'Cotação Interna LS',
    PV_HIGHLINE: 'PV Highline',
};
export function exigeEscolhaTipoOrcamento(atividade: { sharing: string; tipo_demanda: string }): boolean {
    return atividade.sharing.trim().toUpperCase() === 'HIGHLINE' && atividade.tipo_demanda === 'IMPLANTACAO';
}

export function fmtMoeda(v?: number | null): string {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

// Datas de negócio (início, término, vencimento) são gravadas como meia-noite UTC — são
// um DIA, não um instante. Formatar essas no fuso local subtrai 3h e mostra o dia
// anterior, então elas são formatadas em UTC. Carimbos de tempo reais (created_at,
// data_envio...) continuam no fuso local, que é onde fazem sentido.
export function fmtData(d?: string | null): string {
    if (!d) return '—';
    const data = new Date(d);
    if (Number.isNaN(data.getTime())) return '—';
    const somenteDia = typeof d === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(d) || d.endsWith('T00:00:00.000Z'));
    return data.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        ...(somenteDia ? { timeZone: 'UTC' } : {}),
    });
}

export function StatusPill({ status, map }: { status: string; map: Record<string, { label: string; color: string }> }) {
    const info = map[status] || { label: status, color: '#94a3b8' };
    return (
        <span
            style={{ background: `${info.color}22`, color: info.color, border: `1px solid ${info.color}55` }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: info.color }} />
            {info.label}
        </span>
    );
}
