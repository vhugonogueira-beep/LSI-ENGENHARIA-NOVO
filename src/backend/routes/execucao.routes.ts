import { Router } from 'express';
import {
    upsertRegistroExecucao,
    getRegistroExecucao,
    createRFI,
    listRFIs,
} from '../controllers/execucao.controller';

const router = Router();

router.put('/atividades/:atividade_id', upsertRegistroExecucao);
router.get('/atividades/:atividade_id', getRegistroExecucao);
router.get('/rfis', listRFIs);
router.post('/rfis', createRFI);

export default router;
