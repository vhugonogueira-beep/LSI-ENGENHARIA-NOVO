import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import {
    deleteMyEmailSignature,
    getMyEmailSignature,
    uploadMyEmailSignature,
    viewMyEmailSignature,
    getMyProfile,
    updateMyProfile,
    changeMyPassword,
} from '../controllers/profile.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const receiveSignature = (req: Request, res: Response, next: NextFunction) => {
    upload.single('arquivo')(req, res, error => {
        if (!error) return next();
        const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'A assinatura deve ter no máximo 5 MB'
            : error.message;
        res.status(400).json({ error: message });
    });
};

router.use(requireAuth);
router.get('/', getMyProfile);
router.put('/', updateMyProfile);
router.put('/password', changeMyPassword);
router.get('/email-signature', getMyEmailSignature);
router.get('/email-signature/image', viewMyEmailSignature);
router.post('/email-signature', receiveSignature, uploadMyEmailSignature);
router.delete('/email-signature', deleteMyEmailSignature);

export default router;
