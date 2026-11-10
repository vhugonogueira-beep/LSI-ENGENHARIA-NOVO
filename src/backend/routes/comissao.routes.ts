import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { requireAuth } from '../middleware/auth.middleware';
import {
    excluirAgente, fecharMes, listarAgentes, mesComissao, obterConfig, painelAno, reabrirMes, salvarAgente, salvarConfig,
} from '../services/comissao.service';

// Comissões (06/11/2026): valores de remuneração — só administrador.
const router = Router();
router.use(requireAuth);
router.use((req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.role !== 'ADMIN') return res.status(403).json({ error: 'Comissões: acesso só para administrador' });
    next();
});
const tenantDe = async (req: Request) => (req as any).user?.tenantId || (await prisma.tenant.findFirst({ select: { id: true } }))?.id || '';
const responder = (res: Response, fn: () => Promise<any>) => fn().then(r => res.json(r ?? { ok: true })).catch((e: any) => res.status(400).json({ error: e.message }));

router.get('/config', async (req, res) => responder(res, async () => obterConfig(await tenantDe(req))));
router.put('/config', async (req, res) => responder(res, async () => salvarConfig(await tenantDe(req), req.body || {}, (req as any).user?.email)));
router.get('/agentes', async (req, res) => responder(res, async () => listarAgentes(await tenantDe(req))));
router.post('/agentes', async (req, res) => responder(res, async () => salvarAgente(await tenantDe(req), req.body || {})));
router.put('/agentes/:id', async (req, res) => responder(res, async () => salvarAgente(await tenantDe(req), req.body || {}, req.params.id)));
router.delete('/agentes/:id', (req, res) => responder(res, () => excluirAgente(req.params.id)));
router.get('/ano/:ano', async (req, res) => responder(res, async () => painelAno(await tenantDe(req), Number(req.params.ano))));
router.get('/mes/:mes', async (req, res) => responder(res, async () => mesComissao(await tenantDe(req), req.params.mes)));
router.post('/mes/:mes/fechar', async (req, res) => responder(res, async () => fecharMes(await tenantDe(req), req.params.mes, typeof req.body?.meta_atingida === 'boolean' ? req.body.meta_atingida : null, (req as any).user?.email)));
router.post('/mes/:mes/reabrir', async (req, res) => responder(res, async () => reabrirMes(await tenantDe(req), req.params.mes, req.body?.motivo, (req as any).user)));

export default router;
