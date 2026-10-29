/**
 * Orçamento da rodada de negociação e etapas de Projeto (29/10/2026).
 *
 *   1. ajuste puro: total fecha no valor proposto, centavos no item de qtd 1;
 *   2. "Gerar orçamento com este valor": Rev. 02 do mesmo orçamento, itens
 *      descontados, Rev. 01 guardada; a mesma rodada não gera duas vezes;
 *   3. atividade de Projeto recebe o modelo Vistoria → Elaboração de projeto →
 *      Emissão de ART → Entrega de documentação.
 *
 *   npx tsx src/backend/scripts/validar-negociacao-revisao.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import { ajustarItensAoValor } from '../services/budget.service';

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
const json = async (c: string, metodo = 'GET', corpo?: unknown) => {
    const r = await fetch(`${API}${c}`, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
};

async function main() {
    console.log('\n── 1. Ajuste dos itens ao valor');
    const base = (id: string, quantidade: number, valor_unitario: number, bdi_percent = 0) => ({ id, quantidade, valor_unitario, bdi_percent, desconto_interno_percent: 0 });
    const a = ajustarItensAoValor([base('a', 1, 1050), base('b', 1, 2200), base('c', 1, 2750), base('d', 3, 333.33)], 6500);
    conferir('total fecha exatamente no valor proposto', a.total === 6500, String(a.total));
    conferir('desconto proporcional (~7,14%)', a.percentual === 7.14, String(a.percentual));
    conferir('item de qtd 3 com unitário em centavos', Number.isInteger(Math.round(a.itens[3].valor_unitario * 100)) && a.itens[3].valor_unitario < 333.33, String(a.itens[3].valor_unitario));
    const comBdi = ajustarItensAoValor([base('a', 1, 1000, 25), base('b', 2, 400, 25)], 2000);
    conferir('com BDI o total final também fecha', comBdi.total === 2000, String(comBdi.total));
    let erro = '';
    try { ajustarItensAoValor([base('a', 1, 100)], 0); } catch (e: any) { erro = e.message; }
    conferir('valor zero recusado', /maior que zero/.test(erro), erro);

    let atividadeId = '', siteId = '', budgetId = '', projetoId = '', siteProjeto = '';
    try {
        console.log('\n── 2. Rodada gera a revisão do orçamento');
        const at = await json('/atividades', 'POST', {
            titulo: `Negociação ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO', sharing: 'HIGHLINE',
            id_site_sharing: `TSTN${SUFIXO}`, operadora: 'TIM', id_site_operadora: `TSTN${SUFIXO}T`, estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE,
        });
        if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
        atividadeId = at.corpo.id; siteId = at.corpo.site_id;
        const bud = await json('/budgets', 'POST', { tenant_id: at.corpo.tenant_id, contratante_id: at.corpo.contratante_id, atividade_id: atividadeId, assunto: TESTE, tipo_orcamento: 'ORCAMENTO_LS' });
        if (!bud.ok) throw new Error(`orçamento: ${bud.corpo.error}`);
        budgetId = bud.corpo.id;
        const itens = [['01.1', 'Mobilização', 1, 1050], ['02.1', 'Vistoria', 1, 2200], ['02.2', 'Projeto Executivo + ART', 1, 2750]]
            .map(([codigo_item, titulo, quantidade, valor_unitario]) => ({ codigo_item, titulo, unidade: 'vb', quantidade, valor_unitario, bdi_percent: 0, bloco: 'Serviços' }));
        const salvo = await json(`/budgets/${budgetId}/items`, 'PUT', { versaoAtual: 1, scope: 'orcamento_ls', items: itens });
        conferir('orçamento de R$ 6.000 montado', salvo.ok, salvo.corpo.error);
        const neg = await json('/negociacoes', 'POST', { atividade_id: atividadeId, budget_id: budgetId });
        conferir('negociação aberta com R$ 6.000', neg.ok && neg.corpo.valor_original === 6000, `${neg.status} ${neg.corpo.valor_original ?? neg.corpo.error}`);
        const rod = await json(`/negociacoes/${neg.corpo.id}/contrapropostas`, 'POST', { origem: 'CLIENTE', valor_proposto: 5500 });
        const rev = await json(`/negociacoes/${neg.corpo.id}/contrapropostas/${rod.corpo.id}/revisao`, 'POST');
        conferir('revisão gerada: Rev. 02 com R$ 5.500', rev.status === 201 && rev.corpo.versao === 2 && rev.corpo.total === 5500, `${rev.status} ${JSON.stringify(rev.corpo)}`);
        const b = await prisma.budget.findUnique({ where: { id: budgetId }, include: { items: { orderBy: { ordem: 'asc' } }, versions: true } });
        const somaItens = Math.round(b!.items.reduce((t, i) => t + i.quantidade * i.valor_unitario, 0) * 100) / 100;
        conferir('mesmo orçamento (mesmo número), revisão 2', b?.versao_atual === 2 && !!b?.numero, `v${b?.versao_atual} ${b?.numero}`);
        conferir('itens somam R$ 5.500', somaItens === 5500, String(somaItens));
        conferir('todo item com desconto', b!.items.every((i, k) => i.valor_unitario < (itens[k].valor_unitario as number)), b!.items.map(i => i.valor_unitario).join(', '));
        const v1 = b!.versions.find(v => v.versao === 1);
        conferir('Rev. 01 guardada com R$ 6.000', v1?.total_geral === 6000 && JSON.parse(v1.snapshot_json).items.some((i: any) => i.valor_unitario === 2750), String(v1?.total_geral));
        const repetida = await json(`/negociacoes/${neg.corpo.id}/contrapropostas/${rod.corpo.id}/revisao`, 'POST');
        conferir('mesma rodada não gera duas revisões', repetida.status === 400, `${repetida.status} ${repetida.corpo.error}`);
        const lista = await json(`/negociacoes?atividade_id=${atividadeId}`);
        conferir('lista traz a revisão ligada à rodada', (lista.corpo[0]?.budget?.versions || []).some((v: any) => (v.motivo_revisao || '').includes(`rodada:${rod.corpo.id}`)));
        const neg2 = await prisma.negociacao.findUnique({ where: { id: neg.corpo.id } });
        conferir('valor original da negociação não muda', neg2?.valor_original === 6000, String(neg2?.valor_original));

        console.log('\n── 3. Modelo de etapas de Projeto');
        const pj = await json('/atividades', 'POST', {
            titulo: `Projeto Executivo ${SUFIXO}`, tipo_demanda: 'PROJETO', sharing: 'HIGHLINE',
            id_site_sharing: `TSTJ${SUFIXO}`, operadora: 'TIM', id_site_operadora: `TSTJ${SUFIXO}T`, estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE,
        });
        if (!pj.ok) throw new Error(`atividade de projeto: ${pj.corpo.error}`);
        projetoId = pj.corpo.id; siteProjeto = pj.corpo.site_id;
        const ap = await json(`/cronograma/atividades/${projetoId}/aplicar-modelo`, 'POST', {});
        const etapas = await prisma.cronogramaItem.findMany({ where: { atividade_id: projetoId }, orderBy: { ordem: 'asc' } });
        conferir('4 etapas de projeto na ordem', ap.ok && etapas.map(e => e.categoria).join(',') === 'VISTORIA,PROJETO,ART,ENTREGA_DOCUMENTACAO', `${ap.corpo.error || ''} ${etapas.map(e => e.categoria).join(',')}`);
    } finally {
        if (budgetId) {
            const negs = await prisma.negociacao.findMany({ where: { budget_id: budgetId } });
            await prisma.contraproposta.deleteMany({ where: { negociacao_id: { in: negs.map(x => x.id) } } });
            await prisma.negociacao.deleteMany({ where: { budget_id: budgetId } });
            await prisma.budgetItem.deleteMany({ where: { budget_id: budgetId } });
            await prisma.budgetVersion.deleteMany({ where: { budget_id: budgetId } });
            await prisma.auditLog.deleteMany({ where: { entidade_id: budgetId } });
            await prisma.budget.delete({ where: { id: budgetId } }).catch(e => console.log('   (limpeza) orçamento:', e.message));
        }
        if (projetoId) await prisma.cronogramaItem.deleteMany({ where: { atividade_id: projetoId } });
        for (const [id, site] of [[atividadeId, siteId], [projetoId, siteProjeto]]) {
            if (id) await json(`/atividades/${id}`, 'DELETE', { motivo: TESTE });
            if (site) await json(`/sites/${site}`, 'DELETE');
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
