import { Request, Response } from 'express';
import { prisma } from '../server';
import {
    getOrCreateTemplate, updateTemplate, gerarContrato, renderContratoParaImpressao,
    storeContratoArquivo, getStoredContratoArquivo, deleteStoredContratoArquivo,
} from '../services/contrato.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export async function getTemplate(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const finalidade = (req.query.finalidade as string) || null;
        const template = await getOrCreateTemplate(tenant_id, finalidade);
        res.json(template);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function putTemplate(req: Request, res: Response) {
    try {
        const { nome, corpo_html } = req.body;
        const template = await updateTemplate(req.params.id, { nome, corpo_html });
        res.json(template);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function getContratoDaContratacao(req: Request, res: Response) {
    try {
        const contrato = await prisma.contrato.findUnique({
            where: { contratacao_id: req.params.contratacaoId },
            include: { arquivos: { orderBy: { created_at: 'desc' } } },
        });
        if (!contrato) return res.status(404).json({ error: 'Nenhum contrato gerado ainda' });
        res.json(contrato);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function uploadContratoArquivo(req: Request, res: Response) {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo para anexar' });
        const attachment = await storeContratoArquivo(req.params.id, req.file, (req as any).user?.email);
        res.status(201).json(attachment);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function downloadContratoArquivo(req: Request, res: Response) {
    try {
        const { attachment, absolutePath } = await getStoredContratoArquivo(req.params.arquivoId);
        res.download(absolutePath, attachment.nome_original);
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

export async function deleteContratoArquivo(req: Request, res: Response) {
    try {
        await deleteStoredContratoArquivo(req.params.arquivoId);
        res.status(204).send();
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

export async function postGerarContrato(req: Request, res: Response) {
    try {
        const contrato = await gerarContrato(req.params.contratacaoId);
        res.status(201).json(contrato);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function putStatusContrato(req: Request, res: Response) {
    try {
        const { status } = req.body;
        if (!['GERADO', 'ENVIADO', 'ASSINADO'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }
        const contrato = await prisma.contrato.update({
            where: { id: req.params.id },
            data: { status, assinado_em: status === 'ASSINADO' ? new Date() : null },
        });
        res.json(contrato);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function exportContratoHtml(req: Request, res: Response) {
    try {
        const html = await renderContratoParaImpressao(req.params.id);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
