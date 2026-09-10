// Gera os três exemplos preenchidos + o template cru, para conferir no navegador.
//   npx tsx src/backend/scripts/exemplo-email.ts [pasta-de-saida]
import fs from 'fs';
import path from 'path';
import { gerarEmailCorporativo, lerTemplateCru, DadosEmail } from '../services/email-corporativo.service';

const saida = process.argv[2] || path.resolve(process.cwd(), '.tmp', 'emails');
fs.mkdirSync(saida, { recursive: true });

const comum = {
    logo_url: 'https://exemplo.lsoffice.com.br/logo-ls-office.png',
    site: 'PAMRB008', nome_site: 'PAMBA48', cliente: 'CLARO', sharing: 'Highline do Brasil',
    area: 'Engenharia / Implantação', responsavel_solicitacao: 'Victor Hugo',
    centro_custo: 'IMPLANTACAO-PA', po: '088628',
    nome_solicitante: 'Victor Hugo', cargo_solicitante: 'Diretor Operacional',
    email_solicitante: 'victor.hugo@lsoffice.com.br', telefone_solicitante: '(94) 99999-0000',
    referencia: 'LSO-FIN-2026-0142 · gerado pelo LS Office ERP em 07/09/2026',
};

const exemplos: Record<string, DadosEmail> = {
    'programacao-pagamento': {
        ...comum, tipo: 'PROGRAMACAO_PAGAMENTO',
        fornecedor: 'Antônio Fábio Chagas Ferreira', cpf_cnpj: '123.456.789-00',
        descricao: 'Mão de obra de montagem de estrutura metálica',
        contrato: 'CT-2026-018',
        valor_total: 18000, valor_pago: 5400, valor_pagamento: 7580,
        condicao_pagamento: '30% entrada · 70% saldo',
        condicao_liberacao_saldo: 'Entrega integral dos materiais no site',
        data_pagamento: '2026-09-20', competencia: '09/2026',
        favorecido: 'Antônio Fábio Chagas Ferreira', cpf_cnpj_pagamento: '123.456.789-00',
        banco: 'Banco do Brasil', agencia: '1234-5', conta: '56789-0', tipo_conta: 'Corrente',
        pix: '123.456.789-00', tipo_pix: 'CPF',
        nota_fiscal: 'NF 4521', diretorio: 'Financeiro/2026/09/PAMRB008',
        anexos: ['Contrato', 'Dados bancários', 'Nota Fiscal'],
        observacoes: 'Pagamento vinculado à conclusão da etapa de montagem, conforme cronograma.',
    },
    'reembolso': {
        ...comum, tipo: 'REEMBOLSO',
        nome_colaborador: 'Marcos Andrade', cpf_colaborador: '987.654.321-00',
        data_despesa: '2026-09-03', motivo_reembolso: 'Deslocamento e hospedagem para vistoria no site',
        itens_reembolso: [
            { data: '2026-09-02', descricao: 'Combustível — trecho Marabá/Parauapebas', categoria: 'COMBUSTIVEL', valor: 320.5 },
            { data: '2026-09-02', descricao: 'Pedágio ida e volta', categoria: 'PEDAGIO', valor: 46 },
            { data: '2026-09-02', descricao: 'Hospedagem 1 diária', categoria: 'HOSPEDAGEM', valor: 210 },
            { data: '2026-09-03', descricao: 'Refeições da equipe (3 pessoas)', categoria: 'ALIMENTACAO', valor: 187.4 },
        ],
        data_pagamento: '2026-09-15', competencia: '09/2026',
        favorecido: 'Marcos Andrade', cpf_cnpj_pagamento: '987.654.321-00',
        banco: 'Caixa Econômica Federal', agencia: '0456', conta: '00012345-6', tipo_conta: 'Corrente',
        pix: 'marcos.andrade@lsoffice.com.br', tipo_pix: 'E-mail',
        anexos: ['Recibo', 'Comprovante', 'Fotos'],
    },
    'compra-material': {
        ...comum, tipo: 'COMPRA_MATERIAL',
        fornecedor: 'Elétrica Norte Materiais Ltda', cpf_cnpj: '11.222.333/0001-81',
        descricao: 'Materiais elétricos para padrão de entrada',
        itens_materiais: [
            { descricao: 'Cabo elétrico 1kV 25mm²', quantidade: 100, unidade: 'm', valor_unitario: 25 },
            { descricao: 'Disjuntor bipolar 100A', quantidade: 2, unidade: 'un', valor_unitario: 350 },
            { descricao: 'Eletroduto corrugado KANAFLEX Ø1"', quantidade: 60, unidade: 'm', valor_unitario: 16.11 },
        ],
        frete: 280, outras_despesas: 0,
        local_entrega: 'Site PAMRB008 — Rod. PA-275, km 12, Parauapebas/PA',
        prazo_entrega: '5 dias úteis', responsavel_recebimento: 'Encarregado de campo — Marcos Andrade',
        condicao_pagamento: 'À vista contra entrega',
        data_pagamento: '2026-09-18', competencia: '09/2026',
        favorecido: 'Elétrica Norte Materiais Ltda', razao_social: 'Elétrica Norte Comércio de Materiais Ltda',
        cpf_cnpj_pagamento: '11.222.333/0001-81',
        banco: 'Itaú', agencia: '7788', conta: '11223-4', tipo_conta: 'Corrente',
        pix: '11222333000181', tipo_pix: 'CNPJ',
        orcamento: 'ORC-2026-337', anexos: ['Orçamento / Cotação', 'Dados bancários'],
    },
};

for (const [nome, dados] of Object.entries(exemplos)) {
    const { assunto, html } = gerarEmailCorporativo(dados);
    fs.writeFileSync(path.join(saida, `exemplo-${nome}.html`), html, 'utf8');
    console.log(`exemplo-${nome}.html`);
    console.log(`   assunto: ${assunto}`);
}
fs.writeFileSync(path.join(saida, 'template-cru.html'), lerTemplateCru(), 'utf8');
console.log('template-cru.html (com as variáveis {{...}})');
console.log('');
console.log('pasta:', saida);
