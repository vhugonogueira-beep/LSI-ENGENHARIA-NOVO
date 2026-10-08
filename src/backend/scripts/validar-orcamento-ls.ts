/**
 * Orçamento LS na aba PV Highline (08/10/2026):
 *
 *   - modelo PV Highline ⇄ Orçamento LS, só em rascunho;
 *   - leitura de orçamento pronto em Excel e PDF, arquivo guardado;
 *   - três grupos no mesmo orçamento (PV, custo Cotação LS, Orçamento LS) sem
 *     um salvamento apagar o outro;
 *   - negociação parte só do preço ao cliente do modelo escolhido;
 *   - exportação do preço ao cliente.
 *
 * Cria a própria atividade/orçamento e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-orcamento-ls.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
async function enviarArquivo(budgetId: string, nome: string, buffer: Buffer, tipo: string) {
    const dados = new FormData();
    dados.append('arquivo', new Blob([new Uint8Array(buffer)], { type: tipo }), nome);
    return json(`/budgets/${budgetId}/importar`, { method: 'POST', body: dados });
}
async function salvarItens(budgetId: string, scope: string, items: any[]) {
    const b = await json(`/budgets/${budgetId}`);
    return json(`/budgets/${budgetId}/items`, { method: 'PUT', headers: cab, body: JSON.stringify({ versaoAtual: b.corpo.versao_atual, scope, items }) });
}
const contar = async (budgetId: string) => {
    const itens = await prisma.budgetItem.findMany({ where: { budget_id: budgetId } });
    return {
        pv: itens.filter(i => i.highline_template_row != null).length,
        custo: itens.filter(i => i.highline_template_row == null && i.origem_item !== 'ORCAMENTO_LS').length,
        ls: itens.filter(i => i.origem_item === 'ORCAMENTO_LS').length,
    };
};

async function main() {
    let atividadeId = '', budgetId = '', siteId = '';
    try {
        const at = await json('/atividades', { method: 'POST', headers: cab, body: JSON.stringify({
            titulo: `Teste orçamento LS ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO',
            sharing: 'HIGHLINE', id_site_sharing: `TSTO${SUFIXO}`, operadora: 'TIM', id_site_operadora: `TSTO${SUFIXO}T`,
            estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE }) });
        if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
        atividadeId = at.corpo.id; siteId = at.corpo.site_id;
        const bud = await json('/budgets', { method: 'POST', headers: cab, body: JSON.stringify({
            tenant_id: at.corpo.tenant_id, contratante_id: at.corpo.contratante_id, atividade_id: atividadeId, assunto: TESTE, tipo_orcamento: 'PV_HIGHLINE' }) });
        if (!bud.ok) throw new Error(`orçamento: ${bud.corpo.error}`);
        budgetId = bud.corpo.id;

        console.log('\n── Três grupos no mesmo orçamento');
        const catalogo = await json('/budgets/highline-pv/catalog');
        const linhaPv = (catalogo.corpo.items || catalogo.corpo)[0];
        const pv = await salvarItens(budgetId, 'catalog', [{ highline_template_row: linhaPv.templateRow ?? linhaPv.template_row, quantidade: 1, valor_unitario: 1000, bdi_percent: 0 }]);
        conferir('item da PV salvo (R$ 1.000)', pv.ok, pv.corpo.error);
        const custo = await salvarItens(budgetId, 'internal', [{ codigo_item: 'C1', titulo: 'Custo mão de obra', unidade: 'vb', quantidade: 1, valor_unitario: 400, bdi_percent: 0 }]);
        conferir('item de custo da Cotação LS salvo (R$ 400)', custo.ok, custo.corpo.error);

        console.log('\n── Modelo');
        const troca = await json(`/budgets/${budgetId}/modelo`, { method: 'PUT', headers: cab, body: JSON.stringify({ modelo: 'ORCAMENTO_LS' }) });
        conferir('troca para Orçamento LS em rascunho', troca.ok && troca.corpo.tipo_orcamento === 'ORCAMENTO_LS', troca.corpo.error);
        const invalido = await json(`/budgets/${budgetId}/modelo`, { method: 'PUT', headers: cab, body: JSON.stringify({ modelo: 'QUALQUER' }) });
        conferir('modelo inválido recusado', invalido.status === 400);

        console.log('\n── Leitura de Excel');
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Orçamento');
        ws.addRow(['ITEM', 'SERVIÇO', 'QTD', 'UNIDADE', 'VALOR UNITÁRIO', 'VALOR TOTAL']);
        ws.addRow(['L1', 'Fundação da torre', 1, 'vb', 8000, 8000]);
        ws.addRow(['L2', 'Montagem de estrutura', 2, 'un', 'R$ 1.500,00', 'R$ 3.000,00']);
        ws.addRow(['', '', '', '', 'VALOR TOTAL', 11000]);
        const lx = await enviarArquivo(budgetId, 'orcamento-ls.xlsx', Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        conferir('Excel lido: 2 itens, soma = total do documento', lx.ok && lx.corpo.itens?.length === 2 && lx.corpo.soma_itens === 11000 && lx.corpo.total_documento === 11000, JSON.stringify(lx.corpo).slice(0, 200));
        const salvaLs = await salvarItens(budgetId, 'orcamento_ls', (lx.corpo.itens || []).map((i: any) => ({ ...i, bdi_percent: 0 })));
        conferir('itens lidos salvos como Orçamento LS', salvaLs.ok, salvaLs.corpo.error);
        let n = await contar(budgetId);
        conferir('salvar o Orçamento LS não apagou PV nem custo', n.pv === 1 && n.custo === 1 && n.ls === 2, JSON.stringify(n));
        const custo2 = await salvarItens(budgetId, 'internal', [{ codigo_item: 'C1', titulo: 'Custo mão de obra', unidade: 'vb', quantidade: 2, valor_unitario: 400, bdi_percent: 0 }]);
        n = await contar(budgetId);
        conferir('salvar a Cotação LS não apagou o Orçamento LS', custo2.ok && n.ls === 2 && n.pv === 1, JSON.stringify(n));
        const tipo = await prisma.budget.findUnique({ where: { id: budgetId } });
        conferir('salvar a Cotação LS com PV guardada não volta o modelo para PV', tipo?.tipo_orcamento === 'ORCAMENTO_LS', tipo?.tipo_orcamento);

        console.log('\n── Arquivo guardado');
        const lista = await json(`/budgets/${budgetId}/importados`);
        conferir('arquivo original listado', lista.ok && lista.corpo.length === 1 && lista.corpo[0].nome_original === 'orcamento-ls.xlsx', JSON.stringify(lista.corpo));
        const dl = await fetch(`${API}/budgets/${budgetId}/importados/${encodeURIComponent(lista.corpo[0]?.nome || 'x')}`);
        conferir('arquivo original baixa', dl.ok && (await dl.arrayBuffer()).byteLength > 1000, `HTTP ${dl.status}`);
        const fuga = await fetch(`${API}/budgets/${budgetId}/importados/${encodeURIComponent('../../../.env')}`);
        conferir('caminho fora da pasta do orçamento não baixa', fuga.status === 404, `HTTP ${fuga.status}`);

        console.log('\n── Leitura de PDF');
        const doc = new jsPDF();
        autoTable(doc, { head: [['#', 'DESCRIÇÃO', 'QTD', 'UNID', 'UNIT.', 'TOTAL']], body: [['01', 'Aterramento completo', '1', 'vb', 'R$ 4.800,00', 'R$ 4.800,00'], ['02', 'Cabo 6mm', '120', 'm', 'R$ 12,35', 'R$ 1.482,00']] });
        const lp = await enviarArquivo(budgetId, 'orcamento.pdf', Buffer.from(doc.output('arraybuffer')), 'application/pdf');
        conferir('PDF lido: 2 itens com quantidade e unitário', lp.ok && lp.corpo.itens?.length === 2 && lp.corpo.itens[1].quantidade === 120 && lp.corpo.itens[1].valor_unitario === 12.35, JSON.stringify(lp.corpo.itens || lp.corpo).slice(0, 200));
        const ruim = await enviarArquivo(budgetId, 'nota.txt', Buffer.from('oi'), 'text/plain');
        conferir('formato não suportado recusado', ruim.status === 400, ruim.corpo.error);

        console.log('\n── Negociação e exportação');
        const neg = await json('/negociacoes', { method: 'POST', headers: cab, body: JSON.stringify({ atividade_id: atividadeId, budget_id: budgetId }) });
        conferir('negociação parte só do Orçamento LS (R$ 11.000), sem PV e sem custo', neg.ok && neg.corpo.valor_original === 11000, `HTTP ${neg.status} ${neg.corpo.valor_original ?? neg.corpo.error}`);
        const ex = await fetch(`${API}/budgets/${budgetId}/export/excel?grupo=preco_cliente`);
        conferir('exporta o preço ao cliente em Excel', ex.ok, `HTTP ${ex.status}`);

        console.log('\n── Fora do rascunho');
        await prisma.budget.update({ where: { id: budgetId }, data: { status: 'ENVIADO' } });
        const travado = await json(`/budgets/${budgetId}/modelo`, { method: 'PUT', headers: cab, body: JSON.stringify({ modelo: 'PV_HIGHLINE' }) });
        conferir('modelo não troca depois de enviado', travado.status === 400 && /rascunho/.test(travado.corpo.error || ''), travado.corpo.error);
    } finally {
        if (budgetId) {
            const negs = await prisma.negociacao.findMany({ where: { budget_id: budgetId } });
            await prisma.contraproposta.deleteMany({ where: { negociacao_id: { in: negs.map(x => x.id) } } });
            await prisma.negociacao.deleteMany({ where: { budget_id: budgetId } });
            await prisma.budgetItem.deleteMany({ where: { budget_id: budgetId } });
            await prisma.budgetVersion.deleteMany({ where: { budget_id: budgetId } });
            await prisma.auditLog.deleteMany({ where: { entidade_id: budgetId } });
            await prisma.budget.delete({ where: { id: budgetId } }).catch(e => console.log('   (limpeza) orçamento:', e.message));
            fs.rmSync(path.resolve('storage', 'orcamentos-importados', budgetId), { recursive: true, force: true });
        }
        if (atividadeId) await json(`/atividades/${atividadeId}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
        if (siteId) await json(`/sites/${siteId}`, { method: 'DELETE' });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
