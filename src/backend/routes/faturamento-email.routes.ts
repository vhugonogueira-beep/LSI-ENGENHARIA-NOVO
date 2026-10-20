import { Router, Request, Response } from 'express';
import { gerarEmlFaturamento } from '../services/faturamento-linha.service';

// E-mail de faturamento em .eml com a planilha anexada (20/10/2026). Fica num
// arquivo próprio, montado antes das rotas de PO em server.ts.
const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const ids = String(req.query.ids || '').split(',').filter(Boolean);
        const { eml, filename } = await gerarEmlFaturamento(ids, {
            cliente: req.query.cliente as string | undefined,
            competencia: req.query.competencia as string | undefined,
        }, (req as any).user);
        res.setHeader('Content-Type', 'message/rfc822; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(eml);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
