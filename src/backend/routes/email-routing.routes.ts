import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listPaymentDomain, listRouting, updateRouting } from '../controllers/email-routing.controller';

const router = Router();
router.use(requireAuth);
router.get('/routing', listRouting);
router.put('/routing/:tipo', updateRouting);
router.get('/domain', listPaymentDomain);
export default router;
