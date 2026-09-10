import { Router } from 'express';
import {
    listAcionamentos,
    getAcionamento,
    createAcionamento,
    updateAcionamento,
    deleteAcionamento,
    criarAtividadeDoAcionamento,
} from '../controllers/acionamento.controller';

const router = Router();

router.get('/', listAcionamentos);
router.get('/:id', getAcionamento);
router.post('/', createAcionamento);
router.put('/:id', updateAcionamento);
router.delete('/:id', deleteAcionamento);
router.post('/:id/atividades', criarAtividadeDoAcionamento);

export default router;
