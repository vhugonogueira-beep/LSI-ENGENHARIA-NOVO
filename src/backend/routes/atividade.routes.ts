import { Router, Request, Response } from 'express';
import { definirMeta, metaDaAtividade } from '../services/meta-faturamento.service';
import {
    listAtividades,
    listAtividadesCarteira,
    getAtividade,
    createAtividade,
    updateAtividade,
    deleteAtividade,
    getAtividadeStats,
    getPendenciasAtividade,
    getLpusAtividade,
} from '../controllers/atividade.controller';

const router = Router();

router.get('/stats', getAtividadeStats);
router.get('/carteira', listAtividadesCarteira);
router.get('/', listAtividades);
router.get('/:id/pendencias', getPendenciasAtividade);
router.get('/:id/lpus', getLpusAtividade);
// Meta de faturamento (18/10/2026): mudar o mês exige gestor/admin e motivo.
router.get('/:id/meta', async (req: Request, res: Response) => {
    try { res.json(await metaDaAtividade(req.params.id)); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/:id/meta', async (req: Request, res: Response) => {
    try { await definirMeta(req.params.id, req.body || {}, (req as any).user); res.json(await metaDaAtividade(req.params.id)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/:id', getAtividade);
router.post('/', createAtividade);
router.put('/:id', updateAtividade);
router.delete('/:id', deleteAtividade);

export default router;
