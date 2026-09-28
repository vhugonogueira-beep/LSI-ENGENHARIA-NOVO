/**
 * Nome de arquivo que se sustenta fora do e-mail.
 *
 * Os anexos chegam com o nome que o celular deu — `WhatsApp_Image_2026-09-14_
 * at_15.41.20.jpeg` — e é assim que eles caem na pasta do financeiro, onde não
 * identificam nada. Aqui o arquivo passa a nascer com o tipo, o site e o
 * favorecido no nome, já arquivável.
 *
 * A extensão original é preservada: é ela que faz o arquivo abrir.
 */
export function nomearAnexo(opcoes: {
    tipo?: string | null;
    site?: string | null;
    favorecido?: string | null;
    nomeOriginal: string;
}): string {
    const limpar = (v: any, max = 28) => {
        const inteiro = String(v ?? '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toUpperCase();
        if (inteiro.length <= max) return inteiro;
        // Corta no fim de uma palavra: "..._NOGUEIRA_DA" fica melhor como
        // "..._NOGUEIRA" do que terminando numa preposição solta.
        const cortado = inteiro.slice(0, max);
        const ultimo = cortado.lastIndexOf('_');
        const inteiroNoCorte = (ultimo > max * 0.5 ? cortado.slice(0, ultimo) : cortado).replace(/_+$/, '');
        // Nome truncado não deve terminar em preposição: "NOGUEIRA_DA" vira "NOGUEIRA".
        return inteiroNoCorte.replace(/_(DA|DE|DO|DAS|DOS|E)$/, '');
    };

    const ponto = opcoes.nomeOriginal.lastIndexOf('.');
    const extensao = ponto > 0 ? opcoes.nomeOriginal.slice(ponto + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    const ROTULO: Record<string, string> = {
        COMPROVANTE_PAGAMENTO: 'COMPROVANTE',
        DOCUMENTO_FISCAL: 'NOTA_FISCAL',
        MEMORIA_CALCULO: 'MEMORIA_CALCULO',
    };
    const partes = [
        ROTULO[String(opcoes.tipo || '').toUpperCase()] || limpar(opcoes.tipo) || 'ANEXO',
        limpar(opcoes.site, 20),
        limpar(opcoes.favorecido, 24),
    ].filter(Boolean);

    const base = partes.join('_') || limpar(opcoes.nomeOriginal, 40) || 'ANEXO';
    return extensao ? `${base}.${extensao}` : base;
}
