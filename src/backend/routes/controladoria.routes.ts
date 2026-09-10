import { Router } from 'express';
import { Request, Response } from 'express';
import { apurarControladoria } from '../services/controladoria.service';

const router = Router();

// Cadeia receita -> impostos -> custo comprometido/pago -> margem (Blueprint, secao 14)
router.get('/', async (req: Request, res: Response) => {
    try {
        const mes = typeof req.query.mes === 'string' && req.query.mes !== 'TODOS'
            ? req.query.mes
            : undefined;
        res.json(await apurarControladoria(mes));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
