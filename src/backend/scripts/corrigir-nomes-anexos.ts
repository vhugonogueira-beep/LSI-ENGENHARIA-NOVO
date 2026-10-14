/**
 * Nomes de anexo com acento corrompido (14/10/2026, correção 4 do Kayky).
 *
 * Antes da correção, "CONCEIÇÃO.pdf" era gravado como "CONCEIÃ‡ÃƒO.pdf". Este
 * script lista os nomes gravados que dá para recuperar (relendo como UTF-8) e,
 * com --aplicar, corrige. O arquivo em disco não muda: o nome no storage é um
 * identificador; só o nome exibido é corrigido.
 *
 * Orçamentos importados guardam o nome no próprio arquivo em disco, já com
 * caracteres trocados por "_" — esses não têm como ser recuperados e só são listados.
 *
 *   npx tsx src/backend/scripts/corrigir-nomes-anexos.ts
 *   npx tsx src/backend/scripts/corrigir-nomes-anexos.ts --aplicar
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../server';
import { nomeArquivoUtf8 } from '../utils/nome-arquivo';

type Tabela = { nome: string; listar: () => Promise<{ id: string; nome: string }[]>; gravar: (id: string, nome: string) => Promise<unknown> };

const TABELAS: Tabela[] = [
    { nome: 'Documentos de SST', listar: async () => (await prisma.qualificacaoArquivo.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.qualificacaoArquivo.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'Documentação da atividade', listar: async () => (await prisma.documentoAtividadeArquivo.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.documentoAtividadeArquivo.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'PO', listar: async () => (await prisma.purchaseOrderArquivo.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.purchaseOrderArquivo.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'Contrato', listar: async () => (await prisma.contratoArquivo.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.contratoArquivo.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'Reembolso', listar: async () => (await prisma.reembolsoArquivo.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.reembolsoArquivo.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'Comprovante de pagamento', listar: async () => (await prisma.paymentAttachment.findMany({ select: { id: true, nome_original: true } })).map(x => ({ id: x.id, nome: x.nome_original })), gravar: (id, nome) => prisma.paymentAttachment.update({ where: { id }, data: { nome_original: nome } }) },
    { nome: 'Assinatura de e-mail', listar: async () => (await prisma.userEmailSignature.findMany({ select: { id: true, original_name: true } })).map(x => ({ id: x.id, nome: x.original_name })), gravar: (id, nome) => prisma.userEmailSignature.update({ where: { id }, data: { original_name: nome } }) },
];

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    let total = 0;
    for (const t of TABELAS) {
        const corrigiveis = (await t.listar()).map(x => ({ ...x, novo: nomeArquivoUtf8(x.nome) })).filter(x => x.novo !== x.nome);
        for (const x of corrigiveis) {
            console.log(`${t.nome}: "${x.nome}" → "${x.novo}"`);
            if (aplicar) await t.gravar(x.id, x.novo);
        }
        total += corrigiveis.length;
    }
    const pasta = path.resolve(process.cwd(), 'storage', 'orcamentos-importados');
    if (fs.existsSync(pasta)) {
        for (const orc of fs.readdirSync(pasta)) for (const f of fs.readdirSync(path.join(pasta, orc))) {
            if (/[ÃÂ]/.test(f)) console.log(`Orçamento importado (não recuperável, nome trocado por "_" no disco): ${f}`);
        }
    }
    console.log(`\n${total} nome(s) recuperável(is).${aplicar ? ' Corrigidos.' : ' Simulação — use --aplicar para corrigir.'}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
