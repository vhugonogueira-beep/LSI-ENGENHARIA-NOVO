/**
 * Código da detentora (sharing) gravado na atividade (23/10/2026).
 *
 * As regras da Highline (PV, PV O&M, documentação, conferência de PO) comparam
 * com "HIGHLINE". Onde o cadastro de clientes tem a Highline sem sigla, a lista
 * oferece "HIGHLINE DO BRASIL" — e a atividade deixava de ser reconhecida como
 * Highline (aba "PV Highline Do Brasil", LPU genérica). Qualquer variação do nome
 * vira HIGHLINE; os demais ficam em maiúsculas, sem espaços nas pontas.
 */
export function normalizarSharing(valor: unknown): string {
    const s = String(valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (/^HIGH\s?LINE\b/.test(s)) return 'HIGHLINE';
    return s;
}
