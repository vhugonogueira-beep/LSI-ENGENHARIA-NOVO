import { Router } from 'express';
import { BdiController } from '../controllers/bdi.controller';

const router = Router();

router.get('/suggest', BdiController.getSuggestion);
router.post('/rules', BdiController.saveRule);

export default router;
