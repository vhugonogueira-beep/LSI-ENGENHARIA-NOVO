/**
 * Referência humana do reembolso/adiantamento — `REE-2026-0041`, `ADT-2026-0007`.
 *
 * Os e-mails de pagamento citavam os oito primeiros caracteres do UUID
 * (`Reembolso 3f9a1c20`). Ninguém dita isso por telefone, ninguém procura no
 * extrato e dois lançamentos parecidos não se distinguem de relance. O formato
 * segue o que o sistema já usa em DEM-YYYY-NNN e ATV-YYYY-NNN.
 *
 * Quatro dígitos, não três: reembolso é o lançamento de maior volume do
 * sistema — cada obra gera vários por mês, e três dígitos estouram.
 *
 * O contador é por prefixo e por ano, contando os códigos já emitidos. Em
 * SQLite com um processo só isso basta; se o backend virar multi-instância,
 * trocar por uma tabela de sequência.
 */
import { PrismaClient } from '@prisma/client';

export const PREFIXO_REEMBOLSO = 'REE';
export const PREFIXO_ADIANTAMENTO = 'ADT';

export function prefixoDaNatureza(natureza: string | null | undefined): string {
    return natureza === 'ADIANTAMENTO' ? PREFIXO_ADIANTAMENTO : PREFIXO_REEMBOLSO;
}

export function formatarReferencia(prefixo: string, ano: number, seq: number): string {
    return `${prefixo}-${ano}-${String(seq).padStart(4, '0')}`;
}

/**
 * Próximo código livre. Parte do maior sequencial já emitido no ano — não da
 * contagem de linhas, que repetiria um código depois de qualquer exclusão — e
 * avança enquanto o candidato já existir.
 */
export async function proximaReferencia(
    prisma: Pick<PrismaClient, 'reembolso'>,
    natureza: string | null | undefined,
    ano: number = new Date().getFullYear(),
): Promise<string> {
    const prefixo = prefixoDaNatureza(natureza);
    const inicio = `${prefixo}-${ano}-`;

    const emitidos = await prisma.reembolso.findMany({
        where: { codigo: { startsWith: inicio } },
        select: { codigo: true },
    });

    let maior = 0;
    for (const { codigo } of emitidos) {
        const n = Number(String(codigo).slice(inicio.length));
        if (Number.isFinite(n) && n > maior) maior = n;
    }

    const usados = new Set(emitidos.map(e => e.codigo));
    let seq = maior + 1;
    while (usados.has(formatarReferencia(prefixo, ano, seq))) seq++;
    return formatarReferencia(prefixo, ano, seq);
}
