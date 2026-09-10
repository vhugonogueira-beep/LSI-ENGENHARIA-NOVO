import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import {
    getTemplate, putTemplate,
    getContratoDaContratacao, postGerarContrato, putStatusContrato, exportContratoHtml,
    uploadContratoArquivo, downloadContratoArquivo, deleteContratoArquivo,
} from '../controllers/contrato.controller';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
const uploadContrato = (req: Request, res: Response, next: NextFunction) => {
    upload.single('arquivo')(req, res, error => {
        if (error) {
            const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
                ? 'O arquivo excede o limite de 25 MB'
                : error.message;
            return res.status(400).json({ error: message });
        }
        next();
    });
};

router.get('/templates', getTemplate);
router.put('/templates/:id', putTemplate);

router.get('/contratacoes/:contratacaoId', getContratoDaContratacao);
router.post('/contratacoes/:contratacaoId', postGerarContrato);

router.put('/:id/status', putStatusContrato);
router.get('/:id/export/html', exportContratoHtml);
router.post('/:id/arquivos', uploadContrato, uploadContratoArquivo);
router.get('/arquivos/:arquivoId/download', downloadContratoArquivo);
router.delete('/arquivos/:arquivoId', deleteContratoArquivo);

export default router;
