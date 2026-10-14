/**
 * Validade em documento que não vence (14/10/2026, correção 2 do Kayky).
 *
 * RG, CPF e os demais tipos sem validade passaram a não aceitar data de
 * validade. Registros antigos podem ter data inventada para conseguir salvar
 * (ex.: 01/01/0001). Este script limpa a validade desses tipos e lista — sem
 * alterar — datas fora de 1900–2100 em tipos que vencem, para conferência.
 *
 * Sem --aplicar só mostra o que faria. Idempotente.
 *
 *   npx tsx src/backend/scripts/corrigir-validade-identificacao.ts
 *   npx tsx src/backend/scripts/corrigir-validade-identificacao.ts --aplicar
 */
import { prisma } from '../server';
import { catalogo, possuiValidade } from '../services/sst.service';

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    let total = 0;
    for (const { id: tenant_id } of tenants) {
        const cat = await catalogo(tenant_id);
        const docs = await prisma.qualificacao.findMany({
            where: { tenant_id, data_validade: { not: null } },
            select: { id: true, tipo: true, data_validade: true, supplier: { select: { nome: true } }, membro: { select: { nome: true } }, funcionario: { select: { nome: true } } },
        });
        const dono = (d: typeof docs[number]) => d.membro?.nome || d.funcionario?.nome || d.supplier?.nome || '—';
        const semValidade = docs.filter(d => !possuiValidade(cat, d.tipo));
        for (const d of semValidade) console.log(`limpar  ${d.tipo.padEnd(24)} ${d.data_validade!.toISOString().slice(0, 10)}  ${dono(d)}`);
        total += semValidade.length;
        if (aplicar && semValidade.length) {
            await prisma.qualificacao.updateMany({ where: { id: { in: semValidade.map(d => d.id) } }, data: { data_validade: null } });
        }
        const absurdas = docs.filter(d => possuiValidade(cat, d.tipo) && (d.data_validade!.getUTCFullYear() < 1900 || d.data_validade!.getUTCFullYear() > 2100));
        for (const d of absurdas) console.log(`conferir ${d.tipo.padEnd(23)} ${d.data_validade!.toISOString().slice(0, 10)}  ${dono(d)}  (tipo que vence: não alterado)`);
    }
    console.log(`\n${total} documento(s) sem validade com data gravada.${aplicar ? ' Validade limpa.' : ' Simulação — use --aplicar para limpar.'}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
