import { Request, Response } from 'express';
import { listEmailRouting, saveEmailRouting } from '../services/email-routing.service';
import { EMAIL_ROUTING_TYPES, PAYMENT_PROCESS_TYPES, PAYMENT_PURPOSES, type EmailRoutingType } from '../services/payment-domain.service';

export async function listRouting(req: Request, res: Response) {
    try { res.json(await listEmailRouting((req as any).user.tenantId)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function updateRouting(req: Request, res: Response) {
    try {
        const tipo = String(req.params.tipo || '').toUpperCase() as EmailRoutingType;
        if (!EMAIL_ROUTING_TYPES.includes(tipo)) return res.status(400).json({ error: 'Perfil de roteamento inválido' });
        res.json(await saveEmailRouting((req as any).user.tenantId, tipo, req.body.para, req.body.cc));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export function listPaymentDomain(_req: Request, res: Response) {
    res.json({ finalidades: PAYMENT_PURPOSES, processos: PAYMENT_PROCESS_TYPES });
}
