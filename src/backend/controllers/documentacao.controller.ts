import { Request, Response } from 'express';
import { prisma } from '../server';
import { gerarMatrizDocumental, recalcularStatusDocumental } from '../services/documentacao.service';
import { avaliarProntoParaFaturar } from '../services/gates.service';
import {
    deleteStoredDocumentFile,
    getStoredDocumentFile,
    storeDocumentFile,
} from '../services/documentacao-arquivo.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

// Catálogo da matriz documental (Blueprint LSI, seção 21) — cadastro mestre, não por atividade.
export async function createRequisitoDocumental(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const {
            codigo, nome, sharing, tipo_obra, categoria, forma_envio, obrigatorio,
            condicional, etapa, exige_assinatura, validade_dias, ordem,
        } = req.body;
        if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });

        const requisito = await prisma.requisitoDocumental.create({
            data: {
                tenant_id,
                ...(codigo ? { codigo } : {}),
                nome,
                sharing: sharing || null,
                tipo_obra: tipo_obra || null,
                categoria: categoria || null,
                forma_envio: forma_envio || null,
                obrigatorio: obrigatorio !== undefined ? !!obrigatorio : true,
                condicional: !!condicional,
                etapa: etapa || null,
                exige_assinatura: !!exige_assinatura,
                validade_dias: validade_dias != null ? parseInt(validade_dias) : null,
                ordem: ordem != null ? parseInt(ordem) : 0,
            },
        });
        res.status(201).json(requisito);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listRequisitosDocumentais(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { tipo_obra } = req.query;
        const where: any = { tenant_id, ativo: true };
        if (tipo_obra) where.OR = [{ tipo_obra }, { tipo_obra: null }];
        res.json(await prisma.requisitoDocumental.findMany({
            where,
            orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Gera (ou completa) a matriz documental de uma atividade específica a partir do catálogo.
export async function gerarMatrizParaAtividade(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;
        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        const documentos = await gerarMatrizDocumental(atividade_id, atividade.tipo_obra);
        res.json(documentos);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listDocumentosAtividade(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;
        const atividade = await prisma.atividade.findUnique({
            where: { id: atividade_id },
            select: { tipo_obra: true },
        });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        const existingCount = await prisma.documentoAtividade.count({
            where: { atividade_id, aplicavel: true },
        });
        if (existingCount === 0) {
            const generated = await gerarMatrizDocumental(atividade_id, atividade.tipo_obra);
            return res.json(generated);
        }
        const documentos = await prisma.documentoAtividade.findMany({
            where: { atividade_id, aplicavel: true },
            include: { requisito: true, arquivos: { orderBy: { created_at: 'desc' } } },
            orderBy: [{ requisito: { ordem: 'asc' } }, { created_at: 'asc' }],
        });
        res.json(documentos);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

const DOC_STATUS_VALIDOS = [
    'NAO_INICIADO', 'SOLICITADO', 'EM_ELABORACAO', 'RECEBIDO', 'EM_VALIDACAO',
    'APROVADO', 'REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO', 'NAO_APLICAVEL',
];

// Atualiza o status de um documento — Blueprint LSI, seção 22: "Não aplicável" exige justificativa.
export async function updateDocumentoAtividade(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { status, arquivo_url, justificativa_na, observacao, data_validade } = req.body;

        const existing = await prisma.documentoAtividade.findUnique({
            where: { id },
            include: { _count: { select: { arquivos: true } } },
        });
        if (!existing) return res.status(404).json({ error: 'Documento não encontrado' });

        if (status !== undefined) {
            if (!DOC_STATUS_VALIDOS.includes(status)) {
                return res.status(400).json({ error: `status inválido. Use um de: ${DOC_STATUS_VALIDOS.join(', ')}` });
            }
            if (status === 'NAO_APLICAVEL' && !justificativa_na && !existing.justificativa_na) {
                return res.status(400).json({ error: 'justificativa_na é obrigatória para marcar como Não Aplicável' });
            }
            if (['RECEBIDO', 'EM_VALIDACAO', 'APROVADO'].includes(status)
                && existing._count.arquivos === 0 && !existing.arquivo_url) {
                return res.status(400).json({ error: 'Anexe ao menos um arquivo antes de avançar este documento' });
            }
        }

        const now = new Date();
        const documento = await prisma.documentoAtividade.update({
            where: { id },
            data: {
                status: status ?? existing.status,
                arquivo_url: arquivo_url !== undefined ? arquivo_url : existing.arquivo_url,
                justificativa_na: justificativa_na !== undefined ? justificativa_na : existing.justificativa_na,
                observacao: observacao !== undefined ? observacao : existing.observacao,
                data_validade: data_validade !== undefined ? (data_validade ? new Date(data_validade) : null) : existing.data_validade,
                data_solicitacao: status === 'SOLICITADO' && !existing.data_solicitacao ? now : existing.data_solicitacao,
                data_recebimento: status === 'RECEBIDO' && !existing.data_recebimento ? now : existing.data_recebimento,
                data_validacao: status === 'APROVADO' ? now : existing.data_validacao,
            },
        });

        await recalcularStatusDocumental(existing.atividade_id);
        await avaliarProntoParaFaturar(existing.atividade_id);

        res.json(documento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function uploadDocumentoArquivo(req: Request, res: Response) {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo para anexar' });
        const attachment = await storeDocumentFile(
            req.params.id,
            req.file,
            (req as any).user?.email,
        );
        const document = await prisma.documentoAtividade.findUnique({
            where: { id: req.params.id },
            select: { atividade_id: true },
        });
        if (document) {
            await recalcularStatusDocumental(document.atividade_id);
            await avaliarProntoParaFaturar(document.atividade_id);
        }
        res.status(201).json(attachment);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function downloadDocumentoArquivo(req: Request, res: Response) {
    try {
        const { attachment, absolutePath } = await getStoredDocumentFile(req.params.arquivo_id);
        res.download(absolutePath, attachment.nome_original);
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

export async function deleteDocumentoArquivo(req: Request, res: Response) {
    try {
        const { atividadeId } = await deleteStoredDocumentFile(req.params.arquivo_id);
        await recalcularStatusDocumental(atividadeId);
        await avaliarProntoParaFaturar(atividadeId);
        res.status(204).send();
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

// Fila de pendências pós-RFI (Blueprint LSI, seção 24).
export async function getPendenciasPosRFI(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const atividadesComRfi = await prisma.rFI.findMany({
            where: { tenant_id },
            select: { atividade_id: true },
            distinct: ['atividade_id'],
        });
        const ids = atividadesComRfi.map(r => r.atividade_id);

        const pendencias = await prisma.documentoAtividade.findMany({
            where: {
                atividade_id: { in: ids },
                aplicavel: true,
                NOT: [{ status: 'APROVADO' }, { status: 'NAO_APLICAVEL' }],
                requisito: { obrigatorio: true },
            },
            include: { requisito: true, atividade: { select: { codigo: true, titulo: true, id_site_sharing: true } } },
        });

        res.json(pendencias);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getPainelDocumental(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const atividades = await prisma.atividade.findMany({
            where: { tenant_id, tipo_demanda: 'IMPLANTACAO' },
            select: {
                id: true,
                codigo: true,
                titulo: true,
                sharing: true,
                id_site_sharing: true,
                tipo_obra: true,
                status_documental: true,
                documentos: {
                    where: { aplicavel: true },
                    select: { status: true, justificativa_na: true, requisito: { select: { obrigatorio: true } } },
                },
            },
            orderBy: { updated_at: 'desc' },
        });

        const rows = atividades.map(atividade => {
            const required = atividade.documentos.filter(item => item.requisito.obrigatorio);
            const ok = required.filter(item => item.status === 'APROVADO'
                || (item.status === 'NAO_APLICAVEL' && Boolean(item.justificativa_na))).length;
            const corrections = required.filter(item => ['REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO'].includes(item.status)).length;
            return {
                ...atividade,
                documentos: undefined,
                total_obrigatorios: required.length,
                total_ok: ok,
                total_pendentes: Math.max(required.length - ok, 0),
                total_correcao: corrections,
                progresso_percentual: required.length ? Math.round((ok / required.length) * 100) : 0,
            };
        });
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
