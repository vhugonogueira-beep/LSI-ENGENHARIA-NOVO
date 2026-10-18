import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
    upsertRegistroExecucao,
    getRegistroExecucao,
    createRFI,
    listRFIs,
    anexarArquivoRFI,
    baixarArquivoRFI,
} from '../controllers/execucao.controller';

const router = Router();

router.put('/atividades/:atividade_id', upsertRegistroExecucao);
router.get('/atividades/:atividade_id', getRegistroExecucao);
router.get('/rfis', listRFIs);
router.post('/rfis', createRFI);
// Excel/PDF do relatório enviado ao cliente (até 25 MB, lido em memória).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const uploadRelatorio = (req: Request, res: Response, next: NextFunction) => upload.single('arquivo')(req, res, erro => {
    if (!erro) return next();
    res.status(400).json({ error: erro instanceof multer.MulterError && erro.code === 'LIMIT_FILE_SIZE' ? 'O arquivo excede o limite de 25 MB' : erro.message });
});
router.post('/rfis/:id/arquivo', uploadRelatorio, anexarArquivoRFI);
router.get('/rfis/:id/arquivo', baixarArquivoRFI);

export default router;
