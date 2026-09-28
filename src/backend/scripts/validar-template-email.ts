/**
 * Guarda do template: confere que a reescrita visual não perdeu nenhum marcador
 * nem quebrou a substituição da assinatura.
 *
 * O template serve seis tipos de e-mail e é editado por motivos visuais. Um
 * `{{PLACEHOLDER}}` removido sem querer some silenciosamente — o e-mail sai sem
 * o dado e ninguém percebe até o financeiro cobrar.
 *
 *   npx tsx src/backend/scripts/validar-template-email.ts
 */
import fs from 'fs';
import path from 'path';
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';

const TEMPLATE = path.resolve(process.cwd(), 'src', 'backend', 'templates', 'email-corporativo-ls.html');
const bruto = fs.readFileSync(TEMPLATE, 'utf8');

const MARCADORES = [
    'LOGO_LS_OFFICE', 'TIPO_SOLICITACAO_FORMATADO', 'TEXTO_INTRODUCAO', 'LINHAS_IDENTIFICACAO',
    'LINHAS_BANCARIAS', 'TIPO_PIX', 'PIX', 'LINHAS_FINANCEIRAS', 'ROTULO_VALOR_DESTAQUE',
    'VALOR_PAGAMENTO', 'SALDO', 'CONDICAO_LIBERACAO_SALDO', 'ITENS_MATERIAIS', 'TOTAIS_MATERIAIS',
    'LINHAS_ENTREGA', 'ITENS_REEMBOLSO', 'LINHAS_DOCUMENTACAO', 'LISTA_ANEXOS', 'OBSERVACOES',
    'TEXTO_OPERACIONAL', 'NOME_SOLICITANTE', 'CARGO_SOLICITANTE', 'CONTATO_SOLICITANTE',
    'RODAPE_REFERENCIA',
];

const CONDICIONAIS = [
    'BANCARIOS', 'PIX', 'FINANCEIRO', 'CONDICOES', 'PARCIAL', 'CONDICAO_SALDO', 'MATERIAIS',
    'ENTREGA', 'REEMBOLSO', 'DOCUMENTACAO', 'ANEXOS', 'OBSERVACOES', 'CONTATO_SOLICITANTE',
];

const problemas: string[] = [];

for (const m of MARCADORES) {
    if (!bruto.includes(`{{${m}}}`)) problemas.push(`marcador {{${m}}} sumiu do template`);
}
for (const c of CONDICIONAIS) {
    if (!bruto.includes(`<!--#SE:${c}-->`)) problemas.push(`abertura <!--#SE:${c}--> sumiu`);
    if (!bruto.includes(`<!--#FIM:${c}-->`)) problemas.push(`fechamento <!--#FIM:${c}--> sumiu`);
}

// O compositor apaga tudo entre estes dois comentários quando há assinatura
// pessoal. Se a ordem inverter ou um sumir, a assinatura duplica.
const posAssinatura = bruto.indexOf('<!-- ASSINATURA -->');
const posFooter = bruto.indexOf('<!-- FOOTER -->');
if (posAssinatura < 0) problemas.push('marcador <!-- ASSINATURA --> sumiu');
if (posFooter < 0) problemas.push('marcador <!-- FOOTER --> sumiu');
if (posAssinatura >= 0 && posFooter >= 0 && posAssinatura > posFooter) {
    problemas.push('<!-- ASSINATURA --> ficou depois de <!-- FOOTER -->');
}

// Nenhum marcador pode sobrar no HTML final de nenhum dos tipos.
const tipos: TipoSolicitacao[] = [
    'PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO',
    'COMPRA_MATERIAL', 'REEMBOLSO', 'ADIANTAMENTO',
];
const base: DadosEmail = {
    tipo: 'PROGRAMACAO_PAGAMENTO',
    site: 'PAMRB008', sharing: 'Highline do Brasil', cliente: 'CLARO',
    favorecido: 'Rodrigo Auto Center', descricao: 'Manutenção do veículo',
    forma_pagamento: 'PIX', pix: '91981047902', tipo_pix: 'TELEFONE',
    valor_total: 1400, valor_pagamento: 700, valor_pago: 0,
};

for (const tipo of tipos) {
    const { html } = gerarEmailCorporativo({ ...base, tipo });
    const sobrou = html.match(/\{\{[A-Z_]+\}\}/g);
    if (sobrou) problemas.push(`${tipo}: marcador não substituído — ${[...new Set(sobrou)].join(', ')}`);
    const condicional = html.match(/<!--#(SE|FIM):[A-Z_]+-->/g);
    if (condicional) problemas.push(`${tipo}: marcador condicional sobrou no HTML — ${[...new Set(condicional)].join(', ')}`);
}

console.log('');
if (problemas.length === 0) {
    console.log(`  OK  ${MARCADORES.length} marcadores e ${CONDICIONAIS.length} blocos condicionais preservados`);
    console.log(`  OK  ${tipos.length} tipos renderizam sem marcador residual`);
    console.log(`  OK  <!-- ASSINATURA --> antes de <!-- FOOTER -->`);
    console.log('\nTemplate íntegro.\n');
} else {
    for (const p of problemas) console.log(`  FALHA ${p}`);
    console.log(`\n${problemas.length} problema(s).\n`);
}
process.exitCode = problemas.length === 0 ? 0 : 1;
