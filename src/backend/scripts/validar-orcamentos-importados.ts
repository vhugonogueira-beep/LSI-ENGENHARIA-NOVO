/**
 * Vários orçamentos importados no mesmo Orçamento LS (18/10/2026): cada arquivo
 * é um orçamento; os válidos somam, o não válido sai do total sem ser apagado.
 *
 *   1. dois arquivos importados e somados: os dois "Válido", total = soma;
 *   2. um marcado "Não válido": itens dele inativos, fora do total;
 *   3. salvar o orçamento de novo não apaga os itens inativos;
 *   4. marcado válido de novo: voltam;
 *   5. itens importados antes do vínculo são religados ao arquivo pelo conteúdo.
 *
 *   npx tsx src/backend/scripts/validar-orcamentos-importados.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();
const TESTE = 'Teste automatizado — pode apagar';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
}
function planilha(itens: [string, string, number][]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ITEM', 'SERVIÇO', 'QTD', 'UNIDADE', 'VALOR UNITÁRIO', 'VALOR TOTAL'], ...itens.map(([c, t, v]) => [c, t, 1, 'vb', v, v])]), 'Orçamento');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function main() {
    let atividadeId = '', siteId = '', budgetId = '';
    try {
        const site = `TOI${SUFIXO}`;
        const at = await json('/atividades', { method: 'POST', headers: cab, body: JSON.stringify({
            titulo: `Teste importados ${SUFIXO}`, tipo_demanda: 'OPERACAO', subtipo_demanda: 'MANUTENCAO', modelo_operacao: 'EXECUCAO_DIRETA',
            sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'TIM', id_site_operadora: `${site}T`, estado: 'PA', municipio: 'Marabá', descricao: TESTE }) });
        atividadeId = at.corpo.id; siteId = at.corpo.site_id;
        const b = await json('/budgets', { method: 'POST', headers: cab, body: JSON.stringify({ tenant_id: at.corpo.tenant_id, contratante_id: at.corpo.contratante_id, atividade_id: atividadeId, assunto: TESTE, tipo_orcamento: 'ORCAMENTO_LS' }) });
        budgetId = b.corpo.id;

        const importar = async (nome: string, buf: Buffer) => {
            const fd = new FormData();
            fd.append('arquivo', new Blob([new Uint8Array(buf)]), nome);
            return (await json(`/budgets/${budgetId}/importar`, { method: 'POST', body: fd })).corpo;
        };
        const salvar = async (itens: any[]) => {
            const atual = (await json(`/budgets/${budgetId}`)).corpo;
            return json(`/budgets/${budgetId}/items`, { method: 'PUT', headers: cab, body: JSON.stringify({ versaoAtual: atual.versao_atual, expectedUpdatedAt: atual.updated_at, scope: 'orcamento_ls', items: itens }) });
        };
        const comoItem = (l: any, arquivo: string, ordem: number, ativo = true) => ({ codigo_item: l.codigo_item, titulo: l.titulo, unidade: l.unidade, quantidade: l.quantidade, valor_unitario: l.valor_unitario, bdi_percent: 0, bloco: 'ORCAMENTO_LS', ordem, arquivo_origem: arquivo, ativo });

        console.log('\n── 1. Dois orçamentos somados');
        const l1 = await importar('ORC A REV00.xlsx', planilha([['01.1', 'Mobilização', 1200], ['02.1', 'Troca de fonte', 1200]]));
        const l2 = await importar('ORC B REV01.xlsx', planilha([['01.1', 'Aterramento', 300]]));
        const s1 = await salvar([...l1.itens.map((i: any, k: number) => comoItem(i, l1.arquivo, k)), ...l2.itens.map((i: any, k: number) => comoItem(i, l2.arquivo, 10 + k))]);
        conferir('itens dos dois arquivos salvos', s1.status === 200, JSON.stringify(s1.corpo).slice(0, 200));
        let lista = (await json(`/budgets/${budgetId}/importados`)).corpo as any[];
        const a = lista.find(x => x.nome === l1.arquivo), bb = lista.find(x => x.nome === l2.arquivo);
        conferir('os dois válidos, cada um com seu total', a?.situacao === 'VALIDO' && a.total === 2400 && bb?.situacao === 'VALIDO' && bb.total === 300, JSON.stringify(lista.map(x => [x.nome_original, x.situacao, x.total])));

        console.log('\n── 2. Um não válido');
        const v = await json(`/budgets/${budgetId}/importados/${encodeURIComponent(l2.arquivo)}/validade`, { method: 'PUT', headers: cab, body: JSON.stringify({ valido: false }) });
        conferir('marcado não válido', v.status === 200 && v.corpo.itens === 1, JSON.stringify(v.corpo));
        const ativos = await prisma.budgetItem.findMany({ where: { budget_id: budgetId, ativo: true } });
        conferir('total do orçamento só com o válido (R$ 2.400)', Math.round(ativos.reduce((t, i) => t + i.total_linha, 0)) === 2400, String(ativos.reduce((t, i) => t + i.total_linha, 0)));
        lista = (await json(`/budgets/${budgetId}/importados`)).corpo;
        conferir('lista mostra "Não válido"', lista.find(x => x.nome === l2.arquivo)?.situacao === 'NAO_VALIDO');

        console.log('\n── 3. Salvar de novo');
        const s2 = await salvar([...l1.itens.map((i: any, k: number) => comoItem(i, l1.arquivo, k)), ...l2.itens.map((i: any, k: number) => comoItem(i, l2.arquivo, 10 + k, false))]);
        conferir('salvo', s2.status === 200);
        conferir('item inativo continua guardado', await prisma.budgetItem.count({ where: { budget_id: budgetId, arquivo_origem: l2.arquivo, ativo: false } }) === 1);

        console.log('\n── 4. Válido de novo');
        const v2 = await json(`/budgets/${budgetId}/importados/${encodeURIComponent(l2.arquivo)}/validade`, { method: 'PUT', headers: cab, body: JSON.stringify({ valido: true }) });
        conferir('marcado válido', v2.status === 200, JSON.stringify(v2.corpo));
        const todos = await prisma.budgetItem.findMany({ where: { budget_id: budgetId, ativo: true } });
        conferir('voltou a somar (R$ 2.700)', Math.round(todos.reduce((t, i) => t + i.total_linha, 0)) === 2700, String(todos.reduce((t, i) => t + i.total_linha, 0)));

        console.log('\n── 5. Itens importados antes do vínculo');
        await prisma.budgetItem.updateMany({ where: { budget_id: budgetId }, data: { arquivo_origem: null } });
        lista = (await json(`/budgets/${budgetId}/importados`)).corpo;
        conferir('religados ao arquivo pelo conteúdo', lista.find(x => x.nome === l1.arquivo)?.itens === 2 && lista.find(x => x.nome === l2.arquivo)?.itens === 1, JSON.stringify(lista.map(x => [x.nome_original, x.itens])));
    } finally {
        if (budgetId) {
            fs.rmSync(path.resolve('storage', 'orcamentos-importados', budgetId), { recursive: true, force: true });
            await prisma.budgetItem.deleteMany({ where: { budget_id: budgetId } });
            await prisma.auditLog.deleteMany({ where: { entidade_id: budgetId } });
            await prisma.budget.delete({ where: { id: budgetId } }).catch(() => undefined);
        }
        if (atividadeId) await json(`/atividades/${atividadeId}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
        if (siteId) await json(`/sites/${siteId}`, { method: 'DELETE' });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
