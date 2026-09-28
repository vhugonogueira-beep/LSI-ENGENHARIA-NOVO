/**
 * Status operacional da Atividade — fonte única.
 *
 * Fluxo padrão, o mesmo para Implantação e Operação:
 *
 *   PLANEJAMENTO → AGUARDANDO_LIBERACAO → EM_EXECUCAO → CONCLUIDA
 *                                ON_HOLD (em qualquer ponto)
 *
 * O estado `APC_LIBERADO` saiu. Ele era um **gate**, não uma fase: dizia que o
 * portão do APC passou, e ocupava lugar de fase entre planejamento e execução.
 * Uma obra liberada e parada e outra liberada com 60% construído apareciam
 * iguais — foi exatamente onde o Marabá encalhou. Agora liberar o APC leva
 * direto a EM_EXECUCAO, e quanto já foi feito é o avanço físico que diz.
 *
 * `AGUARDANDO_APC` virou `AGUARDANDO_LIBERACAO` porque Operação também espera
 * autorização e não tem APC. `PAUSADA` virou `ON_HOLD`, o termo que a equipe usa.
 *
 * ATENÇÃO: `APC.status` usa nomes parecidos (AGUARDANDO_APC, APC_RECEBIDO,
 * APC_VALIDADO, APC_LIBERADO) e é OUTRA coisa — o status do documento de APC.
 * Não confundir os dois.
 */

export const STATUS_ATIVIDADE = [
    'PLANEJAMENTO',
    'AGUARDANDO_LIBERACAO',
    'EM_EXECUCAO',
    'CONCLUIDA',
    'ON_HOLD',
] as const;

export type StatusAtividade = typeof STATUS_ATIVIDADE[number];

export const STATUS_ATIVIDADE_LABEL: Record<StatusAtividade, string> = {
    PLANEJAMENTO: 'Planejamento',
    AGUARDANDO_LIBERACAO: 'Aguardando liberação',
    EM_EXECUCAO: 'Em execução',
    CONCLUIDA: 'Concluído',
    ON_HOLD: 'On hold',
};

/**
 * Estados que uma automação pode alcançar sozinha.
 *
 * `AGUARDANDO_LIBERACAO` e `ON_HOLD` ficam de fora de propósito: são esperas
 * por decisão de terceiro e paradas de obra, que não deixam rastro nenhum no
 * sistema. Nenhuma regra consegue inferi-los — só quem está no campo sabe.
 */
export const STATUS_AUTOMATICOS: StatusAtividade[] = ['EM_EXECUCAO', 'CONCLUIDA'];

/**
 * Uma atividade em ON_HOLD está parada por decisão de alguém. Automação não
 * mexe: sair do hold é ato humano, senão o primeiro avanço de cronograma
 * apagaria a informação de que a obra está travada.
 */
export function automacaoPodeAlterar(statusAtual: string | null | undefined): boolean {
    return statusAtual !== 'ON_HOLD';
}

/**
 * Ordem do fluxo, para a automação nunca regredir uma atividade.
 * ON_HOLD fica fora da escala: é transversal, não uma etapa.
 */
const ORDEM: Record<string, number> = {
    PLANEJAMENTO: 0,
    AGUARDANDO_LIBERACAO: 1,
    EM_EXECUCAO: 2,
    CONCLUIDA: 3,
};

/** `true` quando `novo` está à frente de `atual` no fluxo. */
export function avanca(atual: string | null | undefined, novo: StatusAtividade): boolean {
    const a = ORDEM[String(atual || 'PLANEJAMENTO')];
    const n = ORDEM[novo];
    if (a === undefined || n === undefined) return false;
    return n > a;
}

/**
 * Decide se a automação deve gravar o novo status, e devolve `null` quando não
 * deve. Centraliza as duas regras — respeita o hold e nunca regride — para elas
 * não serem reescritas em cada controller.
 */
export function proximoStatusAutomatico(
    statusAtual: string | null | undefined,
    pretendido: StatusAtividade,
): StatusAtividade | null {
    if (!automacaoPodeAlterar(statusAtual)) return null;
    if (!STATUS_AUTOMATICOS.includes(pretendido)) return null;
    return avanca(statusAtual, pretendido) ? pretendido : null;
}
