import { Request, Response } from 'express';
import { aplicarComprovanteRecebido, deletePaymentAttachment, listPaymentAttachments, loadPaymentAttachment, storePaymentAttachments } from '../services/payment-attachment.service';

const user = (req: Request) => (req as any).user as { tenantId: string; email: string };

export async function list(req: Request, res: Response) {
    try { res.json(await listPaymentAttachments(user(req).tenantId, req.params.ownerType.toUpperCase(), req.params.ownerId)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
}
export async function upload(req: Request, res: Response) {
    try {
        const files = (req.files || []) as Express.Multer.File[];
        if (!files.length) return res.status(400).json({ error: 'Selecione pelo menos um arquivo' });
        const tipo = String(req.body.tipo || '');
        const ownerType = req.params.ownerType.toUpperCase();
        const salvos = await storePaymentAttachments(user(req).tenantId, user(req).email, ownerType, req.params.ownerId, tipo, files);
        // Só o comprovante fecha o ciclo. Nota fiscal e foto do serviço são
        // documentação: não dizem que o dinheiro saiu.
        if (tipo === 'COMPROVANTE_PAGAMENTO') {
            await aplicarComprovanteRecebido(ownerType, req.params.ownerId);
        }
        res.status(201).json(salvos);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}
export async function download(req: Request, res: Response) {
    try {
        const { record, buffer } = await loadPaymentAttachment(user(req).tenantId, req.params.id);
        res.setHeader('Content-Type', record.mime_type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(record.nome_original)}`);
        res.send(buffer);
    } catch (error: any) { res.status(404).json({ error: error.message }); }
}
export async function remove(req: Request, res: Response) {
    try { await deletePaymentAttachment(user(req).tenantId, req.params.id); res.json({ ok: true }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
}
