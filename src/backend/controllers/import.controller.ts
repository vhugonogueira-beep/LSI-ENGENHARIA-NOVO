import { Request, Response } from 'express';
import { ImportService } from '../services/import.service';
import { prisma } from '../server';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class ImportController {

    static async upload(req: Request, res: Response) {
        try {
            const file = req.file;
            if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

            const tenantId = (req.body.tenant_id as string) || await getDemoTenantId();
            const supplierId = req.body.supplier_id;
            const pricebookId = req.body.pricebook_id;

            if (!supplierId || !pricebookId) {
                return res.status(400).json({ error: 'supplier_id e pricebook_id são obrigatórios' });
            }

            // Detect file type
            const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
            let fileType = 'XLSX';
            if (ext === 'csv') fileType = 'CSV';
            else if (ext === 'xls') fileType = 'XLS';

            const customMapping = req.body.mapping ? JSON.parse(req.body.mapping) : undefined;

            const result = await ImportService.startImport(
                tenantId,
                supplierId,
                pricebookId,
                file.originalname,
                fileType,
                file.buffer,
                customMapping
            );

            res.json(result);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async getBatch(req: Request, res: Response) {
        try {
            const batch = await ImportService.getImportBatch(req.params.id);
            if (!batch) return res.status(404).json({ error: 'Batch não encontrado' });
            res.json(batch);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async confirmBatch(req: Request, res: Response) {
        try {
            const { rows } = req.body;
            if (!rows || !Array.isArray(rows)) {
                return res.status(400).json({ error: 'Campo rows (array) é obrigatório' });
            }

            const result = await ImportService.confirmImport(req.params.id, rows);
            res.json(result);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
