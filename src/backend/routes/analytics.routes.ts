import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();

router.get('/dispersion', AnalyticsController.getDispersion);

export default router;
