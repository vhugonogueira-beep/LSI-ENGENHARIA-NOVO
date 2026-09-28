/**
 * Códigos sequenciais por ano — ATV-2026-001, ACI-2026-001, DEM-2026-001.
 *
 * Cinco lugares do sistema geravam código com `count + 1`: contavam as linhas e
 * somavam um. Depois de qualquer exclusão a contagem recua e o código **repete**
 * — a base já tinha dois `ATV-2026-003` com títulos diferentes. Com um lote de
 * 25 atividades criadas de uma vez, isso vira conferência impossível.
 *
 * Aqui o número sai do maior sequencial **já emitido** no ano, e avança
 * enquanto o candidato existir. Exclusão não recicla código: um código que
 * circulou em e-mail ou planilha não pode reaparecer em outro registro.
 *
 * Mesma regra de `referencia-reembolso.service.ts`, que resolveu isto antes
 * para REE-/ADT-.
 */

export interface FonteDeCodigos {
    /** Devolve os códigos já emitidos que começam com o prefixo dado. */
    findMany(args: { where: { codigo: { startsWith: string } }; select: { codigo: true } }): Promise<{ codigo: string | null }[]>;
}

export function formatarCodigo(prefixo: string, ano: number, seq: number, digitos = 3): string {
    return `${prefixo}-${ano}-${String(seq).padStart(digitos, '0')}`;
}

export async function proximoCodigo(
    modelo: FonteDeCodigos,
    prefixo: string,
    ano: number = new Date().getFullYear(),
    digitos = 3,
): Promise<string> {
    const inicio = `${prefixo}-${ano}-`;
    const emitidos = await modelo.findMany({
        where: { codigo: { startsWith: inicio } },
        select: { codigo: true },
    });

    let maior = 0;
    for (const { codigo } of emitidos) {
        const n = Number(String(codigo || '').slice(inicio.length));
        if (Number.isFinite(n) && n > maior) maior = n;
    }

    const usados = new Set(emitidos.map(e => e.codigo));
    let seq = maior + 1;
    while (usados.has(formatarCodigo(prefixo, ano, seq, digitos))) seq++;
    return formatarCodigo(prefixo, ano, seq, digitos);
}
