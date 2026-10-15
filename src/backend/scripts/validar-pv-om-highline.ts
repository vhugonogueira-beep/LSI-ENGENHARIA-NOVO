/**
 * Operação Highline: Orçamento LS pela LPU Operações + PV O&M Highline (14/10/2026).
 *
 *   1. a LPU de custo da atividade é a "LPU Operações LS Office"; a de preço ao
 *      cliente, a "PV O&M Highline";
 *   2. item vindo da LPU com código original O&M já sugere esse código;
 *   3. vínculos: dois itens LS no mesmo código somam numa linha da PV O&M;
 *   4. preço sem histórico sai do Orçamento LS; editado, é preservado quando o
 *      Orçamento LS é salvo de novo; num orçamento novo, vira o "último valor";
 *   5. código inexistente é recusado; implantação não tem PV O&M.
 *
 * Precisa das bases importadas (importar-lpu-operacoes.ts); sem elas, pula.
 *
 *   npx tsx src/backend/scripts/validar-pv-om-highline.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

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
const post = (c: string, corpo: unknown) => json(c, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });
const put = (c: string, corpo: unknown) => json(c, { method: 'PUT', headers: cab, body: JSON.stringify(corpo) });

async function main() {
    const lpu = await prisma.priceBook.findFirst({ where: { nome_lpu: 'LPU Operações LS Office' } });
    const pvBase = await prisma.priceBook.findFirst({ where: { nome_lpu: 'PV O&M Highline' } });
    if (!lpu || !pvBase) { console.log('   (bases de operação não importadas — roteiro pulado)\n\nTudo certo.'); return; }
    const itemComOm = await prisma.priceBookItem.findFirst({ where: { pricebook_id: lpu.id, pv_item_id: { not: null } }, include: { pv_item: true } });

    const atividades: { id: string; site: string }[] = [];
    const budgets: string[] = [];
    try {
        const novaAtividade = async (n: number, tipo: 'OPERACAO' | 'IMPLANTACAO') => {
            const site = `TOM${n}${SUFIXO}`;
            const at = await post('/atividades', {
                titulo: `Teste PV O&M ${n} ${SUFIXO}`, tipo_demanda: tipo, subtipo_demanda: tipo === 'OPERACAO' ? 'MANUTENCAO' : undefined,
                modelo_operacao: tipo === 'OPERACAO' ? 'EXECUCAO_DIRETA' : 'MEDIANTE_APROVACAO',
                sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'TIM', id_site_operadora: `${site}T`,
                estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE });
            if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
            atividades.push({ id: at.corpo.id, site: at.corpo.site_id });
            const b = await post('/budgets', { tenant_id: at.corpo.tenant_id, contratante_id: at.corpo.contratante_id, atividade_id: at.corpo.id, assunto: TESTE, tipo_orcamento: 'ORCAMENTO_LS' });
            if (!b.ok) throw new Error(`orçamento: ${b.corpo.error}`);
            budgets.push(b.corpo.id);
            return { atividade: at.corpo, budget: b.corpo };
        };
        const salvarLs = async (budgetId: string, itens: any[]) => {
            const b = (await json(`/budgets/${budgetId}`)).corpo;
            return put(`/budgets/${budgetId}/items`, { versaoAtual: b.versao_atual, expectedUpdatedAt: b.updated_at, scope: 'orcamento_ls', items: itens });
        };

        console.log('\n── 1. Bases da atividade');
        const { atividade, budget } = await novaAtividade(1, 'OPERACAO');
        const lpus = (await json(`/atividades/${atividade.id}/lpus`)).corpo;
        conferir('custo = LPU Operações LS Office', lpus.custo?.nome === 'LPU Operações LS Office', JSON.stringify(lpus.custo));
        conferir('preço ao cliente = PV O&M Highline', lpus.precoCliente?.nome === 'PV O&M Highline', JSON.stringify(lpus.precoCliente));

        console.log('\n── 2. Sugestões');
        const itens = [
            { titulo: itemComOm?.descricao || 'Item da LPU', unidade: 'UN', quantidade: 2, valor_unitario: 100, bloco: 'Energia', ordem: 0, source_pricebook_item_id: itemComOm?.id },
            { titulo: 'Aterramento do portão', unidade: 'UN', quantidade: 3, valor_unitario: 50, bloco: 'Energia', ordem: 1 },
            { titulo: 'Item sem correspondência xyz', unidade: 'VB', quantidade: 1, valor_unitario: 999, bloco: 'Outros', ordem: 2 },
        ];
        const s1 = await salvarLs(budget.id, itens);
        conferir('Orçamento LS salvo', s1.ok, JSON.stringify(s1.corpo).slice(0, 200));
        const sug = (await json(`/budgets/${budget.id}/pv-om/vinculos`)).corpo;
        conferir('catálogo O&M carregado', sug.catalogo?.length > 400, String(sug.catalogo?.length));
        const [i1, i2, i3] = sug.itens || [];
        if (itemComOm) conferir('item da LPU sugere o código O&M da planilha', i1?.sugestoes?.[0]?.codigo === itemComOm.pv_item!.codigo_item && i1.sugestoes[0].motivo === 'código da LPU', JSON.stringify(i1?.sugestoes?.[0]));

        console.log('\n── 3. Vínculos');
        const codigo = itemComOm?.pv_item?.codigo_item || sug.catalogo[0].codigo;
        const pv = await put(`/budgets/${budget.id}/pv-om/vinculos`, { vinculos: [{ item_id: i1.id, codigo }, { item_id: i2.id, codigo }, { item_id: i3.id, codigo: null }] });
        conferir('vínculos salvos', pv.ok, JSON.stringify(pv.corpo).slice(0, 200));
        const linha = pv.corpo.linhas?.[0];
        conferir('dois itens LS somam numa linha (qtd 5, R$ 350)', pv.corpo.linhas?.length === 1 && linha.quantidade === 5 && linha.total === 350 && linha.itens_ls.length === 2, JSON.stringify(linha));
        conferir('preço sem histórico vem do Orçamento LS', linha?.origem_preco === 'Do Orçamento LS' && linha.valor_unitario === 70, `${linha?.origem_preco} ${linha?.valor_unitario}`);
        conferir('item sem vínculo fica fora e é avisado', pv.corpo.sem_vinculo?.length === 1);
        const errado = await put(`/budgets/${budget.id}/pv-om/vinculos`, { vinculos: [{ item_id: i1.id, codigo: 'O&M99999' }] });
        conferir('código inexistente recusado', errado.status === 400 && /inexistente/.test(errado.corpo.error), JSON.stringify(errado.corpo));

        console.log('\n── 4. Preço editado e histórico');
        const ed = await put(`/budgets/${budget.id}/pv-om/itens`, { itens: [{ id: linha.id, quantidade: 5, valor_unitario: 80 }] });
        conferir('preço editado', ed.ok && ed.corpo.linhas[0].total === 400 && ed.corpo.linhas[0].editado, JSON.stringify(ed.corpo).slice(0, 200));
        const atual = (await json(`/budgets/${budget.id}`)).corpo.items.filter((i: any) => i.origem_item === 'ORCAMENTO_LS').sort((a: any, b: any) => a.ordem - b.ordem);
        await salvarLs(budget.id, atual.map((i: any) => ({ ...i, quantidade: i.ordem === 1 ? 4 : i.quantidade })));
        const depois = (await json(`/budgets/${budget.id}/pv-om`)).corpo.linhas[0];
        conferir('salvar o LS mantém o preço editado e atualiza a quantidade', depois?.valor_unitario === 80 && depois.quantidade === 6, JSON.stringify(depois));
        const b2 = (await json(`/budgets/${budget.id}`)).corpo;
        await put(`/budgets/${budget.id}/items`, { versaoAtual: b2.versao_atual, expectedUpdatedAt: b2.updated_at, scope: 'internal', items: [] });
        conferir('salvar o Custo LS não apaga a PV O&M', (await json(`/budgets/${budget.id}/pv-om`)).corpo.linhas?.length === 1);

        const outro = await novaAtividade(2, 'OPERACAO');
        await salvarLs(outro.budget.id, [{ titulo: 'Outro item', unidade: 'UN', quantidade: 1, valor_unitario: 10, bloco: 'X', ordem: 0 }]);
        const s2 = (await json(`/budgets/${outro.budget.id}/pv-om/vinculos`)).corpo;
        const pv2 = await put(`/budgets/${outro.budget.id}/pv-om/vinculos`, { vinculos: [{ item_id: s2.itens[0].id, codigo }] });
        conferir('orçamento novo sugere o último valor usado', pv2.corpo.linhas?.[0]?.valor_unitario === 80 && /Último valor/.test(pv2.corpo.linhas[0].origem_preco), JSON.stringify(pv2.corpo.linhas?.[0]));

        console.log('\n── 5. Excel no layout da Highline');
        const rx = await fetch(`${API}/budgets/${budget.id}/pv-om/excel`);
        conferir('Excel baixado', rx.ok && /PV_OM_TOM1/.test(rx.headers.get('content-disposition') || ''), `HTTP ${rx.status} ${rx.headers.get('content-disposition')}`);
        if (rx.ok) {
            const ExcelJS = (await import('exceljs')).default;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(Buffer.from(await rx.arrayBuffer()) as any);
            const ws = wb.worksheets[0];
            const linha = (n: number) => (ws.getRow(n).values as any[]).slice(1).map(v => (v === null || v === undefined ? '' : String(v)));
            conferir('cabeçalho igual ao modelo', linha(1).join('|') === 'Cliente|PASSIVO|Tipo Requisição|Estoque|Código Site|Produto|Descrição Comp|Quantidade|Fornecedor|Loja|Filial|LPU|Valor', linha(1).join('|'));
            const l2 = linha(2);
            conferir('linha: fixos, site, código, unitário, qtd e total', l2[0] === '31' && l2[1] === 'PASSIVO' && l2[2] === '51' && l2[4] === `TOM1${SUFIXO}` && l2[5] === codigo && l2[6] === '80' && l2[7] === '6' && l2[8] === 'UNINC9' && l2[9] === '1' && l2[10] === '12' && l2[11] === 'NÃO' && l2[12] === '480', l2.join('|'));
        }

        console.log('\n── 6. Implantação');
        const impl = await novaAtividade(3, 'IMPLANTACAO');
        const r = await json(`/budgets/${impl.budget.id}/pv-om`);
        conferir('implantação não tem PV O&M', r.status === 400, JSON.stringify(r.corpo));
    } finally {
        for (const id of budgets) {
            await prisma.budgetItem.deleteMany({ where: { budget_id: id } });
            await prisma.auditLog.deleteMany({ where: { entidade_id: id } });
            await prisma.budget.delete({ where: { id } }).catch(() => undefined);
        }
        for (const a of atividades) {
            await json(`/atividades/${a.id}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
            if (a.site) await json(`/sites/${a.site}`, { method: 'DELETE' });
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
