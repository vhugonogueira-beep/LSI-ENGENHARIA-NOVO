/**
 * Confere que o `.eml` sai com as imagens do corpo por CID, e não como data URI.
 *
 * A logo embutida respondia por 82% do peso do e-mail e é bloqueada por padrão
 * no Outlook e no Gmail quando vem como `data:`. Este script monta um corpo com
 * uma imagem embutida, gera o `.eml` e verifica a conversão.
 *
 *   npx tsx src/backend/scripts/validar-eml-cid.ts
 */
import { buildOutlookEml } from '../services/email-signature.service';

// PNG 1x1 real, para o caminho de decodificação ser exercitado de verdade.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const dataUri = `data:image/png;base64,${PNG_1X1}`;

const html = `<html><body>
  <img src="${dataUri}" alt="LS Office" width="170">
  <p>Corpo do e-mail.</p>
  <img src="${dataUri}" alt="mesma imagem repetida">
</body></html>`;

const eml = buildOutlookEml({
    assunto: 'Teste CID',
    para: 'financeiro@lsoffice.com.br',
    cc: null,
    html,
    signature: null,
});

const partesInline = (eml.match(/Content-Disposition: inline/g) || []).length;

// O HTML viaja em base64 dentro do .eml, então precisa ser decodificado antes
// de procurar as referências cid: nele.
const separador = '\r\n\r\n';
const blocoHtml = eml.split('Content-Type: text/html; charset=UTF-8')[1] || '';
const base64Html = blocoHtml.split(separador)[1]?.split('--')[0] || '';
const htmlFinal = Buffer.from(base64Html.replace(/\s+/g, ''), 'base64').toString('utf8');
const referenciasCid = (htmlFinal.match(/cid:lsi-img-/g) || []).length;

const checagens: [string, boolean][] = [
    ['nenhum data: URI sobrou no .eml', !eml.includes('data:image/')],
    ['o HTML passou a referenciar cid:', referenciasCid === 2],
    ['imagem repetida virou UMA parte só', partesInline === 1],
    ['a parte declara Content-ID', /Content-ID: <lsi-img-/.test(eml)],
    ['virou multipart/related', eml.includes('multipart/related')],
    ['destinatário no cabeçalho', eml.includes('To: financeiro@lsoffice.com.br')],
];

console.log('');
for (const [nome, ok] of checagens) console.log(`  ${ok ? 'OK  ' : 'FALHA'} ${nome}`);

const falhas = checagens.filter(([, ok]) => !ok).length;
console.log(`\n${checagens.length - falhas}/${checagens.length} verificações passaram.`);
process.exitCode = falhas === 0 ? 0 : 1;
