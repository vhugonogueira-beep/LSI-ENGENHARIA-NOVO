import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import { download, list, remove, upload } from '../controllers/payment-attachment.controller';

const router = Router();
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 10 } }).array('arquivos', 10);
router.use(requireAuth);
router.get('/:id/download', download);
router.get('/:ownerType/:ownerId', list);
router.post('/:ownerType/:ownerId', (req: Request, res: Response, next: NextFunction) => receive(req, res, error => error ? res.status(400).json({ error: error.message }) : next()), upload);
router.delete('/:id', remove);
export default router;
