import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoStatusAutomatico } from '../services/status-atividade.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

const APC_STATUS_ORDEM = ['AGUARDANDO_APC', 'APC_RECEBIDO', 'APC_VALIDADO', 'APC_LIBERADO'];

// APC — Autorização para Execução (Blueprint LSI, seção 18): libera a execução mas
// não bloqueia o planejamento que já rodava em paralelo (compras, contratação, etc.).
export async function createAPC(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, numero, data, documento_url, valor, responsavel, observacoes } = req.body;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });

        const apc = await prisma.aPC.create({
            data: {
                tenant_id,
                atividade_id,
                numero: numero || null,
                data: data ? new Date(data) : null,
                documento_url: documento_url || null,
                valor: valor != null ? parseFloat(valor) : null,
                responsavel: responsavel || null,
                observacoes: observacoes || null,
                created_by: (req as any).user?.email || null,
            },
        });
        res.status(201).json(apc);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listAPCs(req: Request, res: Response) {
    try {
        const { atividade_id } = req.query;
        const where: any = {};
        if (atividade_id) where.atividade_id = atividade_id;
        res.json(await prisma.aPC.findMany({ where, orderBy: { created_at: 'desc' } }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function updateAPCStatus(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { status, documento_url } = req.body;
        if (!APC_STATUS_ORDEM.includes(status)) {
            return res.status(400).json({ error: `status inválido. Use um de: ${APC_STATUS_ORDEM.join(', ')}` });
        }

        const apc = await prisma.aPC.update({
            where: { id },
            data: { status, documento_url: documento_url !== undefined ? documento_url : undefined },
        });

        // Liberar o APC libera a execução. Não existe mais um estado "APC
        // liberado" na atividade: era um gate ocupando lugar de fase. Quanto já
        // foi feito quem diz é o avanço físico, não o status.
        if (status === 'APC_LIBERADO') {
            const atividade = await prisma.atividade.findUnique({ where: { id: apc.atividade_id } });
            const novo = proximoStatusAutomatico(atividade?.status_operacional, 'EM_EXECUCAO');
            if (atividade && novo) {
                await prisma.atividade.update({
                    where: { id: apc.atividade_id },
                    data: { status_operacional: novo },
                });
            }
        }

        res.json(apc);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
