import { Request, Response } from 'express';
import { PriceBookService } from '../services/pricebook.service';
import { prisma } from '../server';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class PriceBookController {

    // ─── PriceBook ──────────────────────────────────────────────────

    static async list(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const filters = {
                supplier_id: req.query.supplier_id as string,
                regiao: req.query.regiao as string,
                status: req.query.status as string,
            };
            res.json(await PriceBookService.getPriceBooks(tenantId, filters));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const pb = await PriceBookService.getPriceBookById(req.params.id);
            if (!pb) return res.status(404).json({ error: 'LPU não encontrada' });
            res.json(pb);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) data.tenant_id = await getDemoTenantId();
            res.status(201).json(await PriceBookService.createPriceBook(data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            res.json(await PriceBookService.updatePriceBook(req.params.id, req.body));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── PriceBook Items ────────────────────────────────────────────

    static async listItems(req: Request, res: Response) {
        try {
            const filters = {
                tipo_escopo: req.query.tipo_escopo as string,
                search: req.query.search as string,
                unidade: req.query.unidade as string,
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 100,
            };
            res.json(await PriceBookService.getPriceBookItems(req.params.id, filters));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async createItem(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) data.tenant_id = await getDemoTenantId();
            res.status(201).json(await PriceBookService.createPriceBookItem(data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async updateItem(req: Request, res: Response) {
        try {
            res.json(await PriceBookService.updatePriceBookItem(req.params.id, req.body));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async deleteItem(req: Request, res: Response) {
        try {
            res.json(await PriceBookService.deletePriceBookItem(req.params.id));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Price Lookup ───────────────────────────────────────────────

    static async lookupPrice(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const { supplier_id, regiao, descricao, unidade, limit: k } = req.query;

            if (!descricao) return res.status(400).json({ error: 'Parâmetro descricao obrigatório' });

            const results = await PriceBookService.lookupPrice(
                tenantId,
                supplier_id as string | undefined,
                String(regiao || 'SUDESTE'),
                String(descricao),
                unidade as string | undefined,
                k ? parseInt(k as string) : 5
            );
            res.json(results);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
