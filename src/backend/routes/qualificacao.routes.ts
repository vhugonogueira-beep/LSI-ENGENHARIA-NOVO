import { Router } from 'express';
import { QualificacaoController } from '../controllers/qualificacao.controller';

const router = Router();
router.get('/tipos', QualificacaoController.tipos);
router.get('/municipios', QualificacaoController.municipios);
router.get('/', QualificacaoController.list);
router.post('/', QualificacaoController.create);
router.put('/:id', QualificacaoController.update);
router.delete('/:id', QualificacaoController.remove);

export default router;
