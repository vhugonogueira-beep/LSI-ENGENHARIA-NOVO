import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import {
    listReembolsos, createReembolso, updateReembolso,
    atualizarStatusReembolso, deleteReembolso, gerarEmailReembolso, baixarEmailReembolsoEml,
    enviarPrestacaoContas, analisarPrestacaoContas,
    criarPagamentoReembolso, atualizarPagamentoReembolso, atualizarStatusPagamentoReembolso,
    excluirPagamentoReembolso, anexarMemoriaCalculo, baixarArquivoReembolso, removerArquivoReembolso,
} from '../controllers/reembolso.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
const uploadMemoria = (req: Request, res: Response, next: NextFunction) => {
    upload.single('arquivo')(req, res, erro => {
        if (!erro) return next();
        const mensagem = erro instanceof multer.MulterError && erro.code === 'LIMIT_FILE_SIZE'
            ? 'O arquivo excede o limite de 100 MB' : erro.message;
        res.status(400).json({ error: mensagem });
    });
};

router.get('/', listReembolsos);
router.put('/pagamentos/:pagamentoId', atualizarPagamentoReembolso);
router.put('/pagamentos/:pagamentoId/status', atualizarStatusPagamentoReembolso);
router.delete('/pagamentos/:pagamentoId', excluirPagamentoReembolso);
router.get('/arquivos/:arquivoId/download', baixarArquivoReembolso);
router.delete('/arquivos/:arquivoId', removerArquivoReembolso);
router.post('/', createReembolso);
router.post('/:id/pagamentos', criarPagamentoReembolso);
router.post('/:id/arquivos-calculo', uploadMemoria, anexarMemoriaCalculo);
router.put('/:id', updateReembolso);
router.put('/:id/status', atualizarStatusReembolso);
router.post('/:id/email', gerarEmailReembolso);
router.get('/:id/email.eml', baixarEmailReembolsoEml);
router.post('/:id/prestacao/enviar', enviarPrestacaoContas);
router.post('/:id/prestacao/analisar', analisarPrestacaoContas);
router.delete('/:id', deleteReembolso);

export default router;
