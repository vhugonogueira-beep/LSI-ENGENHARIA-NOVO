import { Router } from 'express';
import {
    createRegraFaturamento,
    listRegrasFaturamento,
    getAvaliacaoFaturamento,
    createAceite,
    startFaturamento,
    listFaturamentos,
    getFaturamento,
    updateStatusFaturamento,
    registrarRecebimento,
    exportPlanilhaFaturamento,
} from '../controllers/faturamento.controller';

const router = Router();

router.get('/regras', listRegrasFaturamento);
router.post('/regras', createRegraFaturamento);
router.get('/avaliacao/:atividade_id', getAvaliacaoFaturamento);
router.post('/aceites', createAceite);

router.post('/start', startFaturamento);
router.get('/', listFaturamentos);
router.get('/:id', getFaturamento);
router.put('/:id/status', updateStatusFaturamento);
router.post('/:id/recebimento', registrarRecebimento);
router.get('/:id/export.xlsx', exportPlanilhaFaturamento);

export default router;
