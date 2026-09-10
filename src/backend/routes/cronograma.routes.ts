import { Router } from 'express';
import {
    createCronogramaItem,
    listCronogramaItens,
    updateCronogramaItem,
    deleteCronogramaItem,
    moverCronogramaItem,
    startCronograma,
    exportCronogramaHtml,
    listModeloCronograma,
    aplicarModeloCronograma,
    salvarComoModelo,
} from '../controllers/cronograma.controller';

const router = Router();

// rotas específicas antes das genéricas com :id
router.get('/modelo', listModeloCronograma);
router.get('/atividades/:atividade_id/export/html', exportCronogramaHtml);
router.post('/atividades/:atividade_id/aplicar-modelo', aplicarModeloCronograma);
router.post('/atividades/:atividade_id/salvar-modelo', salvarComoModelo);
router.post('/atividades/:atividade_id/start', startCronograma);

router.get('/', listCronogramaItens);
router.post('/', createCronogramaItem);
router.put('/:id/mover', moverCronogramaItem);
router.put('/:id', updateCronogramaItem);
router.delete('/:id', deleteCronogramaItem);

export default router;
