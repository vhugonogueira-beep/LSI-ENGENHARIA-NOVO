import { Router } from 'express';
import { FuncionarioController } from '../controllers/funcionario.controller';

const router = Router();

router.get('/', FuncionarioController.list);
router.post('/', FuncionarioController.create);
router.put('/:id', FuncionarioController.update);
router.delete('/:id', FuncionarioController.remove);

export default router;
