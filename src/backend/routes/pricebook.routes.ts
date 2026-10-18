import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { PriceBookController } from '../controllers/pricebook.controller';
import { prisma } from '../server';
import { criarBase, importarItensPlanilha, restaurarPvHighline } from '../services/lpu-cadastro.service';

const router = Router();

// Migração de mão única das LPUs que viviam no localStorage do navegador.
router.post('/importar-locais', PriceBookController.importarLocais);

// Cadastro pela tela (18/10/2026): nova base classificada, itens por planilha e
// a PV Padrão Highline restaurada do catálogo oficial.
const tenantDe = async (req: Request) => ((req as any).tenantId as string) || (await prisma.tenant.findFirst())!.id;
const rota = (f: (req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
    try { res.status(status).json(await f(req)); } catch (e: any) { res.status(400).json({ error: e.message }); }
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const uploadPlanilha = (req: Request, res: Response, next: NextFunction) => upload.single('arquivo')(req, res, erro => {
    if (!erro) return next();
    res.status(400).json({ error: erro instanceof multer.MulterError && erro.code === 'LIMIT_FILE_SIZE' ? 'A planilha excede 15 MB' : erro.message });
});
router.post('/nova', rota(async req => criarBase(await tenantDe(req), req.body || {}), 201));
router.post('/restaurar-pv-highline', rota(async req => restaurarPvHighline(await tenantDe(req))));
router.post('/:id/importar-planilha', uploadPlanilha, rota(async req => {
    const f = (req as any).file as Express.Multer.File | undefined;
    if (!f) throw new Error('Envie a planilha (Excel ou CSV)');
    return importarItensPlanilha(req.params.id, f.buffer);
}));

// PriceBook CRUD
router.get('/', PriceBookController.list);
router.get('/lookup-price', PriceBookController.lookupPrice);
router.get('/:id', PriceBookController.getById);
router.post('/', PriceBookController.create);
router.put('/:id', PriceBookController.update);
// excluir a base inteira — arquiva se algum orçamento ainda depende dela
router.delete('/:id', PriceBookController.remove);

// PriceBook Items
router.get('/:id/items', PriceBookController.listItems);
// relatório de códigos repetidos — sinaliza, nunca funde nem sobrescreve
router.get('/:id/duplicidades', PriceBookController.duplicidades);
router.post('/:id/items', PriceBookController.createItem);
// editar / remover item — rotas de dois segmentos, por isso não colidem com '/:id'
router.put('/items/:id', PriceBookController.updateItem);
router.delete('/items/:id', PriceBookController.deleteItem);

export default router;
