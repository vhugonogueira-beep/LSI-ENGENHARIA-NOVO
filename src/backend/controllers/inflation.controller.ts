import { Request, Response } from 'express';
import { InflationService } from '../services/inflation.service';
import { prisma } from '../server';

export class InflationController {
    static async registerIndexes(req: Request, res: Response) {
        try {
            let tenantId = req.body.tenantId as string;
            if (!tenantId) {
                const t = await prisma.tenant.findFirst();
                tenantId = t ? t.id : '';
            }

            const { indexName, indices } = req.body;
            if (!indexName || !indices) {
                return res.status(400).json({ error: "Missing indexName or indices array" });
            }

            const result = await InflationService.registerIndices(tenantId, indexName, indices);
            res.json(result);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async getIndexes(req: Request, res: Response) {
        try {
            let tenantId = req.query.tenantId as string;
            if (!tenantId) {
                const t = await prisma.tenant.findFirst();
                tenantId = t ? t.id : '';
            }

            const indexName = req.query.indexName as string;
            const records = await prisma.inflationIndex.findMany({
                where: {
                    tenant_id: tenantId,
                    ...(indexName && { index_name: indexName })
                },
                orderBy: { year_month: 'desc' },
                take: 100
            });
            res.json(records);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
