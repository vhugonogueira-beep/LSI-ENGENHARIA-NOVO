import { Router } from 'express';
import {
    analisarPrestacaoConsolidada, atualizarPrestacaoConsolidada, criarPrestacaoConsolidada,
    enviarPrestacaoConsolidada, excluirPrestacaoConsolidada, listarPrestacoesConsolidadas,
} from '../controllers/prestacao-consolidada.controller';

const router = Router();
router.get('/', listarPrestacoesConsolidadas);
router.post('/', criarPrestacaoConsolidada);
router.put('/:id', atualizarPrestacaoConsolidada);
router.post('/:id/enviar', enviarPrestacaoConsolidada);
router.post('/:id/analisar', analisarPrestacaoConsolidada);
router.delete('/:id', excluirPrestacaoConsolidada);
export default router;
