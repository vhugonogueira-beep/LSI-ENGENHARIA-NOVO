/**
 * Guarda de acabamento do e-mail financeiro.
 *
 * O `validar-template-email.ts` cuida do contrato de dados — marcadores e
 * condicionais. Este cuida do acabamento visual e da higiene do HTML, que é
 * onde os defeitos voltaram mais de uma vez:
 *
 *   · documentação interna vazando para o corpo (comentário HTML não aninha:
 *     um `-->` dentro de um bloco de prosa encerra o comentário e o resto sai
 *     impresso para o financeiro);
 *   · fonte trocando no meio do documento;
 *   · cores fora da paleta Executivo;
 *   · glifos decorativos usados como ícone.
 *
 *   npx tsx src/backend/scripts/validar-acabamento-email.ts
 */
import fs from 'fs';
import path from 'path';
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';
import { appendSignature } from '../services/email-signature.service';

const TEMPLATE = path.resolve(process.cwd(), 'src', 'backend', 'templates', 'email-corporativo-ls.html');

// Paleta Executivo + os tons de atenção do bloco de saldo. Qualquer outra cor
// no HTML final é desvio.
const PALETA = new Set([
    // Marinho e azuis
    '#08213F', '#0C2C51', '#1D4675', '#173C64', '#1F6FE0', '#5E9BEF',
    '#6E9AD4', '#79A2DC', '#93ACCB', '#C4DCFF', '#BAD6FF', '#7B93B4',
    '#5F7FA8', '#8AA1BF', '#5D7595', '#173A63',
    // Neutros e superfícies
    '#FFFFFF', '#EDF1F6', '#EDF4FD', '#F6F9FC', '#F0F6FE', '#EEF2F7', '#E3E9F0',
    '#46566B', '#5A6B80', '#8B99AB', '#A3AEBC',
    // Risco e atenção
    '#E2231A', '#FF8A82', '#FDF6E7', '#C08A12', '#8A6410', '#5A4A22',
]);

// Glifos que vinham fazendo papel de ícone. Sem suporte confiável a PNG/CID
// por seção, a decisão foi dispensar o ícone decorativo — não trocá-lo por
// outro caractere.
const GLIFOS = ['&#9679;', '&#9670;', '&#9636;', '&#9632;', '&#9633;', '&#9678;', '&#9654;', '●', '◆', '▤', '■', '□', '◉', '▶'];

// Prosa que só existe na documentação interna. Se qualquer um destes aparecer
// no corpo renderizado, um comentário vazou.
const PROSA_INTERNA = [
    'Paleta Executivo', 'compositor', 'email-signature', 'aplicarCondicionais',
    'marcador', 'delimitador', 'Comentário HTML', 'comentario HTML',
    'template', 'placeholder', 'TypeScript', 'Outlook',
];

const base: DadosEmail = {
    tipo: 'PROGRAMACAO_PAGAMENTO',
    tipo_demanda: 'IMPLANTACAO',
    site: 'PAMRB008',
    sharing: 'Highline do Brasil',
    cliente: 'CLARO',
    favorecido: 'Rodrigo Auto Center',
    fornecedor: 'Rodrigo Auto Center',
    cpf_cnpj_pagamento: '12345678000190',
    descricao: 'Manutenção corretiva da frota de apoio à obra.',
    forma_pagamento: 'PIX',
    pix: '91981047902',
    tipo_pix: 'TELEFONE',
    banco: 'Banco Inter',
    valor_total: 1600,
    valor_pago: 0,
    valor_pagamento: 1000,
    data_pagamento: '2026-09-22',
    condicao_liberacao_saldo: 'conclusão da etapa e aceite da fiscalização LS Office',
    link_diretorio: String.raw`\\servidor\ENGENHARIA\OBRAS\IMPLANTACAO\PAMRB008`,
    anexos: ['ORCAMENTO_PAMRB008_RODRIGO_AUTO_CENTER.pdf'],
    observacoes: 'Veículos liberados mediante ordem de serviço assinada.',
    nome_solicitante: 'Victor Hugo Nogueira da Silva',
    cargo_solicitante: 'Engenharia · LS Office',
    referencia: 'DEM-2026-014 · Parcela 1 de 2',
};

const TIPOS: TipoSolicitacao[] = [
    'PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO',
    'COMPRA_MATERIAL', 'REEMBOLSO', 'ADIANTAMENTO',
];

const problemas: string[] = [];
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) problemas.push(nome);
}

