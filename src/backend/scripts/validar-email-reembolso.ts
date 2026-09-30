/**
 * Confere o corpo do e-mail corporativo contra o caso real que expôs os
 * problemas: o reembolso do serralheiro de Marabá (PAMRB008).
 *
 * Roda o gerador direto, sem HTTP e sem login, e verifica o que foi corrigido:
 * máscara de CPF e de chave PIX, ausência dos campos bancários num pagamento
 * PIX, "N/A" fora do corpo, saudação pela hora e motivo sem repetir a descrição.
 *
 *   npx tsx src/backend/scripts/validar-email-reembolso.ts
 */
import { gerarEmailCorporativo, type DadosEmail } from '../services/email-corporativo.service';
import { nomearAnexo } from '../services/nomear-anexo.service';

const dados: DadosEmail = {
    tipo: 'REEMBOLSO',
    tipo_demanda: 'IMPLANTACAO',
    site: 'PAMRB008',
    nome_site: 'PAMBA48',
    cliente: 'CLARO',
    sharing: 'Highline do Brasil',
    nome_colaborador: 'VICTOR HUGO NOGUEIRA DA SILVA',
    favorecido: 'VICTOR HUGO NOGUEIRA DA SILVA',
    cpf_colaborador: '80460020200',
    cpf_cnpj_pagamento: '80460020200',
    descricao: 'Pagamento de Serralheiro Marabá - Valdir Pereira da Silva',
    // Mesmo texto da descrição: era assim no e-mail real, e saía duas vezes.
    motivo_reembolso: 'Pagamento de Serralheiro Marabá - Valdir Pereira da Silva',
    forma_pagamento: 'PIX',
    pix: '91981047902',
    tipo_pix: 'TELEFONE',
    banco: 'Banco Inter',
    // "N/A" digitado no cadastro — saía no corpo como se fosse informação.
    agencia: 'N/A',
    conta: 'N/A',
    tipo_conta: 'CORRENTE',
    // O valor do processo é R$ 650 e este depósito é de R$ 325. Antes o
    // controller mandava 325 nos dois, e o e-mail dizia "contratado R$ 325,
    // saldo R$ 0" — como se o serviço estivesse quitado. O saldo não é passado
    // de propósito: quero exercitar o cálculo do serviço.
    valor_pagamento: 325,
    valor_total: 650,
    valor_pago: 0,
    data_pagamento: '2026-09-16',
    itens_reembolso: [{ data: '2026-09-14', descricao: 'Serralheiro — Valdir Pereira da Silva', categoria: 'SERVICO', valor: 325 }],
    referencia: 'REE-2026-0041 · Depósito 1 de 2',
};

const { assunto, html } = gerarEmailCorporativo(dados);
const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const checagens: [string, boolean][] = [
    ['CPF mascarado (804.600.202-00)', texto.includes('804.600.202-00')],
    ['CPF cru não aparece', !texto.includes('80460020200')],
    ['chave PIX telefone só com dígitos', texto.includes('91981047902')],
    ['sem parênteses/hífen na chave', !texto.includes('(91) 98104-7902')],
    ['tipo da chave por extenso', texto.toLowerCase().includes('chave do tipo telefone')],
    ['sem "N/A" no corpo', !/\bN\/A\b/i.test(texto)],
    ['sem linha de Agência', !texto.includes('AGÊNCIA')],
    ['sem linha de Conta', !/\bCONTA\b/.test(texto.replace('TIPO DA CONTA', ''))],
    ['motivo não repete a descrição', (texto.match(/Serralheiro Marabá/g) || []).length <= 1],
    ['saudação conforme a hora', /Bom dia!|Boa tarde!|Boa noite!/.test(texto)],
    ['assunto com origem da atividade', assunto.startsWith('[IMPLANTAÇÃO]')],
    // No modelo, a caixa da chave PIX é a marinho #08213F com texto branco —
    // a terceira das três de destaque. O azul de ação fica na caixa do valor.
    ['chave PIX em caixa de destaque', html.includes('CHAVE PIX') && html.includes('#08213F')],
    ['contratado mostra o total do serviço', texto.includes('R$ 650,00')],
    ['saldo calculado (650 - 325)', texto.includes('R$ 325,00')],
    ['saldo não zerado indevidamente', !/SALDO REMANESCENTE\s*R\$ 0,00/i.test(texto)],
    ['anexo renomeado', nomearAnexo({
        tipo: 'COMPROVANTE_PAGAMENTO', site: 'PAMRB008', favorecido: 'VICTOR HUGO NOGUEIRA DA SILVA',
        nomeOriginal: 'WhatsApp Image 2026-09-14 at 15.41.20.jpeg',
    }) === 'COMPROVANTE_PAMRB008_VICTOR_HUGO_NOGUEIRA.jpeg'],
];

console.log(`\nAssunto: ${assunto}\n`);
let falhas = 0;
for (const [nome, ok] of checagens) {
    if (!ok) falhas++;
    console.log(`  ${ok ? 'OK  ' : 'FALHA'} ${nome}`);
}
console.log(`\n${checagens.length - falhas}/${checagens.length} verificações passaram.`);
process.exitCode = falhas === 0 ? 0 : 1;
