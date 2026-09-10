import { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service';
import { prisma } from '../server';
import { sincronizarPendenciasFavorecido } from '../services/sincronizacao-pendencias.service';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class SupplierController {

    static async list(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            res.json(await SupplierService.getSuppliers(tenantId, page, limit));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const supplier = await SupplierService.getSupplierById(req.params.id);
            if (!supplier) return res.status(404).json({ error: 'Fornecedor não encontrado' });
            res.json(supplier);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) data.tenant_id = await getDemoTenantId();
            res.status(201).json(await SupplierService.createSupplier(data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const anterior = await prisma.supplier.findUnique({ where: { id: req.params.id } });
            if (!anterior) return res.status(404).json({ error: 'Fornecedor não encontrado' });
            const atualizado = await SupplierService.updateSupplier(req.params.id, req.body);
            await sincronizarPendenciasFavorecido('supplier', atualizado.id, anterior, atualizado);
            res.json(atualizado);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async remove(req: Request, res: Response) {
        try {
            res.json(await SupplierService.deleteSupplier(req.params.id));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async listCondicoesPagamento(req: Request, res: Response) {
        try {
            res.json(await SupplierService.listCondicoesPagamento(req.params.id));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async createCondicaoPagamento(req: Request, res: Response) {
        try {
            const { nome, percentual_entrada, percentual_saldo, gatilho_saldo, prazo_dias } = req.body;
            if (!nome || percentual_entrada == null || percentual_saldo == null) {
                return res.status(400).json({ error: 'nome, percentual_entrada e percentual_saldo são obrigatórios' });
            }
            if (Math.round(percentual_entrada + percentual_saldo) !== 100) {
                return res.status(400).json({ error: 'percentual_entrada + percentual_saldo deve somar 100' });
            }
            const condicao = await SupplierService.createCondicaoPagamento(req.params.id, {
                nome,
                percentual_entrada: parseFloat(percentual_entrada),
                percentual_saldo: parseFloat(percentual_saldo),
                gatilho_saldo: gatilho_saldo || 'CONCLUSAO',
                prazo_dias: prazo_dias != null ? parseInt(prazo_dias) : undefined,
            });
            res.status(201).json(condicao);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
