// Double check da PV dentro das Atividades.
//
// Compara as três pontas que deveriam contar a mesma história:
//   A. HIGHLINE_PV_CATALOG   catálogo no código, gerado do template oficial
//   B. base "PV Padrão Highline" (PV_CLIENTE) no banco — o que a tela de LPUs edita
//   C. itens gravados no orçamento de cada Atividade de implantação Highline
//
//   npx tsx src/backend/scripts/auditar-pv-atividade.ts

import { PrismaClient } from '@prisma/client';
import { HIGHLINE_PV_CATALOG } from '../data/highline-pv-catalog';

const prisma = new PrismaClient();

const cent = (v: number) => Math.round(v * 100);
const rs = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
    // ── A x B: catálogo do código x base no banco ────────────────────────────
    console.log('== A x B — catálogo do código  x  base "PV Padrão Highline" ==\n');

    const pv = await prisma.priceBook.findFirst({ where: { origem: 'PV_CLIENTE', status: 'ATIVA' } });
    if (!pv) {
        console.log('  NENHUMA base PV_CLIENTE ativa. A Atividade não terá preço de referência.');
        await prisma.$disconnect();
        return;
    }

    const itensBase = await prisma.priceBookItem.findMany({
        where: { pricebook_id: pv.id, ativo: true },
    });
    const basePorLinha = new Map(itensBase.filter(i => i.highline_template_row != null)
        .map(i => [i.highline_template_row!, i]));

    console.log(`  base: "${pv.nome_lpu}" · ${itensBase.length} itens`);
    console.log(`  catálogo do código: ${HIGHLINE_PV_CATALOG.length} linhas`);

    const semNaBase: number[] = [];
    const divergencias: string[] = [];
    for (const c of HIGHLINE_PV_CATALOG) {
        const b = basePorLinha.get(c.templateRow);
        if (!b) { semNaBase.push(c.templateRow); continue; }
        if (b.codigo_item !== c.code) divergencias.push(`linha ${c.templateRow}: código "${b.codigo_item}" na base x "${c.code}" no catálogo`);
        if (b.descricao.trim() !== c.description.trim()) divergencias.push(`linha ${c.templateRow} (${c.code}): descrição divergente`);
        if (b.unidade.trim() !== c.unit.trim()) divergencias.push(`linha ${c.templateRow} (${c.code}): unidade "${b.unidade}" x "${c.unit}"`);
        if ((b.subtipo || '').trim() !== c.category.trim()) divergencias.push(`linha ${c.templateRow} (${c.code}): categoria "${b.subtipo}" x "${c.category}"`);
    }
    const sobrandoNaBase = itensBase.filter(i => i.highline_template_row == null
        || !HIGHLINE_PV_CATALOG.some(c => c.templateRow === i.highline_template_row));

    console.log(`  linhas do catálogo ausentes na base : ${semNaBase.length}`);
    console.log(`  itens na base fora do catálogo      : ${sobrandoNaBase.length}`);
    console.log(`  divergências de estrutura           : ${divergencias.length}`);
    divergencias.slice(0, 10).forEach(d => console.log(`     · ${d}`));

    const comPreco = itensBase.filter(i => i.valor_unitario > 0);
    console.log(`  itens com preço                     : ${comPreco.length} de ${itensBase.length}`);

    // ── C: itens gravados nos orçamentos das Atividades ──────────────────────
    console.log('\n== C — itens de PV gravados nas Atividades ==\n');

    const atividades = await prisma.atividade.findMany({
        where: { tipo_demanda: 'IMPLANTACAO' },
        include: {
            orcamentos: {
                include: { items: { where: { highline_template_row: { not: null } } } },
            },
        },
    });

    const implantacaoHighline = atividades.filter(a => (a.sharing || '').trim().toUpperCase() === 'HIGHLINE');
    console.log(`  Atividades de implantação: ${atividades.length} (Highline: ${implantacaoHighline.length})`);

    let totalItens = 0, foraDoCatalogo = 0, semPrecoNaBase = 0;
    let iguais = 0, divergentes = 0, semVinculo = 0;
    const detalhes: string[] = [];

    for (const a of implantacaoHighline) {
        for (const orc of a.orcamentos) {
            if (orc.items.length === 0) {
                console.log(`  · ${a.codigo} / orçamento ${orc.id.slice(0, 8)} (${orc.tipo_orcamento}): NENHUM item de PV gravado`);
                continue;
            }
            console.log(`  · ${a.codigo} / orçamento ${orc.id.slice(0, 8)} (${orc.tipo_orcamento}): ${orc.items.length} itens de PV`);
            for (const it of orc.items) {
                totalItens += 1;
                const b = basePorLinha.get(it.highline_template_row!);
                if (!b) { foraDoCatalogo += 1; detalhes.push(`${a.codigo} linha ${it.highline_template_row}: não existe na base`); continue; }
                if (!it.source_pricebook_item_id) semVinculo += 1;
                if (!(b.valor_unitario > 0)) { semPrecoNaBase += 1; continue; }
                if (cent(it.valor_unitario) === cent(b.valor_unitario)) iguais += 1;
                else {
                    divergentes += 1;
                    detalhes.push(
                        `${a.codigo} ${b.codigo_item}: orçamento R$ ${rs(it.valor_unitario)} x base R$ ${rs(b.valor_unitario)}`
                        + `${it.user_overridden ? ' (marcado como alterado de propósito)' : ' (SEM marca de alteração — provável valor congelado)'}`,
                    );
                }
            }
        }
    }

    console.log('');
    console.log(`  itens de PV auditados          : ${totalItens}`);
    console.log(`  preço igual ao da base         : ${iguais}`);
    console.log(`  preço divergente da base       : ${divergentes}`);
    console.log(`  item sem preço na base         : ${semPrecoNaBase}`);
    console.log(`  linha inexistente na base      : ${foraDoCatalogo}`);
    console.log(`  sem vínculo com o item da LPU  : ${semVinculo} (source_pricebook_item_id vazio)`);
    if (detalhes.length) {
        console.log('');
        detalhes.slice(0, 25).forEach(d => console.log(`     · ${d}`));
        if (detalhes.length > 25) console.log(`     ... e mais ${detalhes.length - 25}`);
    }

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('Falhou:', e.message);
    await prisma.$disconnect();
    process.exit(1);
});
