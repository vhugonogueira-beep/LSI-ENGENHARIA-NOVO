import { tema } from '../../theme';
// Rótulos e cores dos status do Blueprint LSI — mantidos centralizados para
// as telas de Atividades/Cockpit não divergirem entre si.

/**
 * Fluxo único da atividade — o mesmo para Implantação e Operação, e as mesmas
 * colunas do Pipeline. Espelha `src/backend/services/status-atividade.service.ts`;
 * mudou lá, muda aqui.
 *
 * `APC Liberado` saiu: era um gate, não uma fase, e deixava obra parada e obra
 * com 60% construído com a mesma aparência. `Aguardando APC` virou `Aguardando
 * liberação` porque Operação também espera autorização e não tem APC.
 *
 * On hold é roxo, não vermelho: uma obra parada por decisão não é um erro.
 */
export const STATUS_OPERACIONAL: Record<string, { label: string; color: string }> = {
    PLANEJAMENTO: { label: 'Planejamento', color: '#94a3b8' },
    AGUARDANDO_LIBERACAO: { label: 'Aguardando liberação', color: '#f59e0b' },
    EM_EXECUCAO: { label: 'Em execução', color: '#1768D5' },
    CONCLUIDA: { label: 'Concluído', color: '#22c55e' },
    ON_HOLD: { label: 'On hold', color: '#8b5cf6' },
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
    ENVIADO_FINANCEIRO: { label: 'Enviado ao Financeiro', color: '#1768D5' },
    EM_FATURAMENTO: { label: 'Em Faturamento', color: '#1768D5' },
    NF_EMITIDA: { label: 'NF Emitida', color: '#1768D5' },
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
    { sigla: 'AC', nome: 'Acre', regiao: 'NORTE' },
    { sigla: 'AL', nome: 'Alagoas', regiao: 'NORDESTE' },
    { sigla: 'AP', nome: 'Amapá', regiao: 'NORTE' },
    { sigla: 'AM', nome: 'Amazonas', regiao: 'NORTE' },
    { sigla: 'BA', nome: 'Bahia', regiao: 'NORDESTE' },
    { sigla: 'CE', nome: 'Ceará', regiao: 'NORDESTE' },
    { sigla: 'DF', nome: 'Distrito Federal', regiao: 'CENTRO_OESTE' },
    { sigla: 'ES', nome: 'Espírito Santo', regiao: 'SUDESTE' },
    { sigla: 'GO', nome: 'Goiás', regiao: 'CENTRO_OESTE' },
    { sigla: 'MA', nome: 'Maranhão', regiao: 'NORDESTE' },
    { sigla: 'MT', nome: 'Mato Grosso', regiao: 'CENTRO_OESTE' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul', regiao: 'CENTRO_OESTE' },
    { sigla: 'MG', nome: 'Minas Gerais', regiao: 'SUDESTE' },
    { sigla: 'PA', nome: 'Pará', regiao: 'NORTE' },
    { sigla: 'PB', nome: 'Paraíba', regiao: 'NORDESTE' },
    { sigla: 'PR', nome: 'Paraná', regiao: 'SUL' },
    { sigla: 'PE', nome: 'Pernambuco', regiao: 'NORDESTE' },
    { sigla: 'PI', nome: 'Piauí', regiao: 'NORDESTE' },
    { sigla: 'RJ', nome: 'Rio de Janeiro', regiao: 'SUDESTE' },
    { sigla: 'RN', nome: 'Rio Grande do Norte', regiao: 'NORDESTE' },
    { sigla: 'RS', nome: 'Rio Grande do Sul', regiao: 'SUL' },
    { sigla: 'RO', nome: 'Rondônia', regiao: 'NORTE' },
    { sigla: 'RR', nome: 'Roraima', regiao: 'NORTE' },
    { sigla: 'SC', nome: 'Santa Catarina', regiao: 'SUL' },
    { sigla: 'SP', nome: 'São Paulo', regiao: 'SUDESTE' },
    { sigla: 'SE', nome: 'Sergipe', regiao: 'NORDESTE' },
    { sigla: 'TO', nome: 'Tocantins', regiao: 'NORTE' },
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

// Regiões do IBGE, na grafia que o cadastro de fornecedor já grava.
export const REGIOES = ['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'] as const;
export const REGIAO_LABEL: Record<string, string> = {
    NACIONAL: 'Nacional', NORTE: 'Norte', NORDESTE: 'Nordeste', CENTRO_OESTE: 'Centro-Oeste', SUDESTE: 'Sudeste', SUL: 'Sul',
};

export function regiaoPorUf(value?: string | null): string {
    const sigla = normalizarUf(value);
    return UFS.find(uf => uf.sigla === sigla)?.regiao || '';
}

/** Mesma chave do backend: sem acento, caixa ou espaço duplo. */
export const chaveTexto = chaveUf;
// Compartilhadora/detentora (sharing) e operadora móvel são dimensões independentes —
// a mesma confusão que existia no Controle de Obras legado ("Cliente/Sharing" x "Operadora").
export const SHARINGS = ['HIGHLINE', 'IHS', 'WINITY', 'SBA', 'OUTROS'];
export const OPERADORAS = ['VIVO', 'CLARO', 'TIM', 'OI', 'OUTROS'];
export const OPERADORA_COLOR: Record<string, string> = { VIVO: '#818cf8', CLARO: '#ef4444', TIM: '#1768D5', OI: '#f59e0b', OUTROS: '#94a3b8' };
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

/**
 * Equivalentes escurecidos para o tema claro.
 *
 * As cores dos mapas de status vieram da paleta do tema escuro (slate-400,
 * amber-500, green-500...). A pílula pinta o texto com a própria cor sobre um
 * véu de 13% dela — sobre fundo branco isso dava de 1,94:1 a 4,38:1, ou seja,
 * as seis reprovavam. Estes tons mantêm o mesmo significado e alcançam 4,5:1.
 */
const STATUS_TOM_CLARO: Record<string, string> = {
    '#94a3b8': '#586B85',  // cinza  · neutro
    '#f59e0b': '#945F06',  // âmbar  · atenção
    '#1768D5': '#0F4EA3',  // azul   · ação
    '#22c55e': '#157839',  // verde  · sucesso
    '#ef4444': '#CC1111',  // vermelho · erro
    '#8b5cf6': '#763FF4',  // roxo
};

export function StatusPill({ status, map }: { status: string; map: Record<string, { label: string; color: string }> }) {
    const info = map[status] || { label: status, color: '#94a3b8' };
    const cor = tema === 'claro' ? (STATUS_TOM_CLARO[info.color.toLowerCase()] || STATUS_TOM_CLARO[info.color] || info.color) : info.color;
    return (
        <span
            style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor }} />
            {info.label}
        </span>
    );
}
