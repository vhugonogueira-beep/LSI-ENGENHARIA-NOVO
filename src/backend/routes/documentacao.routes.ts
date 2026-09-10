import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import {
    createRequisitoDocumental,
    listRequisitosDocumentais,
    gerarMatrizParaAtividade,
    listDocumentosAtividade,
    updateDocumentoAtividade,
    getPendenciasPosRFI,
    uploadDocumentoArquivo,
    downloadDocumentoArquivo,
    deleteDocumentoArquivo,
    getPainelDocumental,
} from '../controllers/documentacao.controller';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
const uploadDocument = (req: Request, res: Response, next: NextFunction) => {
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

router.get('/requisitos', listRequisitosDocumentais);
router.post('/requisitos', createRequisitoDocumental);
router.post('/atividades/:atividade_id/gerar-matriz', gerarMatrizParaAtividade);
router.get('/atividades/:atividade_id', listDocumentosAtividade);
router.put('/documentos/:id', updateDocumentoAtividade);
router.post('/documentos/:id/arquivos', uploadDocument, uploadDocumentoArquivo);
router.get('/arquivos/:arquivo_id/download', downloadDocumentoArquivo);
router.delete('/arquivos/:arquivo_id', deleteDocumentoArquivo);
router.get('/pendencias-pos-rfi', getPendenciasPosRFI);
router.get('/painel', getPainelDocumental);

export default router;
