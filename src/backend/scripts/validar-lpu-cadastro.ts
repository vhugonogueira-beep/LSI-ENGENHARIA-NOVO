/**
 * Cadastro de LPU pela tela (18/10/2026).
 *
 *   1. nova base com natureza, área e cliente; nome repetido recusado;
 *   2. itens por planilha, colunas pelo nome do cabeçalho (mesmo fora da 1ª linha);
 *      reimportar atualiza em vez de duplicar;
 *   3. contagem da lista = itens ativos (item removido não conta);
 *   4. PV Padrão Highline restaurada/conferida: 266 serviços, preços mantidos.
 *
 *   npx tsx src/backend/scripts/validar-lpu-cadastro.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
}
function planilha(linhas: any[][]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Itens');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
async function importar(baseId: string, buf: Buffer) {
    const fd = new FormData();
    fd.append('arquivo', new Blob([new Uint8Array(buf)]), 'itens.xlsx');
    return json(`/pricebooks/${baseId}/importar-planilha`, { method: 'POST', body: fd });
}

async function main() {
    const bases: string[] = [];
    try {
        console.log('\n── 1. Nova base');
        const highline = await prisma.contratante.findFirst({ where: { sigla: 'HIGHLINE' } });
        const nome = `Teste LPU ${SUFIXO}`;
        const nova = await json('/pricebooks/nova', { method: 'POST', headers: cab, body: JSON.stringify({ nome_lpu: nome, origem: 'PV_CLIENTE', tipo: 'OPERACAO', contratante_id: highline?.id, padrao: false }) });
        if (nova.corpo.id) bases.push(nova.corpo.id);
        conferir('criada com natureza, área e cliente', nova.status === 201 && nova.corpo.origem === 'PV_CLIENTE' && nova.corpo.tipo === 'OPERACAO' && nova.corpo.contratante_id === (highline?.id ?? null), JSON.stringify(nova.corpo).slice(0, 200));
        const repetida = await json('/pricebooks/nova', { method: 'POST', headers: cab, body: JSON.stringify({ nome_lpu: nome, origem: 'PV_CLIENTE' }) });
        conferir('nome repetido recusado', repetida.status === 400 && /Já existe/.test(repetida.corpo.error), JSON.stringify(repetida.corpo));
        const semNatureza = await json('/pricebooks/nova', { method: 'POST', headers: cab, body: JSON.stringify({ nome_lpu: `${nome} B`, origem: 'X' }) });
        conferir('natureza inválida recusada', semNatureza.status === 400);

        console.log('\n── 2. Planilha');
        const buf = planilha([
            ['LPU de teste'], [],
            ['Código', 'Descrição', 'Unid. Medida', 'Atividade', 'Valor Unitário'],
            ['T01', 'Visita técnica', 'VB', 'Serviços', 'R$ 1.280,00'],
            ['T02', 'Troca de cabo RF', 'm', 'Serviços', 35.5],
            ['', '', '', '', ''],
        ]);
        const i1 = await importar(nova.corpo.id, buf);
        conferir('2 itens criados (cabeçalho na 3ª linha)', i1.status === 200 && i1.corpo.criados === 2, JSON.stringify(i1.corpo));
        const itens = await prisma.priceBookItem.findMany({ where: { pricebook_id: nova.corpo.id }, orderBy: { codigo_item: 'asc' } });
        conferir('valores lidos (R$ 1.280,00 e 35,50)', itens[0]?.valor_unitario === 1280 && itens[1]?.valor_unitario === 35.5 && itens[0]?.subtipo === 'Serviços', JSON.stringify(itens.map(i => [i.codigo_item, i.valor_unitario, i.unidade, i.subtipo])));
        const i2 = await importar(nova.corpo.id, buf);
        conferir('reimportar atualiza, não duplica', i2.corpo.criados === 0 && i2.corpo.atualizados === 2, JSON.stringify(i2.corpo));
        const semDescricao = await importar(nova.corpo.id, planilha([['Código', 'Valor'], ['X', 1]]));
        conferir('planilha sem "Descrição" recusada', semDescricao.status === 400 && /cabeçalho/.test(semDescricao.corpo.error));

        console.log('\n── 3. Contagem');
        await json(`/pricebooks/items/${itens[1].id}`, { method: 'DELETE' });
        const lista = (await json('/pricebooks')).corpo as any[];
        conferir('lista conta só os ativos', lista.find(b => b.id === nova.corpo.id)?._count?.items === 1, JSON.stringify(lista.find(b => b.id === nova.corpo.id)?._count));

        console.log('\n── 4. PV Padrão Highline');
        const antes = await prisma.priceBook.findFirst({ where: { nome_lpu: 'PV Padrão Highline', status: 'ATIVA' } });
        const precosAntes = antes ? await prisma.priceBookItem.count({ where: { pricebook_id: antes.id, valor_unitario: { gt: 0 } } }) : 0;
        const r = await json('/pricebooks/restaurar-pv-highline', { method: 'POST' });
        conferir('restaurada/conferida com 266 serviços', r.status === 200 && r.corpo.total === 266, JSON.stringify(r.corpo));
        const ativos = await prisma.priceBookItem.count({ where: { pricebook_id: r.corpo.id, ativo: true } });
        conferir('266 itens ativos na base', ativos === 266, String(ativos));
        const precosDepois = await prisma.priceBookItem.count({ where: { pricebook_id: r.corpo.id, valor_unitario: { gt: 0 } } });
        conferir('preços já digitados mantidos', precosDepois >= precosAntes, `${precosAntes} → ${precosDepois}`);
        if (!antes) bases.push(r.corpo.id);
    } finally {
        for (const id of bases) {
            await prisma.priceBookItem.deleteMany({ where: { pricebook_id: id } });
            await prisma.priceBook.delete({ where: { id } }).catch(() => undefined);
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
