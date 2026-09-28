import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoCodigo } from '../services/codigo-sequencial.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}


export async function listDemandas(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { tipo, sharing, status } = req.query;

        const where: any = { tenant_id };
        if (tipo) where.tipo = tipo;
        if (sharing) where.sharing = sharing;
        if (status) where.status = status;

        const demandas = await prisma.demanda.findMany({
            where,
            include: {
                site: { select: { id_site: true, cidade: true, uf: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 1 },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json(demandas);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getDemanda(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const demanda = await prisma.demanda.findUnique({
            where: { id },
            include: {
                site: true,
                statusHistorico: { orderBy: { criado_em: 'desc' } },
            },
        });
        if (!demanda) return res.status(404).json({ error: 'Demanda não encontrada' });
        res.json(demanda);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function createDemanda(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const {
            titulo, tipo, sharing, site_id, id_site_sharing,
            status, valor_contrato, valor_orcado,
            data_inicio_planejada, data_fim_planejada,
            responsavel, descricao,
        } = req.body;

        if (!titulo || !tipo || !sharing) {
            return res.status(400).json({ error: 'titulo, tipo e sharing são obrigatórios' });
        }

        const codigo = await proximoCodigo(prisma.demanda, 'DEM');

        const demanda = await prisma.demanda.create({
            data: {
                tenant_id,
                codigo,
                titulo,
                tipo,
                sharing,
                site_id: site_id || null,
                id_site_sharing: id_site_sharing || null,
                status: status || 'PROSPECTANDO',
                valor_contrato: valor_contrato ? parseFloat(valor_contrato) : null,
                valor_orcado: valor_orcado ? parseFloat(valor_orcado) : null,
                data_inicio_planejada: data_inicio_planejada ? new Date(data_inicio_planejada) : null,
                data_fim_planejada: data_fim_planejada ? new Date(data_fim_planejada) : null,
                responsavel: responsavel || null,
                descricao: descricao || null,
                created_by: (req as any).user?.email || null,
                statusHistorico: {
                    create: {
                        status_de: null,
                        status_para: status || 'PROSPECTANDO',
                        observacao: 'Demanda criada',
                        criado_por: (req as any).user?.email || null,
                    },
                },
            },
            include: {
                site: { select: { id_site: true, cidade: true, uf: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 1 },
            },
        });

        res.status(201).json(demanda);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function updateDemanda(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const {
            titulo, tipo, sharing, site_id, id_site_sharing,
            status, valor_contrato, valor_orcado,
            data_inicio_planejada, data_fim_planejada, data_conclusao,
            responsavel, descricao,
        } = req.body;

        const existing = await prisma.demanda.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Demanda não encontrada' });

        const statusMudou = status && status !== existing.status;

        const demanda = await prisma.demanda.update({
            where: { id },
            data: {
                titulo: titulo ?? existing.titulo,
                tipo: tipo ?? existing.tipo,
                sharing: sharing ?? existing.sharing,
                site_id: site_id !== undefined ? site_id : existing.site_id,
                id_site_sharing: id_site_sharing !== undefined ? id_site_sharing : existing.id_site_sharing,
                status: status ?? existing.status,
                valor_contrato: valor_contrato !== undefined ? parseFloat(valor_contrato) : existing.valor_contrato,
                valor_orcado: valor_orcado !== undefined ? parseFloat(valor_orcado) : existing.valor_orcado,
                data_inicio_planejada: data_inicio_planejada !== undefined ? (data_inicio_planejada ? new Date(data_inicio_planejada) : null) : existing.data_inicio_planejada,
                data_fim_planejada: data_fim_planejada !== undefined ? (data_fim_planejada ? new Date(data_fim_planejada) : null) : existing.data_fim_planejada,
                data_conclusao: data_conclusao !== undefined ? (data_conclusao ? new Date(data_conclusao) : null) : existing.data_conclusao,
                responsavel: responsavel !== undefined ? responsavel : existing.responsavel,
                descricao: descricao !== undefined ? descricao : existing.descricao,
                ...(statusMudou && {
                    statusHistorico: {
                        create: {
                            status_de: existing.status,
                            status_para: status,
                            criado_por: (req as any).user?.email || null,
                        },
                    },
                }),
            },
            include: {
                site: { select: { id_site: true, cidade: true, uf: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 3 },
            },
        });

        res.json(demanda);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function deleteDemanda(req: Request, res: Response) {
    try {
        const { id } = req.params;
        await prisma.demanda.delete({ where: { id } });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getDemandaStats(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);

        const [byStatus, byTipo, bySharing, totais] = await Promise.all([
            prisma.demanda.groupBy({ by: ['status'], where: { tenant_id }, _count: true }),
            prisma.demanda.groupBy({ by: ['tipo'], where: { tenant_id }, _count: true }),
            prisma.demanda.groupBy({ by: ['sharing'], where: { tenant_id }, _count: true }),
            prisma.demanda.aggregate({
                where: { tenant_id },
                _sum: { valor_contrato: true, valor_orcado: true },
                _count: true,
            }),
        ]);

        res.json({ byStatus, byTipo, bySharing, totais });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
