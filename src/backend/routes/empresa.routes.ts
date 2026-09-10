import { Router } from 'express';
import { EmpresaController } from '../controllers/empresa.controller';

const router = Router();

// Dados da LS Office (CNPJ, IE, endereco fiscal, logo, faturamento)
router.get('/', EmpresaController.get);
router.put('/', EmpresaController.salvar);

// Contas para recebimento
router.post('/contas', EmpresaController.criarConta);
router.put('/contas/:contaId', EmpresaController.atualizarConta);
router.delete('/contas/:contaId', EmpresaController.removerConta);

// Cartoes corporativos usados nas obras (bandeira + 4 ultimos digitos)
router.post('/cartoes', EmpresaController.salvarCartao);
router.put('/cartoes/:cartaoId', EmpresaController.salvarCartao);
router.delete('/cartoes/:cartaoId', EmpresaController.removerCartao);

// Operadoras — o logo entra no cabecalho dos documentos
router.get('/operadoras', EmpresaController.listarOperadoras);
router.put('/operadoras', EmpresaController.salvarOperadora);
router.delete('/operadoras/:operadoraId', EmpresaController.removerOperadora);

export default router;
