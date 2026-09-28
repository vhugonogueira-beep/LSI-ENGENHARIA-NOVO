import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import { createCliente, listClientes, updateCliente, uploadLogoCliente } from '../controllers/cliente.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
router.use(requireAuth);
router.get('/', listClientes);
router.post('/', createCliente);
router.put('/:id', updateCliente);
router.post('/:id/logo', upload.single('logo'), uploadLogoCliente);
export default router;
