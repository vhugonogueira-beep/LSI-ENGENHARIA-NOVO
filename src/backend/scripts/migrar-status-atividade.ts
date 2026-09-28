/**
 * Migra os status operacionais antigos para o fluxo de cinco estados.
 *
 *   AGUARDANDO_APC → AGUARDANDO_LIBERACAO   (Operação também espera, e não tem APC)
 *   APC_LIBERADO   → EM_EXECUCAO            (era gate, não fase — quem diz quanto
 *                                            já foi feito é o avanço físico)
 *   PAUSADA        → ON_HOLD                (termo que a equipe usa)
 *
 * O histórico de status é convertido junto. Sem isso a trilha de auditoria
 * continuaria citando estados que não existem mais e as telas mostrariam o
 * código cru no lugar do rótulo.
 *
 * `APC.status` NÃO é tocado: lá `APC_LIBERADO` é o status do documento de APC,
 * outra coisa com nome parecido — e é ele que passou a guardar a liberação.
 *
 *   npx tsx src/backend/scripts/migrar-status-atividade.ts          (simulação)
 *   npx tsx src/backend/scripts/migrar-status-atividade.ts --aplicar
 */
import { PrismaClient } from '@prisma/client';
import { STATUS_ATIVIDADE } from '../services/status-atividade.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

const DE_PARA: Record<string, string> = {
    AGUARDANDO_APC: 'AGUARDANDO_LIBERACAO',
    APC_LIBERADO: 'EM_EXECUCAO',
    PAUSADA: 'ON_HOLD',
};

async function main() {
    console.log(aplicar ? '\n== APLICANDO ==\n' : '\n== SIMULAÇÃO (use --aplicar para gravar) ==\n');

    const atividades = await prisma.atividade.findMany({
        select: { id: true, codigo: true, status_operacional: true },
    });

    let mudadas = 0;
    for (const a of atividades) {
        const novo = DE_PARA[a.status_operacional];
        if (!novo) continue;
        mudadas++;
        console.log(`  atividade ${a.codigo || a.id}: ${a.status_operacional} → ${novo}`);
        if (aplicar) {
            await prisma.atividade.update({ where: { id: a.id }, data: { status_operacional: novo } });
        }
    }
    console.log(`\n  ${mudadas} atividade(s) de ${atividades.length}.`);

    // Histórico: status_de e status_para, só na dimensão OPERACIONAL.
    const historico = await prisma.atividadeStatusHistorico.findMany({
        where: { dimensao: 'OPERACIONAL' },
        select: { id: true, status_de: true, status_para: true },
    });
    let linhas = 0;
    for (const h of historico) {
        const de = h.status_de ? DE_PARA[h.status_de] : undefined;
        const para = DE_PARA[h.status_para];
        if (!de && !para) continue;
        linhas++;
        if (aplicar) {
            await prisma.atividadeStatusHistorico.update({
                where: { id: h.id },
                data: { ...(de ? { status_de: de } : {}), ...(para ? { status_para: para } : {}) },
            });
        }
    }
    console.log(`  ${linhas} linha(s) de histórico de ${historico.length}.`);

    // Conferência: nada pode sobrar fora dos cinco estados.
    const depois = await prisma.atividade.groupBy({
        by: ['status_operacional'],
        _count: { _all: true },
    });
    console.log('\n  Distribuição final:');
    let invalidos = 0;
    for (const g of depois) {
        const ok = (STATUS_ATIVIDADE as readonly string[]).includes(g.status_operacional);
        if (!ok && aplicar) invalidos++;
        console.log(`    ${ok ? ' ' : '!'} ${g.status_operacional.padEnd(22)} ${g._count._all}`);
    }
    if (invalidos) {
        console.log(`\n  ${invalidos} status fora do fluxo — verifique antes de seguir.\n`);
        process.exitCode = 1;
    } else {
        console.log('');
    }
}

main().finally(() => prisma.$disconnect());
