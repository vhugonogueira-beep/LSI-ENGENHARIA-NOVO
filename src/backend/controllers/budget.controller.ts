import { Request, Response } from 'express';
import { BudgetService } from '../services/budget.service';
import { ExportService } from '../services/export.service';
import { prisma } from '../server';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class BudgetController {
    static async getAll(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const budgets = await BudgetService.getBudgetsByTenant(tenantId);
            res.json(budgets);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const budget = await BudgetService.getBudgetById(req.params.id);
            if (!budget) return res.status(404).json({ error: 'Not found' });
            res.json(budget);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const budget = await BudgetService.createBudget(req.body);
            res.status(201).json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateHeader(req: Request, res: Response) {
        try {
            const budget = await BudgetService.updateBudgetHeader(req.params.id, req.body);
            res.json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateItems(req: Request, res: Response) {
        try {
            const { items, versaoAtual } = req.body;
            const budget = await BudgetService.updateBudgetItems(req.params.id, versaoAtual, items);
            res.json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async createVersion(req: Request, res: Response) {
        try {
            const version = await BudgetService.createVersion(req.params.id, req.body.userId);
            res.status(201).json(version);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async exportHtml(req: Request, res: Response) {
        try {
            const html = await ExportService.genterateHTML(req.params.id);
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async exportExcel(req: Request, res: Response) {
        try {
            const buffer = await ExportService.generateExcel(req.params.id);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=orcamento-${req.params.id}.xlsx`);
            res.send(buffer);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}
