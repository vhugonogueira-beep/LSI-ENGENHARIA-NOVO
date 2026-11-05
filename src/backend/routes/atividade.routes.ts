import { Router, Request, Response } from 'express';
import { definirMeta, metaDaAtividade } from '../services/meta-faturamento.service';
import multer from 'multer';
import { custoRealDaAtividade, lerAnexoFinanceiro, lerArquivoFinanceiro, lerDocumentosDaAtividade } from '../services/custo-real.service';
import { requireAuth } from '../middleware/auth.middleware';
import { prisma } from '../server';
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
// Custo real consolidado (04/11/2026): tudo o que foi pago na atividade + leitura
// por IA dos comprovantes e NFs. Dados financeiros: exige login.
const tenantDe = async (req: Request) => (req as any).user?.tenantId || (await prisma.tenant.findFirst({ select: { id: true } }))?.id || '';
router.get('/:id/custo-real', requireAuth, async (req: Request, res: Response) => {
    try { res.json(await custoRealDaAtividade(req.params.id, await tenantDe(req))); }
    catch (e: any) { res.status(e.status || 400).json({ error: e.message }); }
});
router.post('/:id/custo-real/ler', requireAuth, async (req: Request, res: Response) => {
    try { res.json(await lerDocumentosDaAtividade(req.params.id, await tenantDe(req), Boolean(req.body?.forcar))); }
    catch (e: any) { res.status(e.status || 400).json({ error: e.message }); }
});
// Lê um comprovante antes de salvar (formalização: a data do pagamento vem dele).
const umArquivo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }).single('arquivo');
router.post('/custo-real/ler-arquivo', requireAuth, (req: Request, res: Response) => umArquivo(req, res, async erro => {
    try {
        if (erro) throw erro;
        const f = (req as any).file as Express.Multer.File | undefined;
        if (!f) throw new Error('Envie o comprovante');
        res.json(await lerArquivoFinanceiro(f.buffer, f.mimetype));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}));
router.post('/custo-real/anexos/:anexoId/ler', requireAuth, async (req: Request, res: Response) => {
    try { res.json(await lerAnexoFinanceiro(await tenantDe(req), req.params.anexoId)); }
    catch (e: any) { res.status(e.status || 400).json({ error: e.message }); }
});
router.get('/:id', getAtividade);
router.post('/', createAtividade);
router.put('/:id', updateAtividade);
router.delete('/:id', deleteAtividade);

export default router;
