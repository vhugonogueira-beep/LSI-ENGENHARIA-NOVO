import { Router } from 'express';
import { EmpresaController } from '../controllers/empresa.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

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

// Rotas antigas de Operadora não são mais expostas aqui. Os dados permanecem
// na tabela legada e são consolidados pelo módulo /api/clientes.

export default router;
