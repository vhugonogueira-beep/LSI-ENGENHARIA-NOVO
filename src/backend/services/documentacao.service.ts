import { HIGHLINE_DOCUMENT_CHECKLIST } from '../data/highline-document-checklist';
import { tipoObraDocumental } from '../utils/tipo-site';
import { prisma } from '../server';

export async function sincronizarCatalogoDocumentalHighline(tenantId: string) {
    const operations = HIGHLINE_DOCUMENT_CHECKLIST.map(item => prisma.requisitoDocumental.upsert({
        where: { tenant_id_codigo: { tenant_id: tenantId, codigo: item.code } },
        create: {
            tenant_id: tenantId,
            codigo: item.code,
            nome: item.name,
            sharing: item.sharing,
            tipo_obra: item.workType,
            categoria: item.category,
            forma_envio: item.deliveryMethod,
            obrigatorio: item.required,
            condicional: item.conditional,
            etapa: item.stage,
            exige_assinatura: item.requiresSignature,
            fonte_planilha: item.sourceSheet,
            fonte_linha: item.sourceRow,
            ordem: item.order,
            ativo: true,
        },
        update: {
            nome: item.name,
            sharing: item.sharing,
            tipo_obra: item.workType,
            categoria: item.category,
            forma_envio: item.deliveryMethod,
            obrigatorio: item.required,
            condicional: item.conditional,
            etapa: item.stage,
            exige_assinatura: item.requiresSignature,
            fonte_planilha: item.sourceSheet,
            fonte_linha: item.sourceRow,
            ordem: item.order,
            ativo: true,
        },
    }));
    await prisma.$transaction(operations);
    return HIGHLINE_DOCUMENT_CHECKLIST.length;
}

// Synchronizes the applicable matrix without deleting historical files when the work type changes.
export async function gerarMatrizDocumental(atividadeId: string, tipoObra?: string | null) {
    const atividade = await prisma.atividade.findUnique({
        where: { id: atividadeId },
        select: { tenant_id: true, tipo_obra: true, sharing: true },
    });
    if (!atividade) throw new Error('Atividade não encontrada');

    const sharing = atividade.sharing.trim().toUpperCase();
    if (sharing === 'HIGHLINE') {
        await sincronizarCatalogoDocumentalHighline(atividade.tenant_id);
    }

    // Tipo de site unificado: Collo RT usa os documentos de Collo; texto livre vale como Outros.
    const effectiveWorkType = tipoObraDocumental(tipoObra ?? atividade.tipo_obra);
    const requisitos = await prisma.requisitoDocumental.findMany({
        where: {
            tenant_id: atividade.tenant_id,
            ativo: true,
            AND: [
                { OR: [{ sharing: null }, { sharing }] },
                { OR: [{ tipo_obra: effectiveWorkType }, { tipo_obra: null }] },
            ],
        },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    const requirementIds = requisitos.map(item => item.id);

    await prisma.$transaction(async tx => {
        await tx.documentoAtividade.updateMany({
            where: { atividade_id: atividadeId },
            data: { aplicavel: false },
        });
        if (requirementIds.length === 0) return;

        await tx.documentoAtividade.updateMany({
            where: { atividade_id: atividadeId, requisito_id: { in: requirementIds } },
            data: { aplicavel: true },
        });
        const existing = await tx.documentoAtividade.findMany({
            where: { atividade_id: atividadeId, requisito_id: { in: requirementIds } },
            select: { requisito_id: true },
        });
        const existingIds = new Set(existing.map(item => item.requisito_id));
        const missing = requirementIds.filter(id => !existingIds.has(id));
        if (missing.length > 0) {
            await tx.documentoAtividade.createMany({
                data: missing.map(requisitoId => ({
                    atividade_id: atividadeId,
                    requisito_id: requisitoId,
                    aplicavel: true,
                    status: 'NAO_INICIADO',
                })),
            });
        }
    });

    await recalcularStatusDocumental(atividadeId);
    return prisma.documentoAtividade.findMany({
        where: { atividade_id: atividadeId, aplicavel: true },
        include: { requisito: true, arquivos: { orderBy: { created_at: 'desc' } } },
        orderBy: [{ requisito: { ordem: 'asc' } }, { created_at: 'asc' }],
    });
}

export async function recalcularStatusDocumental(atividadeId: string) {
    const atividade = await prisma.atividade.findUnique({ where: { id: atividadeId } });
    if (!atividade) return;

    await prisma.documentoAtividade.updateMany({
        where: {
            atividade_id: atividadeId,
            aplicavel: true,
            status: 'APROVADO',
            data_validade: { lt: new Date() },
        },
        data: { status: 'VENCIDO' },
    });

    const documentos = await prisma.documentoAtividade.findMany({
        where: { atividade_id: atividadeId, aplicavel: true },
        include: { requisito: true },
    });
    const obrigatorios = documentos.filter(documento => documento.requisito.obrigatorio);

    let novoStatus = 'NAO_INICIADO';
    if (obrigatorios.length > 0) {
        const todosOk = obrigatorios.every(documento =>
            documento.status === 'APROVADO'
            || (documento.status === 'NAO_APLICAVEL' && Boolean(documento.justificativa_na))
        );
        const algumIniciado = documentos.some(documento => documento.status !== 'NAO_INICIADO');

        if (todosOk) {
            novoStatus = 'COMPLETO';
        } else if (algumIniciado) {
            const temRfi = await prisma.rFI.findFirst({ where: { atividade_id: atividadeId }, select: { id: true } });
            novoStatus = temRfi ? 'PENDENCIAS_POS_RFI' : 'EM_ELABORACAO';
        }
    }

    if (novoStatus !== atividade.status_documental) {
        await prisma.atividade.update({
            where: { id: atividadeId },
            data: { status_documental: novoStatus },
        });
    }
}
