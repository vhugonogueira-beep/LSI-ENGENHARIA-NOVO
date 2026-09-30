import { Router } from 'express';
import { aceitarConvite, login, me, verConvite } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', requireAuth, me);
// Públicas: quem abre o link ainda não tem sessão.
router.get('/convite/:token', verConvite);
router.post('/convite/:token', aceitarConvite);

export default router;
