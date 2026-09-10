import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const solicitacoes = await prisma.solicitacaoPagamento.findMany({
        where: { valor_snapshot: null },
        include: { parcela: { select: { valor: true } } },
    });
    for (const solicitacao of solicitacoes) {
        await prisma.solicitacaoPagamento.update({
            where: { id: solicitacao.id },
            data: { valor_snapshot: solicitacao.parcela.valor },
        });
    }
    console.log(JSON.stringify({ solicitacoesAtualizadas: solicitacoes.length }));
}

main()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
