import { Request, Response } from 'express';
import { BudgetService } from '../services/budget.service';
import { ExportService } from '../services/export.service';
import { prisma } from '../server';
import { generateHighlinePv, listHighlinePvCatalog } from '../services/highline-pv.service';
import { getHighlinePvDefaultPriceSet } from '../data/highline-pv-default-prices';
import { carregarPvDoCliente } from '../services/pv-cliente.service';
import { normalizarUf } from '../utils/uf';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class BudgetController {
    static async highlinePvCatalog(req: Request, res: Response) {
        try {
            const budgetId = typeof req.query.budgetId === 'string' ? req.query.budgetId : '';
            let uf = normalizarUf(req.query.uf);

            if (budgetId) {
                const budget = await prisma.budget.findUnique({
                    where: { id: budgetId },
                    select: { atividade: { select: { estado: true } } },
                });
                if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
                uf = normalizarUf(budget.atividade?.estado);
            }

            // A base "PV Padrão" (Bases/LPUs) é a fonte da verdade para estrutura E
            // preço. O catálogo do código e o arquivo por UF são reserva, para a PV
            // abrir numa instalação onde a base ainda não existe.
            const priceSet = getHighlinePvDefaultPriceSet(uf);
            const pv = await carregarPvDoCliente();

            const items = listHighlinePvCatalog().map(item => {
                const daBase = pv.porLinha.get(item.templateRow);
                const temPreco = !!daBase && daBase.valor > 0;
                const defaultUnitPrice = temPreco
                    ? daBase!.valor
                    : (priceSet?.values[item.templateRow] ?? null);
                return {
                    ...item,
                    // Descrição, categoria e unidade seguem a base quando ela tem a
                    // linha — é o que a tela de LPUs edita.
                    description: daBase?.descricao || item.description,
                    category: daBase?.categoria || item.category,
                    unit: daBase?.unidade || item.unit,
                    defaultUnitPrice,
                    priceSource: temPreco
                        ? pv.baseNome
                        : (defaultUnitPrice == null ? null : priceSet?.source),
                    priceDetail: temPreco ? daBase!.observacoes : null,
                    pricebookItemId: daBase?.itemId ?? null,
                };
            });
            const categories = [...new Set(items.map(item => item.category))];
            const pricedItems = items.filter(item => item.defaultUnitPrice != null).length;

            res.json({
                items,
                categories,
                total: items.length,
                context: {
                    uf,
                    priceSource: pv.baseNome || priceSet?.source || null,
                    pricedItems,
                    totalItems: items.length,
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

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
            const { items, versaoAtual, expectedUpdatedAt, scope } = req.body;
            const budget = await BudgetService.updateBudgetItems(req.params.id, versaoAtual, items, expectedUpdatedAt, scope);
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

    static async exportHighlinePv(req: Request, res: Response) {
        try {
            const { buffer, filename } = await generateHighlinePv(req.params.id);
            res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
}
