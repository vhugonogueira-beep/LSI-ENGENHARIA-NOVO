import { prisma } from '../server';

// Blueprint LSI, seção 27 — "Pronto para Faturar" só é atingido quando G7 (execução
// concluída) + G9 (documentação validada) + G10 (PO liberada) forem simultaneamente
// verdadeiros. Chamado após qualquer mudança em execução, documentação ou PO.
export async function avaliarProntoParaFaturar(atividade_id: string): Promise<boolean> {
    const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
    if (!atividade) return false;

    // Não regride uma atividade que já avançou na fila de faturamento (Blueprint LSI, seção 29).
    if (!['NAO_INICIADO', 'PRONTO_PARA_FATURAR'].includes(atividade.status_faturamento)) {
        return atividade.status_faturamento === 'PRONTO_PARA_FATURAR';
    }

    const poLiberada = await prisma.purchaseOrder.findFirst({ where: { atividade_id, status: 'LIBERADA' } });

    const pronto = atividade.status_operacional === 'CONCLUIDA'
        && atividade.status_documental === 'COMPLETO'
        && !!poLiberada;

    if (pronto !== (atividade.status_faturamento === 'PRONTO_PARA_FATURAR')) {
        await prisma.atividade.update({
            where: { id: atividade_id },
            data: { status_faturamento: pronto ? 'PRONTO_PARA_FATURAR' : 'NAO_INICIADO' },
        });
    }
    return pronto;
}
