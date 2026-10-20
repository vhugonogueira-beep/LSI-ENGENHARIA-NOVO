/**
 * Conferência PO × orçamento (19/10/2026):
 *
 *   - PO com o mesmo total do orçamento → CONFERE (centavos de arredondamento não contam);
 *   - PO com valor diferente → DIVERGE, com a diferença;
 *   - PO de outro site → DIVERGE;
 *   - linha da PO igual a um item do orçamento → comparada linha a linha;
 *   - a divergência aparece nas pendências da aba PO e faturamento.
 *
 * Usa a PO real da atividade de referência (PAMRB008); altera valor, site e descrição
 * só durante o teste e devolve tudo como estava.
 *
 *   npx tsx src/backend/scripts/validar-conferencia-po.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function conferencia(atividadeId: string) {
    const r = await fetch(`${API}/pos/conferencia-orcamento?atividade_id=${atividadeId}`);
    return { status: r.status, c: await r.json().catch(() => ({})) as any };
}

async function main() {
    const po = await prisma.purchaseOrder.findFirst({
        where: { atividade: { id_site_sharing: 'PAMRB008' }, linhas: { some: {} } },
        include: { linhas: { orderBy: { ordem: 'asc' } } },
    });
    if (!po) throw new Error('PO de referência (PAMRB008) não encontrada');
    const original = { valor: po.valor, linha: { ...po.linhas[0] } };
    try {
        console.log('\n── Situação real');
        const base = await conferencia(po.atividade_id);
        conferir('rota responde', base.status === 200, `HTTP ${base.status} ${base.c.error || ''}`);
        conferir('total da PO confere com o orçamento (centavos ignorados)', base.c.total_confere === true, `PO ${base.c.total_po} × ref ${base.c.referencia?.valor}`);
        conferir('site confere', base.c.sites?.confere === true, JSON.stringify(base.c.sites));
        conferir('PO material/serviço → conferência pelo total', base.c.modo_linhas === 'TOTAL', base.c.modo_linhas);
        const sem = await fetch(`${API}/pos/conferencia-orcamento`);
        conferir('sem atividade_id → 400', sem.status === 400, `HTTP ${sem.status}`);

        console.log('\n── Valor diferente');
        await prisma.purchaseOrder.update({ where: { id: po.id }, data: { valor: (po.valor || 0) + 1500 } });
        const caro = await conferencia(po.atividade_id);
        conferir('PO R$ 1.500 acima → DIVERGE', caro.c.situacao === 'DIVERGE' && Math.abs(caro.c.diferenca - 1500) < 1.01, `${caro.c.situacao} ${caro.c.diferenca}`);
        conferir('resumo diz que está acima', /acima/i.test(caro.c.resumo || ''), caro.c.resumo);
        const pend = await fetch(`${API}/atividades/${po.atividade_id}/pendencias`).then(r => r.ok ? r.json() : null).catch(() => null);
        if (pend) conferir('pendência na aba PO e faturamento', JSON.stringify(pend.faturamento || pend).includes('PO diverge do orçamento'), JSON.stringify(pend.faturamento));
        await prisma.purchaseOrder.update({ where: { id: po.id }, data: { valor: original.valor } });

        console.log('\n── Site diferente');
        await prisma.purchaseOrderLinha.update({ where: { id: original.linha.id }, data: { site: 'XXTESTE99' } });
        const site = await conferencia(po.atividade_id);
        conferir('site da PO diferente → DIVERGE', site.c.situacao === 'DIVERGE' && site.c.sites.confere === false, JSON.stringify(site.c.sites));

        console.log('\n── Linha a linha');
        await prisma.purchaseOrderLinha.update({
            where: { id: original.linha.id },
            data: { site: original.linha.site, descricao: 'MALHA DE ATERRAMENTO', quantidade: 40, valor_unitario: 270, valor_total: 10800 },
        });
        const item = await conferencia(po.atividade_id);
        const l = item.c.linhas?.find((x: any) => x.numero_linha === original.linha.numero_linha);
        conferir('linha casada com o item do orçamento', item.c.modo_linhas === 'ITENS' && /aterramento/i.test(l?.referencia?.descricao || ''), JSON.stringify(l?.referencia));
        conferir('quantidade 40 × 45 → QUANTIDADE', l?.situacao === 'QUANTIDADE', l?.situacao);
        conferir('itens do orçamento sem linha na PO listados', (item.c.sem_po?.length || 0) > 0, String(item.c.sem_po?.length));
    } finally {
        await prisma.purchaseOrder.update({ where: { id: po.id }, data: { valor: original.valor } });
        const { id, po_id, ...resto } = original.linha as any;
        await prisma.purchaseOrderLinha.update({ where: { id }, data: { site: resto.site, descricao: resto.descricao, quantidade: resto.quantidade, valor_unitario: resto.valor_unitario, valor_total: resto.valor_total } });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(async e => { console.error('Erro:', e.message); process.exitCode = 1; await prisma.$disconnect(); });
