/**
 * Mesmas conferências do reembolso, agora no e-mail de PROGRAMAÇÃO DE PAGAMENTO
 * e na FORMALIZAÇÃO — as correções vivem no serviço compartilhado e precisam
 * valer para todos os tipos, não só para reembolso.
 *
 *   npx tsx src/backend/scripts/validar-email-pagamento.ts
 */
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';

function montar(tipo: TipoSolicitacao): DadosEmail {
    return {
        tipo,
        tipo_demanda: 'IMPLANTACAO',
        site: 'PAMRB008',
        nome_site: 'Marabá — PA',
        cliente: 'CLARO',
        sharing: 'Highline do Brasil',
        fornecedor: 'Rodrigo Auto Center',
        favorecido: 'Rodrigo Auto Center',
        area: 'OUTROS',
        descricao: 'Manutenção do veículo da equipe',
        cpf_cnpj: '80460020200',
        cpf_cnpj_pagamento: '12345678000199',
        forma_pagamento: 'PIX',
        pix: '91981047902',
        tipo_pix: 'TELEFONE',
        banco: 'Banco Inter',
        agencia: 'N/A',
        conta: 'N/A',
        tipo_conta: 'CORRENTE',
        valor_total: 1400,
        valor_pago: 0,
        valor_pagamento: 700,
        data_pagamento: '2026-09-16',
    };
}

const tipos: TipoSolicitacao[] = ['PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_PAGAMENTO', 'COMPRA_MATERIAL', 'ADIANTAMENTO'];
let falhas = 0;

for (const tipo of tipos) {
    const { assunto, html } = gerarEmailCorporativo(montar(tipo));
    const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const checagens: [string, boolean][] = [
        ['CNPJ mascarado', texto.includes('12.345.678/0001-99')],
        ['CNPJ cru fora', !texto.includes('12345678000199')],
        ['chave PIX mascarada', texto.includes('(91) 98104-7902')],
        ['chave PIX crua fora', !texto.includes('91981047902')],
        ['sem "N/A"', !/\bN\/A\b/i.test(texto)],
        ['sem Agência', !texto.includes('AGÊNCIA')],
        ['saudação pela hora', /Bom dia!|Boa tarde!|Boa noite!/.test(texto)],
        ['origem no assunto', assunto.startsWith('[IMPLANTAÇÃO]')],
        ['chave PIX em caixa de destaque', html.includes('CHAVE PIX') && html.includes('#08213F')],
    ];

    const ruins = checagens.filter(([, ok]) => !ok);
    falhas += ruins.length;
    console.log(`\n── ${tipo}`);
    console.log(`   ${assunto}`);
    for (const [nome, ok] of checagens) if (!ok) console.log(`   FALHA ${nome}`);
    if (ruins.length === 0) console.log(`   ${checagens.length}/${checagens.length} OK`);
}

console.log(falhas === 0 ? '\nTodos os tipos passaram.\n' : `\n${falhas} falha(s).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
