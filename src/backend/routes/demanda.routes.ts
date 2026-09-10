import { Router } from 'express';
import {
    listDemandas,
    getDemanda,
    createDemanda,
    updateDemanda,
    deleteDemanda,
    getDemandaStats,
} from '../controllers/demanda.controller';

const router = Router();

router.get('/stats', getDemandaStats);
router.get('/', listDemandas);
router.get('/:id', getDemanda);
router.post('/', createDemanda);
router.put('/:id', updateDemanda);
router.delete('/:id', deleteDemanda);

export default router;
