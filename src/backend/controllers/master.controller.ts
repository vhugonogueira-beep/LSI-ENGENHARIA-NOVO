import { Request, Response } from 'express';
import { MasterService } from '../services/master.service';
import { prisma } from '../server';
import { PriceEngineService } from '../services/price-engine.service';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class MasterController {

    static async listContratantes(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getContratantes(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createContratante(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) {
                data.tenant_id = await getDemoTenantId();
            }
            res.status(201).json(await MasterService.createContratante(data));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async updateContratante(req: Request, res: Response) {
        try {
            res.json(await MasterService.updateContratante(req.params.id, req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listSites(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getSites(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createSite(req: Request, res: Response) {
        try {
            res.status(201).json(await MasterService.createSite(req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listCatalog(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getCatalogServices(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createCatalogItem(req: Request, res: Response) {
        try {
            res.status(201).json(await MasterService.createCatalogService(req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listTemplates(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getTemplates(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async getTemplate(req: Request, res: Response) {
        try {
            const tpl = await MasterService.getTemplateById(req.params.id);
            if (!tpl) return res.status(404).json({ error: 'Not found' });
            res.json(tpl);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createTemplate(req: Request, res: Response) {
        try {
            const { items, ...data } = req.body;
            res.status(201).json(await MasterService.createTemplate(data, items));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async suggestPrice(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string || await getDemoTenantId();
            const { query, regiao, k } = req.query;
            const limit = k ? parseInt(k as string) : 5;

            if (!query) {
                return res.status(400).json({ error: "Missing query parameter" });
            }

            const results = await PriceEngineService.suggestItems(
                tenantId,
                String(query),
                String(regiao || 'GERAL'),
                limit
            );

            res.json(results);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }
}
