import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { prisma } from '../server';

export class AnalyticsController {

    static async getDispersion(req: Request, res: Response) {
        try {
            // Fallback tenant resolution
            let tenantId = req.query.tenantId as string;
            if (!tenantId) {
                const t = await prisma.tenant.findFirst();
                tenantId = t ? t.id : '';
            }

            const itemKey = req.query.itemKey as string;
            const regiao = req.query.regiao as string;
            const mode = (req.query.mode as string) || 'ORIGINAL';
            const targetDate = req.query.target_date as string | undefined;

            if (!itemKey || !regiao) {
                return res.status(400).json({ error: "Missing itemKey or regiao parameters" });
            }

            const data = await AnalyticsService.getDispersion(tenantId, itemKey, regiao, mode, targetDate);
            res.json(data);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
