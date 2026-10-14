/**
 * Clientes como fonte única de sharings e operadoras (13/10/2026).
 *
 *   - junta clientes duplicados da mesma sharing/operadora (ex.: "HIGHLINE" e
 *     "Highline do Brasil"): fica o que tem mais vínculos, os demais vínculos
 *     (atividades, orçamentos, projetos, LPUs, regras de faturamento) passam
 *     para ele e o duplicado é apagado;
 *   - garante a sigla (código gravado na atividade e no site) e o tipo;
 *   - cadastra as sharings da lista antiga, as detentoras já usadas em Sites e
 *     as sharings/operadoras já usadas em atividades.
 *
 * Idempotente. Sem --aplicar só mostra o que faria.
 *
 *   npx tsx src/backend/scripts/unificar-clientes-sharing.ts
 *   npx tsx src/backend/scripts/unificar-clientes-sharing.ts --aplicar
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APLICAR = process.argv.includes('--aplicar');
const sem = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

interface Entrada { codigo: string; nome: string; tipo: 'SHARING' | 'OPERADORA'; parecidos: RegExp }
const CATALOGO: Entrada[] = [
    { codigo: 'HIGHLINE', nome: 'Highline do Brasil', tipo: 'SHARING', parecidos: /^HIGHLINE\b/ },
    { codigo: 'IHS', nome: 'IHS Towers', tipo: 'SHARING', parecidos: /^IHS\b/ },
    { codigo: 'WINITY', nome: 'Winity', tipo: 'SHARING', parecidos: /^WINITY\b/ },
    { codigo: 'SBA', nome: 'SBA Torres', tipo: 'SHARING', parecidos: /^SBA\b/ },
    { codigo: 'AMERICAN TOWER', nome: 'American Tower', tipo: 'SHARING', parecidos: /^AMERICAN TOWER\b/ },
    { codigo: 'PHOENIX', nome: 'Phoenix Tower', tipo: 'SHARING', parecidos: /^PHOENIX\b/ },
    { codigo: 'VIVO', nome: 'Vivo / Telefônica', tipo: 'OPERADORA', parecidos: /^(VIVO|TELEFONICA)\b/ },
    { codigo: 'CLARO', nome: 'Claro', tipo: 'OPERADORA', parecidos: /^CLARO\b/ },
    { codigo: 'TIM', nome: 'TIM', tipo: 'OPERADORA', parecidos: /^TIM\b/ },
    { codigo: 'OI', nome: 'Oi', tipo: 'OPERADORA', parecidos: /^OI\b/ },
];

async function vinculos(id: string) {
    const [a, b, c, p, r] = await Promise.all([
        prisma.atividade.count({ where: { contratante_id: id } }), prisma.budget.count({ where: { contratante_id: id } }),
        prisma.acionamento.count({ where: { contratante_id: id } }), prisma.priceBook.count({ where: { contratante_id: id } }),
        prisma.regraFaturamento.count({ where: { contratante_id: id } }),
    ]);
    return a + b + c + p + r;
}

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const { id: tenant_id } of tenants) {
        // Detentoras de Sites e sharings/operadoras de atividades que não estão no catálogo.
        const extras = new Map<string, 'SHARING' | 'OPERADORA'>();
        const sites = await prisma.site.findMany({ where: { tenant_id, detentora: { not: null } }, select: { detentora: true }, distinct: ['detentora'] });
        const atvs = await prisma.atividade.findMany({ where: { tenant_id }, select: { sharing: true, operadora: true } });
        for (const s of sites) extras.set(sem(s.detentora!), 'SHARING');
        for (const a of atvs) { if (a.sharing) extras.set(sem(a.sharing), extras.get(sem(a.sharing)) || 'SHARING'); if (a.operadora) extras.set(sem(a.operadora), extras.get(sem(a.operadora)) || 'OPERADORA'); }
        const lista: Entrada[] = [...CATALOGO];
        for (const [codigo, tipo] of extras) {
            if (!codigo || codigo === 'OUTROS' || lista.some(e => sem(e.codigo) === codigo)) continue;
            lista.push({ codigo, nome: codigo, tipo, parecidos: new RegExp(`^${codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) });
        }

        const clientes = await prisma.contratante.findMany({ where: { tenant_id } });
        for (const e of lista) {
            const achados = clientes.filter(c => sem(c.sigla || '') === sem(e.codigo) || e.parecidos.test(sem(c.nome)));
            if (!achados.length) {
                console.log(`+ criar ${e.tipo} ${e.codigo} (${e.nome})`);
                if (APLICAR) await prisma.contratante.create({ data: { tenant_id, nome: e.nome, sigla: e.codigo, tipo: e.tipo } });
                continue;
            }
            const comVinculos = await Promise.all(achados.map(async c => ({ c, n: await vinculos(c.id) })));
            comVinculos.sort((x, y) => y.n - x.n);
            const fica = comVinculos[0].c;
            const nome = achados.map(c => c.nome).sort((x, y) => y.length - x.length)[0];
            // Operadora que já é sharing vira "Sharing e operadora"; cliente comum vira o tipo do catálogo.
            const tipo = fica.tipo === 'SHARING_OPERADORA' || (fica.tipo === 'SHARING' && e.tipo === 'OPERADORA') || (fica.tipo === 'OPERADORA' && e.tipo === 'SHARING') ? 'SHARING_OPERADORA' : e.tipo;
            console.log(`= ${e.codigo}: fica "${nome}" (${fica.id.slice(0, 8)}, ${comVinculos[0].n} vínculos), tipo ${tipo}${achados.length > 1 ? `; junta ${achados.length - 1} duplicado(s)` : ''}`);
            if (!APLICAR) continue;
            for (const { c } of comVinculos.slice(1)) {
                await prisma.$transaction([
                    prisma.atividade.updateMany({ where: { contratante_id: c.id }, data: { contratante_id: fica.id } }),
                    prisma.budget.updateMany({ where: { contratante_id: c.id }, data: { contratante_id: fica.id } }),
                    prisma.acionamento.updateMany({ where: { contratante_id: c.id }, data: { contratante_id: fica.id } }),
                    prisma.priceBook.updateMany({ where: { contratante_id: c.id }, data: { contratante_id: fica.id } }),
                    prisma.regraFaturamento.updateMany({ where: { contratante_id: c.id }, data: { contratante_id: fica.id } }),
                    prisma.contratante.delete({ where: { id: c.id } }),
                ]);
            }
            await prisma.contratante.update({ where: { id: fica.id }, data: { sigla: e.codigo, tipo, nome, razao_social: fica.razao_social || achados.find(c => c.razao_social)?.razao_social || null, cnpj: fica.cnpj || achados.find(c => c.cnpj)?.cnpj || null } });
        }
    }
    console.log(APLICAR ? '\nAplicado.' : '\nSimulação — use --aplicar para gravar.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
