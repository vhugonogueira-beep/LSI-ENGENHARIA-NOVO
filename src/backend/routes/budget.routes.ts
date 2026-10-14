import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BudgetController } from '../controllers/budget.controller';
import { editarPvOm, listarPvOm, salvarVinculos, sugestoesVinculo } from '../services/pv-om-highline.service';

const router = Router();
// Orçamento pronto (Excel ou PDF) para virar o Orçamento LS — lido em memória.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const uploadOrcamento = (req: Request, res: Response, next: NextFunction) => {
    upload.single('arquivo')(req, res, erro => {
        if (!erro) return next();
        const mensagem = erro instanceof multer.MulterError && erro.code === 'LIMIT_FILE_SIZE'
            ? 'O arquivo excede o limite de 15 MB' : erro.message;
        res.status(400).json({ error: mensagem });
    });
};

router.get('/', BudgetController.getAll);
router.post('/', BudgetController.create);
router.get('/highline-pv/catalog', BudgetController.highlinePvCatalog);
router.get('/:id', BudgetController.getById);
router.put('/:id/header', BudgetController.updateHeader);
router.put('/:id/items', BudgetController.updateItems);
// PV Highline ou Orçamento LS (só em rascunho).
router.put('/:id/modelo', BudgetController.definirModelo);
router.post('/:id/numero', BudgetController.numero);
// Lê o arquivo e devolve os itens para conferência; guarda o original.
router.post('/:id/importar', uploadOrcamento, BudgetController.importarArquivo);
router.get('/:id/importados', BudgetController.listarImportados);
router.get('/:id/importados/:nome', BudgetController.baixarImportado);
router.delete('/:id/importados/:nome', BudgetController.excluirImportado);
router.post('/:id/versions', BudgetController.createVersion);
router.get('/:id/export/html', BudgetController.exportHtml);
router.get('/:id/export/excel', BudgetController.exportExcel);
router.get('/:id/export/pv-highline', BudgetController.exportHighlinePv);
// PV O&M Highline (14/10/2026): operação Highline envia o Orçamento LS e a PV O&M.
const rota = (f: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { res.json(await f(req)); } catch (e: any) { res.status(400).json({ error: e.message }); }
};
router.get('/:id/pv-om', rota(req => listarPvOm(req.params.id)));
router.get('/:id/pv-om/vinculos', rota(req => sugestoesVinculo(req.params.id)));
router.put('/:id/pv-om/vinculos', rota(req => salvarVinculos(req.params.id, Array.isArray(req.body?.vinculos) ? req.body.vinculos : [])));
router.put('/:id/pv-om/itens', rota(req => editarPvOm(req.params.id, Array.isArray(req.body?.itens) ? req.body.itens : [])));

export default router;
