import { Router } from 'express';
import { alterarStatus, atualizar, catalogo, convidar, gerarLink, historico, listar } from '../controllers/usuarios.controller';
import { requireAdmin } from '../middleware/auth.middleware';

// Toda a gestão de usuários é do administrador — inclusive a leitura.
const router = Router();
router.use(requireAdmin);

router.get('/catalogo', catalogo);
router.get('/', listar);
router.post('/', convidar);
router.put('/:id', atualizar);
router.put('/:id/status', alterarStatus);
router.post('/:id/link', gerarLink);
router.get('/:id/historico', historico);

export default router;
