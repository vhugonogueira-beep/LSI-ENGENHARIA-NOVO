import { Router } from 'express';
import { listPagamentos, anexarComprovante, removerComprovante, baixarComprovante } from '../controllers/pagamentos.controller';

const router = Router();

// Fila unica: parcelas de contrato + reembolsos
router.get('/', listPagamentos);
router.get('/comprovantes/:nome', baixarComprovante);
// origem lógica = PARCELA | REEMBOLSO | ADIANTAMENTO.
// Reembolso e adiantamento compartilham a estrutura financeira, mas não o rótulo de negócio.
router.post('/:origem/:id/comprovante', anexarComprovante);
router.delete('/:origem/:id/comprovante', removerComprovante);

export default router;
