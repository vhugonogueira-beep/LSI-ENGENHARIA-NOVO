import { Request, Response } from 'express';
import { BdiService } from '../services/bdi.service';
import { prisma } from '../server';

export class BdiController {
    static async getSuggestion(req: Request, res: Response) {
        try {
            let tenantId = req.query.tenantId as string;
            if (!tenantId) {
                const t = await prisma.tenant.findFirst();
                tenantId = t ? t.id : '';
            }

            const categoria = req.query.categoria as string;
            const regiao = req.query.regiao as string;

            if (!categoria || !regiao) {
                return res.status(400).json({ error: "Missing categoria or regiao parameters" });
            }

            const suggestion = await BdiService.suggestBdi(tenantId, categoria, regiao);
            res.json(suggestion);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async saveRule(req: Request, res: Response) {
        try {
            let tenantId = req.body.tenantId as string;
            if (!tenantId) {
                const t = await prisma.tenant.findFirst();
                tenantId = t ? t.id : '';
            }
            const rule = await BdiService.upsertRule(tenantId, req.body);
            res.json(rule);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