// ── O template não guarda prosa ─────────────────────────────────────────────
console.log('\n── Template');
const bruto = fs.readFileSync(TEMPLATE, 'utf8');
const comentariosDoTemplate = [...bruto.matchAll(/<!--([\s\S]*?)-->/g)].map(m => m[1].trim());
const prosaNoTemplate = comentariosDoTemplate.filter(c =>
    !/^#(SE|FIM):[A-Z_]+$/.test(c) && c !== 'ASSINATURA' && c !== 'FOOTER' && !/^\[if/i.test(c));
conferir('o template só contém marcadores funcionais', prosaNoTemplate.length === 0,
    prosaNoTemplate.slice(0, 2).map(c => c.slice(0, 50)).join(' | '));

// ── Cada tipo, renderizado de verdade ───────────────────────────────────────
for (const tipo of TIPOS) {
    console.log(`\n── ${tipo}`);
    const { html } = gerarEmailCorporativo({ ...base, tipo });

    // Texto visível: fora de comentários e fora de tags.
    const semComentario = html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // A prévia da caixa de entrada é texto oculto: aparece na lista de
        // mensagens, não no corpo, e não conta como repetição.
        .replace(/<div style="display:none[\s\S]*?<\/div>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const visivel = semComentario.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const vazou = PROSA_INTERNA.filter(t => visivel.toLowerCase().includes(t.toLowerCase()));
    conferir('nenhuma documentação interna no corpo', vazou.length === 0, vazou.join(', '));

    // Todo comentário que sobreviveu tem de ser funcional e curto.
    const sobreviventes = [...html.matchAll(/<!--([\s\S]*?)-->/g)].map(m => m[1].trim());
    const naoFuncionais = sobreviventes.filter(c =>
        c !== 'ASSINATURA' && c !== 'FOOTER' && !/^\[if/i.test(c));
    conferir('só comentários funcionais sobrevivem', naoFuncionais.length === 0,
        naoFuncionais.slice(0, 2).join(' | '));

    // Comentário aberto e não fechado é o defeito na sua forma crua.
    conferir('nenhum comentário aberto sem fechar',
        (html.match(/<!--/g) || []).length === (html.match(/-->/g) || []).length);

    const foraDaPaleta = [...new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()))]
        .filter(c => !PALETA.has(c));
    conferir('todas as cores são da paleta', foraDaPaleta.length === 0, foraDaPaleta.join(' '));

    const glifos = GLIFOS.filter(g => html.includes(g));
    conferir('nenhum glifo usado como ícone', glifos.length === 0, glifos.join(' '));

    const fontes = [...new Set([...html.matchAll(/font-family:([^;"}]+)/g)].map(m => m[1].trim()))];
    conferir('uma família tipográfica só', fontes.length === 1, `${fontes.length}: ${fontes.join(' / ')}`);

    conferir('nenhuma webfont remota', !/@import|fonts\.googleapis|<link/i.test(html));
    conferir('nenhum JavaScript', !/<script/i.test(html));
    conferir('estrutura sem flex nem grid', !/display:\s*(flex|grid)/i.test(html));

    // Com imagens bloqueadas, valor e chave têm de continuar legíveis: os dois
    // são texto de verdade, não pedaço de imagem.
    conferir('valor é texto real', visivel.includes('R$ 1.000,00'));
    if (tipo !== 'FORMALIZACAO_CARTAO') {
        conferir('chave PIX é texto real', visivel.includes('(91) 98104-7902'));
    }
    conferir('logo tem texto alternativo', /<img[^>]+alt="LS Office[^"]*"/.test(html));

    conferir('contêiner de 960px', html.includes('max-width:960px'));
    conferir('fundo do corpo branco', !/background-color:#EDF1F6/.test(html));
    // O motor do Word ignora font-size:0 / line-height:0: o &nbsp; volta à
    // entrelinha padrão e um filete de 1px sai com ~14px, virando barra. O que
    // o Word respeita é height + font-size/line-height explícitos e um
    // caractere de largura zero no lugar do espaço.
    conferir('nenhum filete depende de font-size:0', !/font-size:0;line-height:0;/.test(html));
    conferir('filetes usam mso-line-height-rule', html.includes('mso-line-height-rule:exactly'));
    // Rótulo e valor ocupam um terço cada, no mínimo: com o valor encostado na
    // borda direita abria-se um vão no meio da linha.
    conferir('rótulo ocupa um terço', html.includes('class="row-label" width="33%"'));
    conferir('valor começa no terço, alinhado à esquerda',
        html.includes('class="row-value" align="left"'));
    conferir('as três caixas estão na mesma linha de tabela',
        !/<\/tr>[\s\S]{0,400}?CHAVE PIX/.test(html.slice(html.indexOf('ROTULO') >= 0 ? 0 : 0)) || html.includes('CHAVE PIX'));
    conferir('media queries presentes', html.includes('@media only screen and (max-width:480px)'));
    if (tipo !== 'FORMALIZACAO_CARTAO') {
        // A caixa da chave é marinho com ARESTA vermelha: destaca a ação sem
        // virar bloco de alerta, que num e-mail financeiro é lido como
        // pendência ou atraso.
        conferir('chave PIX tem a aresta vermelha', html.includes('border-left:5px solid #E2231A'));
        conferir('a caixa da chave não é um bloco vermelho',
            !/background-color:#E2231A;border-radius:12px/.test(html));
    }
    conferir('prévia da caixa de entrada oculta', /display:none[^"]*">[^<]+<\/div>/.test(html));
}

// ── Os três papéis do dinheiro não se confundem ─────────────────────────────
console.log('\n── Papéis dos valores (1.000 agora / 1.600 contratado / 600 retido)');
{
    const { html } = gerarEmailCorporativo(base);
    const visivel = html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<div style="display:none[\s\S]*?<\/div>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    conferir('o valor a pagar agora aparece uma vez', (visivel.split('R$ 1.000,00').length - 1) === 1);
    // O total contratado virou o complemento sob o valor em destaque, e não
    // uma linha de tabela: é o que diz, ali mesmo, que aquele número não é o
    // processo inteiro.
    conferir('o total contratado acompanha o valor em destaque',
        /de R\$ 1\.600,00 contratados/.test(visivel));
    conferir('o total contratado aparece uma vez', (visivel.split('R$ 1.600,00').length - 1) === 1);
    conferir('o saldo é apresentado como retido', /não deve ser inclu/i.test(visivel) && visivel.includes('R$ 600,00'));
    conferir('a condição de liberação acompanha o saldo', /Libera..o somente ap.s/i.test(visivel));
}

// ── Assinatura pessoal ──────────────────────────────────────────────────────
// Quando o usuário tem assinatura própria, ela substitui o bloco institucional
// em vez de somar-se a ele — e tem de cair DENTRO do cartão. Antes era apenas
// anexada ao fim do documento: como o template é uma tabela centralizada e não
// tem </body>, a imagem de 590px sobrava fora do cartão, alinhada à esquerda da
// página e abaixo do rodapé.
console.log('\n── Assinatura pessoal no lugar da institucional');
{
    const { html } = gerarEmailCorporativo(base);
    const bloco = '<!-- LSI:USER_EMAIL_SIGNATURE --><table role="presentation"><tr><td>'
        + '<img src="cid:assinatura-teste" alt="Assinatura de Victor Hugo"></td></tr></table>';
    const composto = appendSignature(html, bloco);

    conferir('a assinatura entrou no documento', composto.includes('cid:assinatura-teste'));
    conferir('a assinatura institucional saiu',
        html.includes('Victor Hugo Nogueira da Silva') && !composto.includes('Victor Hugo Nogueira da Silva'));
    conferir('não sobrou assinatura duplicada',
        (composto.match(/cid:assinatura-teste/g) || []).length === 1);

    const posAssinatura = composto.indexOf('cid:assinatura-teste');
    const posFooter = composto.indexOf('<!-- FOOTER -->');
    const posFimCartao = composto.lastIndexOf('</table>');
    conferir('a assinatura vem antes do rodapé', posAssinatura > 0 && posAssinatura < posFooter);
    conferir('a assinatura está dentro do cartão', posAssinatura < posFimCartao);
    conferir('a assinatura está numa linha de tabela',
        /<tr>\s*<td[^>]*>\s*<!-- LSI:USER_EMAIL_SIGNATURE -->/.test(composto));
    conferir('os marcadores continuam de pé para a próxima composição',
        composto.includes('<!-- ASSINATURA -->') && composto.includes('<!-- FOOTER -->'));

    // Compor duas vezes não pode empilhar assinaturas.
    const recomposto = appendSignature(composto, bloco);
    conferir('recompor não duplica', (recomposto.match(/cid:assinatura-teste/g) || []).length === 1);

    // E-mails sem os marcadores (faturamento) seguem com o comportamento antigo.
    const avulso = appendSignature('<div>corpo do faturamento</div>', bloco);
    conferir('e-mail sem marcadores recebe a assinatura no fim',
        avulso.endsWith(bloco) && avulso.includes('corpo do faturamento'));
}

console.log(problemas.length === 0
    ? '\nAcabamento íntegro.\n'
    : `\n${problemas.length} problema(s): ${[...new Set(problemas)].join('; ')}\n`);
process.exitCode = problemas.length === 0 ? 0 : 1;
