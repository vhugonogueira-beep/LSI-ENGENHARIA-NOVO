// Auditoria dos anexos (05/11/2026): confere se cada arquivo registrado no banco
// existe no disco e se as pastas de gravação aceitam escrita.
//
//   npm run auditar:anexos            → resumo + até 15 faltantes por tipo
//   npm run auditar:anexos -- --todos → lista todos os faltantes
//
// Só lê: não apaga nem altera nada. Os anexos ficam em <pasta de onde o sistema
// sobe>/storage — iniciar o servidor de outra pasta faz todos "sumirem".
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORAGE = path.resolve(process.cwd(), 'storage');
const TODOS = process.argv.includes('--todos');

interface Item { id: string; chave: string; rotulo: string }
interface Tipo { nome: string; pasta: string; itens: () => Promise<Item[]> }

const resolver = (pasta: string, chave: string) => path.resolve(STORAGE, pasta, ...chave.split('/'));

const TIPOS: Tipo[] = [
    {
        nome: 'Anexos de pagamento (comprovantes/NF)', pasta: 'payment-attachments',
        itens: async () => (await prisma.paymentAttachment.findMany({ select: { id: true, storage_key: true, nome_original: true, tipo: true, parcela_id: true } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: `${a.tipo} · ${a.parcela_id ? 'pagamento' : 'depósito'} · ${a.nome_original}` })),
    },
    {
        nome: 'PDFs de PO', pasta: 'pos',
        itens: async () => (await prisma.purchaseOrderArquivo.findMany({ select: { id: true, storage_key: true, nome_original: true, po: { select: { numero: true, atividade: { select: { codigo: true } } } } } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: `${a.po?.atividade?.codigo || ''} PO ${a.po?.numero || ''} · ${a.nome_original}` })),
    },
    {
        nome: 'Arquivos de reembolso', pasta: 'reembolsos',
        itens: async () => (await prisma.reembolsoArquivo.findMany({ select: { id: true, storage_key: true, nome_original: true } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: a.nome_original })),
    },
    {
        nome: 'Documentação da atividade', pasta: 'documentacao',
        itens: async () => (await prisma.documentoAtividadeArquivo.findMany({ select: { id: true, storage_key: true, nome_original: true } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: a.nome_original })),
    },
    {
        nome: 'Contratos assinados', pasta: 'contratos',
        itens: async () => (await prisma.contratoArquivo.findMany({ select: { id: true, storage_key: true, nome_original: true } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: a.nome_original })),
    },
    {
        nome: 'Qualificação/SST', pasta: 'sst',
        itens: async () => (await prisma.qualificacaoArquivo.findMany({ select: { id: true, storage_key: true, nome_original: true } }))
            .map(a => ({ id: a.id, chave: a.storage_key, rotulo: a.nome_original })),
    },
    {
        nome: 'Relatório fotográfico / RFI', pasta: '',
        itens: async () => (await prisma.rFI.findMany({ where: { relatorio_url: { startsWith: 'relatorios/' } }, select: { id: true, relatorio_url: true, atividade: { select: { codigo: true } } } }))
            .map(r => ({ id: r.id, chave: r.relatorio_url!, rotulo: `${r.atividade?.codigo || ''} · ${path.basename(r.relatorio_url!)}` })),
    },
];

const PASTAS_GRAVACAO = ['payment-attachments', 'pos', 'reembolsos', 'documentacao', 'contratos', 'sst', 'relatorios', 'comprovantes', 'orcamentos-importados', 'email-signatures'];

function testarEscrita(pasta: string) {
    const dir = path.join(STORAGE, pasta);
    try {
        fs.mkdirSync(dir, { recursive: true });
        const teste = path.join(dir, `.teste-escrita-${process.pid}`);
        fs.writeFileSync(teste, 'ok');
        fs.unlinkSync(teste);
        return 'ok';
    } catch (e: any) {
        return `FALHA (${e.code || e.message})`;
    }
}

async function main() {
    console.log('Auditoria de anexos — LS Office Rumo');
    console.log(`Pasta do sistema (onde ele foi iniciado): ${process.cwd()}`);
    console.log(`Pasta dos anexos: ${STORAGE} ${fs.existsSync(STORAGE) ? '' : '  <<< NÃO EXISTE'}`);
    console.log('');

    let totalFaltando = 0, totalItens = 0;
    for (const t of TIPOS) {
        let itens: Item[] = [];
        try { itens = await t.itens(); } catch (e: any) { console.log(`- ${t.nome}: erro ao ler o banco (${e.message})`); continue; }
        const faltando = itens.filter(i => {
            try { return !fs.existsSync(resolver(t.pasta, i.chave)); } catch { return true; }
        });
        totalItens += itens.length; totalFaltando += faltando.length;
        const marca = faltando.length ? '  <<<' : '';
        console.log(`- ${t.nome}: ${itens.length} registrado(s), ${itens.length - faltando.length} no disco, ${faltando.length} faltando${marca}`);
        for (const f of (TODOS ? faltando : faltando.slice(0, 15))) console.log(`    faltando: ${f.rotulo}  [${f.chave}]`);
        if (!TODOS && faltando.length > 15) console.log(`    … e mais ${faltando.length - 15} (rode com -- --todos)`);
    }

    console.log('');
    console.log('Pastas de gravação (o sistema consegue salvar novos anexos?):');
    for (const p of PASTAS_GRAVACAO) console.log(`- storage/${p}: ${testarEscrita(p)}`);

    console.log('');
    if (!totalItens) console.log('Nenhum anexo registrado no banco.');
    else if (!totalFaltando) console.log(`Resultado: todos os ${totalItens} anexos registrados estão no disco.`);
    else {
        console.log(`Resultado: ${totalFaltando} de ${totalItens} anexos registrados NÃO estão no disco.`);
        if (totalFaltando === totalItens) console.log('Todos faltando: o sistema provavelmente está rodando de outra pasta ou a pasta storage não foi copiada para este servidor.');
    }
    await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
