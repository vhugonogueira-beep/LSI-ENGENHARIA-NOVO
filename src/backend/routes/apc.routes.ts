import { Router } from 'express';
import { createAPC, listAPCs, updateAPCStatus } from '../controllers/apc.controller';

const router = Router();

router.get('/', listAPCs);
router.post('/', createAPC);
router.put('/:id/status', updateAPCStatus);

export default router;
