import { Router } from 'express';
import {
    createContratacao,
    listContratacoes,
    getContratacao,
    solicitarPagamento,
    atualizarStatusParcela,
    getFinanceiroAtividade,
    editarParcela,
    adicionarParcela,
    removerParcela,
    gerarEmailPagamento,
    baixarEmailPagamentoEml,
    cancelarSolicitacaoPagamento,
} from '../controllers/contratacao.controller';

const router = Router();

router.get('/', listContratacoes);
router.get('/:id', getContratacao);
router.post('/', createContratacao);
router.post('/parcelas/:parcelaId/solicitar-pagamento', solicitarPagamento);
router.post('/parcelas/:parcelaId/cancelar-solicitacao', cancelarSolicitacaoPagamento);
// E-mail de programação de pagamento no template corporativo da LS Office.
router.post('/parcelas/:parcelaId/email', gerarEmailPagamento);
// .eml para abrir no Outlook ja pronto para envio
router.get('/parcelas/:parcelaId/email.eml', baixarEmailPagamentoEml);
router.put('/parcelas/:parcelaId/status', atualizarStatusParcela);
// O valor a pagar é editável mesmo com condição de pagamento definida.
router.put('/parcelas/:parcelaId', editarParcela);
router.delete('/parcelas/:parcelaId', removerParcela);
router.post('/:id/parcelas', adicionarParcela);
router.get('/financeiro/:atividade_id', getFinanceiroAtividade);

export default router;
