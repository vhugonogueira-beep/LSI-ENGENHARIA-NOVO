import { Router } from 'express';
import {
    createNegociacao,
    listNegociacoes,
    getNegociacao,
    registrarContraproposta,
    decidirContraproposta,
} from '../controllers/negociacao.controller';

const router = Router();

router.get('/', listNegociacoes);
router.get('/:id', getNegociacao);
router.post('/', createNegociacao);
router.post('/:id/contrapropostas', registrarContraproposta);
router.put('/:id/contrapropostas/:rodadaId/decisao', decidirContraproposta);

export default router;
