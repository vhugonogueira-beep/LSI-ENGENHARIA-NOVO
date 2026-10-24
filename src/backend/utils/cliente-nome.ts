/**
 * Comparação de nomes de clientes (23/10/2026) — funções puras, sem banco,
 * usadas pelo servidor (utils/sharing.ts) e pelos scripts de correção.
 */

export const TIPOS_SHARING = ['SHARING', 'SHARING_OPERADORA'];
export const TIPOS_OPERADORA = ['OPERADORA', 'SHARING_OPERADORA'];

/** Nome comparável: sem acento, sem espaço sobrando, em maiúsculas. */
export function chaveNome(valor: unknown): string {
    return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** A atividade é da Highline? Pelo nome do sharing do cadastro ("Highline do Brasil") ou o antigo "HIGHLINE". */
export function ehHighline(sharing: unknown): boolean {
    return /^HIGH ?LINE\b/.test(chaveNome(sharing));
}

/**
 * Entre os cadastros ativos, o que corresponde ao texto: nome igual (sem acento
 * e caixa); para dados antigos, sigla igual ou nome que começa pelo texto
 * ("HIGHLINE" → "Highline do Brasil").
 */
export function acharCliente<T extends { nome: string; sigla?: string | null }>(ativos: T[], texto: unknown): T | null {
    const alvo = chaveNome(texto);
    if (!alvo) return null;
    return ativos.find(c => chaveNome(c.nome) === alvo)
        || ativos.find(c => c.sigla && chaveNome(c.sigla) === alvo)
        || ativos.find(c => chaveNome(c.nome).startsWith(`${alvo} `))
        || (ehHighline(alvo) ? ativos.find(c => ehHighline(c.nome)) : undefined)
        || null;
}
