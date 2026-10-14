/**
 * Nome original do arquivo enviado, em UTF-8 (14/10/2026).
 *
 * O multer (busboy) lê o nome do arquivo como Latin-1; um nome UTF-8 com
 * acento chega corrompido: "CONCEIÇÃO.pdf" vira "CONCEIÃ‡ÃƒO.pdf". Aqui ele é
 * relido como UTF-8. Se o nome já veio certo, a releitura gera um caractere
 * inválido (U+FFFD) e o original é mantido.
 */
export function nomeArquivoUtf8(nome: string | undefined | null): string {
    const original = String(nome || '');
    if (!/[\u0080-ÿ]/.test(original)) return original;
    const relido = Buffer.from(original, 'latin1').toString('utf8');
    return relido.includes('�') ? original : relido.normalize('NFC');
}
