import { Router } from 'express';
import {
    listAtividades,
    listAtividadesCarteira,
    getAtividade,
    createAtividade,
    updateAtividade,
    deleteAtividade,
    getAtividadeStats,
    getPendenciasAtividade,
    getLpusAtividade,
} from '../controllers/atividade.controller';

const router = Router();

router.get('/stats', getAtividadeStats);
router.get('/carteira', listAtividadesCarteira);
router.get('/', listAtividades);
router.get('/:id/pendencias', getPendenciasAtividade);
router.get('/:id/lpus', getLpusAtividade);
router.get('/:id', getAtividade);
router.post('/', createAtividade);
router.put('/:id', updateAtividade);
router.delete('/:id', deleteAtividade);

export default router;
