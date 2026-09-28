/**
 * Renumera atividades que ficaram com o mesmo código.
 *
 * O gerador antigo usava `count + 1`: depois de qualquer exclusão a contagem
 * recuava e o código repetia. A correção em `codigo-sequencial.service.ts`
 * impede novos casos; este script repara os que já existem.
 *
 * Mantém o código no registro MAIS ANTIGO — é o que provavelmente já circulou
 * em e-mail e planilha — e renumera os seguintes para o próximo livre.
 *
 *   npx tsx src/backend/scripts/reparar-codigos-duplicados.ts            (simulação)
 *   npx tsx src/backend/scripts/reparar-codigos-duplicados.ts --aplicar
 */
import { PrismaClient } from '@prisma/client';
import { proximoCodigo } from '../services/codigo-sequencial.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

async function main() {
    console.log(aplicar ? '\n== APLICANDO ==\n' : '\n== SIMULAÇÃO (use --aplicar para gravar) ==\n');

    const atividades = await prisma.atividade.findMany({
        select: { id: true, codigo: true, titulo: true, created_at: true },
        orderBy: { created_at: 'asc' },
    });

    const vistos = new Set<string>();
    const repetidos: typeof atividades = [];
    for (const a of atividades) {
        if (vistos.has(a.codigo)) repetidos.push(a);
        else vistos.add(a.codigo);
    }

    if (!repetidos.length) {
        console.log('  Nenhum código repetido.\n');
        return;
    }

    for (const a of repetidos) {
        const novo = await proximoCodigo(prisma.atividade, 'ATV');
        console.log(`  ${a.codigo} → ${novo}   "${a.titulo}"  (criada em ${a.created_at.toLocaleDateString('pt-BR')})`);
        if (aplicar) {
            await prisma.atividade.update({ where: { id: a.id }, data: { codigo: novo } });
        }
    }

    console.log(`\n  ${repetidos.length} atividade(s) renumerada(s).`);

    if (aplicar) {
        const depois = await prisma.atividade.findMany({ select: { codigo: true } });
        const codigos = depois.map(a => a.codigo);
        const aindaRepete = codigos.filter((c, i) => codigos.indexOf(c) !== i);
        console.log(aindaRepete.length ? `  AINDA REPETEM: ${aindaRepete.join(', ')}` : '  Nenhum código repetido agora.');
        if (aindaRepete.length) process.exitCode = 1;
    }
    console.log('');
}

main().finally(() => prisma.$disconnect());
