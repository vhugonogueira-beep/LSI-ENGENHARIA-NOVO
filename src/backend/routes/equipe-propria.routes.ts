import { Router, Request, Response } from 'express';
import { prisma } from '../server';
import { requireAuth } from '../middleware/auth.middleware';
import { excluirExecucao, listarExecucoes, registrarExecucao, salvarRateio, sugestaoRateio } from '../services/equipe-propria.service';

// Execução por equipe própria e rateio de mão de obra (05/11/2026).
const router = Router();
router.use(requireAuth);
const tenantDe = async (req: Request) => (req as any).user?.tenantId || (await prisma.tenant.findFirst({ select: { id: true } }))?.id || '';
const responder = (res: Response, fn: () => Promise<any>, status = 200) =>
    fn().then(r => res.status(status).json(r ?? { ok: true })).catch((e: any) => res.status(400).json({ error: e.message }));

router.get('/', (req, res) => responder(res, () => listarExecucoes(String(req.query.atividade_id || ''))));
router.post('/', async (req, res) => responder(res, async () => registrarExecucao(await tenantDe(req), req.body || {}, (req as any).user?.email), 201));
router.delete('/:id', (req, res) => responder(res, () => excluirExecucao(req.params.id)));
router.get('/rateio/:contratacaoId', (req, res) => responder(res, () => sugestaoRateio(req.params.contratacaoId, req.query.inicio, req.query.fim)));
router.put('/rateio/:contratacaoId', async (req, res) => responder(res, async () => salvarRateio(await tenantDe(req), req.params.contratacaoId, req.body?.itens || [])));

export default router;
