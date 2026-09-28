/**
 * Dá referência (REE-/ADT-) aos reembolsos e adiantamentos criados antes do campo existir.
 *
 * A numeração segue a ordem de criação e o ano de cada lançamento, não o ano
 * corrente: um reembolso de 2025 recebe REE-2025-0001, senão a sequência do ano
 * atual ficaria furada e o código mentiria sobre a data.
 *
 *   npx tsx src/backend/scripts/backfill-codigo-reembolso.ts            (simulação)
 *   npx tsx src/backend/scripts/backfill-codigo-reembolso.ts --aplicar
 */
import { PrismaClient } from '@prisma/client';
import { formatarReferencia, prefixoDaNatureza } from '../services/referencia-reembolso.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

async function main() {
    console.log(aplicar ? '\n== APLICANDO ==\n' : '\n== SIMULAÇÃO (use --aplicar para gravar) ==\n');

    const todos = await prisma.reembolso.findMany({
        select: { id: true, codigo: true, natureza: true, created_at: true, favorecido_nome: true },
        orderBy: { created_at: 'asc' },
    });

    // Retoma de onde os códigos já emitidos pararam, por prefixo e ano.
    const contador = new Map<string, number>();
    for (const r of todos) {
        if (!r.codigo) continue;
        const [pref, ano, seq] = String(r.codigo).split('-');
        const chave = `${pref}-${ano}`;
        contador.set(chave, Math.max(contador.get(chave) || 0, Number(seq) || 0));
    }

    const semCodigo = todos.filter(r => !r.codigo);
    for (const r of semCodigo) {
        const prefixo = prefixoDaNatureza(r.natureza);
        const ano = r.created_at.getFullYear();
        const chave = `${prefixo}-${ano}`;
        const seq = (contador.get(chave) || 0) + 1;
        contador.set(chave, seq);
        const codigo = formatarReferencia(prefixo, ano, seq);

        console.log(`  ${codigo}  ${r.favorecido_nome}`);
        if (aplicar) {
            await prisma.reembolso.update({ where: { id: r.id }, data: { codigo } });
        }
    }

    console.log(`\n  ${semCodigo.length} sem código de ${todos.length} lançamento(s).`);

    if (aplicar) {
        const restantes = await prisma.reembolso.count({ where: { codigo: null } });
        const total = await prisma.reembolso.count();
        const distintos = (await prisma.reembolso.findMany({ select: { codigo: true } }))
            .filter(r => r.codigo).map(r => r.codigo);
        const duplicados = distintos.length - new Set(distintos).size;
        console.log(`  Sem código depois: ${restantes}  ·  duplicados: ${duplicados}  ·  total: ${total}`);
        if (restantes || duplicados) process.exitCode = 1;
    }
    console.log('');
}

main().finally(() => prisma.$disconnect());
