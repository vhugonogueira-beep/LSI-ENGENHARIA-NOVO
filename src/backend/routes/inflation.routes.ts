import { Router } from 'express';
import { InflationController } from '../controllers/inflation.controller';

const router = Router();

router.get('/indexes', InflationController.getIndexes);
router.post('/indexes', InflationController.registerIndexes);

export default router;
