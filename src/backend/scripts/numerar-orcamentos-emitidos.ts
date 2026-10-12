/**
 * Numeração dos orçamentos já enviados ao cliente antes do número existir
 * (12/10/2026). Dá número, por ordem de criação, a todo orçamento sem número que
 * já saiu do rascunho ou tem negociação. Rascunho continua sem número: ganha o
 * dele no primeiro PDF. Idempotente — pode rodar de novo.
 *
 * Sem --aplicar só mostra o que faria. Rodar no servidor, uma vez, depois do deploy:
 *
 *   npx tsx src/backend/scripts/numerar-orcamentos-emitidos.ts            (simulação)
 *   npx tsx src/backend/scripts/numerar-orcamentos-emitidos.ts --aplicar
 */
import { prisma } from '../server';
import { emitirNumeroOrcamento } from '../services/orcamento-numero.service';

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    const pendentes = await prisma.budget.findMany({
        where: { numero: null, atividade_id: { not: null }, OR: [{ status: { not: 'RASCUNHO' } }, { negociacoes: { some: {} } }] },
        orderBy: { created_at: 'asc' },
        select: { id: true, status: true, created_at: true, atividade: { select: { codigo: true, id_site_sharing: true } } },
    });
    console.log(`${pendentes.length} orçamento(s) já enviados sem número.${aplicar ? '' : ' (simulação — use --aplicar para gravar)'}`);
    for (const b of pendentes) {
        const rotulo = `${b.created_at.toISOString().slice(0, 10)} ${b.atividade?.codigo} ${b.atividade?.id_site_sharing || '(sem site)'} ${b.status}`;
        if (!aplicar) { console.log(`   ${rotulo}`); continue; }
        try { console.log(`   ${await emitirNumeroOrcamento(b.id, null)}  ←  ${rotulo}`); } catch (e: any) { console.log(`   NÃO NUMERADO: ${rotulo} — ${e.message}`); }
    }
    const semAtividade = await prisma.budget.count({ where: { numero: null, atividade_id: null } });
    if (semAtividade) console.log(`${semAtividade} orçamento(s) antigos sem atividade ficaram sem número (não há site para o número).`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
