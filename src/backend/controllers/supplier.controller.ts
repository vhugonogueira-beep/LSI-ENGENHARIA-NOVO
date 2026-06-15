import { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service';
import { prisma } from '../server';

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
            res.json(await SupplierService.updateSupplier(req.params.id, req.body));
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
}
