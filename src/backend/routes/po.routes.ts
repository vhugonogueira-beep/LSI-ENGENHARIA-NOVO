// ATENÇÃO: estas rotas ainda não passam pelo requireAuth — a API está aberta. O papel do
// usuário (ADMIN) usado no cancelamento de faturamento chega pelo corpo da requisição,
// vindo da interface, então é um controle de UI, não de segurança. Ligar o requireAuth
// aqui (e o envio do token no front) é o passo que falta para valer como restrição real.
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import {
    createPO, listPOs, validarPO, liberarPO,
    uploadPOArquivo, downloadPOArquivo, deletePOArquivo,
    criarPODoPdf, listPOsGeral, updatePO, relerPO,
    deletePO, listLinhasDaPO, solicitarFaturamentoDeLinhas, atualizarFaturamentoLinha,
    cancelarLinhaFaturamento, gerarEmailDeFaturamento, autorizarLinha, baixarPlanilhaFaturamento,
} from '../controllers/po.controller';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
const uploadPOFile = (req: Request, res: Response, next: NextFunction) => {
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

router.get('/geral', listPOsGeral);
router.post('/upload', uploadPOFile, criarPODoPdf);
router.get('/', listPOs);
router.post('/', createPO);
router.put('/:id', updatePO);
router.delete('/:id', deletePO);
router.put('/:id/validar', validarPO);
router.put('/:id/liberar', liberarPO);
router.post('/:id/arquivos', uploadPOFile, uploadPOArquivo);
router.post('/:id/reler', relerPO);
router.get('/:id/linhas', listLinhasDaPO);

// Faturamento parcial por linha da PO
router.put('/linhas/:id/autorizacao', autorizarLinha);
router.post('/faturamento-linhas', solicitarFaturamentoDeLinhas);
router.post('/faturamento-linhas/email', gerarEmailDeFaturamento);
router.get('/faturamento-linhas/planilha', baixarPlanilhaFaturamento);
router.put('/faturamento-linhas/:id', atualizarFaturamentoLinha);
router.delete('/faturamento-linhas/:id', cancelarLinhaFaturamento);
router.get('/arquivos/:arquivoId/download', downloadPOArquivo);
router.delete('/arquivos/:arquivoId', deletePOArquivo);

export default router;
