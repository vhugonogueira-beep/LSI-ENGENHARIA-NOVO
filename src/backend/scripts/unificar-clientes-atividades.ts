// Sharing e operadora pelo cadastro de Clientes (23/10/2026).
//
//   1. Cliente duplicado: o cadastro inativo (ou repetido) que corresponde a um
//      ativo — mesmo nome, ou duas Highline ("HIGHLINE" × "Highline do Brasil") —
//      tem tudo o que aponta para ele (atividades, orçamentos, LPUs, projetos,
//      regras de faturamento) passado para o ativo; o repetido fica inativo.
//   2. Atividades: o sharing vira o NOME do cadastro (tipo Sharing ou Sharing e
//      operadora) e a atividade fica ligada a ele (contratante_id); a operadora
//      vira o nome do cadastro (tipo Operadora ou Sharing e operadora).
//   3. Sites: a detentora e as operadoras do site passam ao nome do cadastro
//      (em maiúsculas, como o site grava).
//   O que não casar com nenhum cadastro é listado e fica como está.
//
// Sem --aplicar só mostra o que mudaria.
//
//   npx tsx src/backend/scripts/unificar-clientes-atividades.ts [--aplicar]

import { PrismaClient } from '@prisma/client';
import { acharCliente, chaveNome, ehHighline, TIPOS_OPERADORA, TIPOS_SHARING } from '../utils/cliente-nome';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const maiusculo = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const { id: tenant } of tenants) {
        console.log(`\n══ Tenant ${tenant}`);
        const clientes = await prisma.contratante.findMany({ where: { tenant_id: tenant }, orderBy: { created_at: 'asc' } });
        const ativos = clientes.filter(c => c.ativo);

        // ── 1. duplicados
        const fundir: { de: typeof clientes[number]; para: typeof clientes[number] }[] = [];
        for (const c of clientes) {
            const par = ativos.find(a => a.id !== c.id && (chaveNome(a.nome) === chaveNome(c.nome) || (ehHighline(a.nome) && ehHighline(c.nome))));
            if (!par) continue;
            // Entre dois ativos repetidos, fica o mais antigo.
            if (c.ativo && clientes.indexOf(c) < clientes.indexOf(par)) continue;
            if (fundir.some(f => f.de.id === par.id)) continue;
            fundir.push({ de: c, para: par });
        }
        console.log(`\n── Clientes repetidos: ${fundir.length}`);
        for (const { de, para } of fundir) {
            const onde = { contratante_id: de.id };
            const n = {
                atividades: await prisma.atividade.count({ where: onde }), orcamentos: await prisma.budget.count({ where: onde }),
                lpus: await prisma.priceBook.count({ where: onde }), projetos: await prisma.acionamento.count({ where: onde }),
                regras: await prisma.regraFaturamento.count({ where: onde }),
            };
            console.log(`  "${de.nome}"${de.ativo ? '' : ' (inativo)'} → "${para.nome}": ${n.atividades} atividade(s), ${n.orcamentos} orçamento(s), ${n.lpus} LPU(s), ${n.projetos} projeto(s), ${n.regras} regra(s)`);
            if (!aplicar) continue;
            await prisma.$transaction([
                prisma.atividade.updateMany({ where: onde, data: { contratante_id: para.id } }),
                prisma.budget.updateMany({ where: onde, data: { contratante_id: para.id } }),
                prisma.priceBook.updateMany({ where: onde, data: { contratante_id: para.id } }),
                prisma.acionamento.updateMany({ where: onde, data: { contratante_id: para.id } }),
                prisma.regraFaturamento.updateMany({ where: onde, data: { contratante_id: para.id } }),
                prisma.contratante.update({ where: { id: de.id }, data: { ativo: false } }),
            ]);
        }

        const sharings = ativos.filter(c => TIPOS_SHARING.includes(c.tipo) && !fundir.some(f => f.de.id === c.id));
        const operadoras = ativos.filter(c => TIPOS_OPERADORA.includes(c.tipo) && !fundir.some(f => f.de.id === c.id));

        // ── 2. atividades
        const atividades = await prisma.atividade.findMany({ where: { tenant_id: tenant }, select: { id: true, codigo: true, sharing: true, operadora: true, contratante_id: true } });
        const semSharing = new Set<string>(), semOperadora = new Set<string>();
        let mudam = 0;
        console.log(`\n── Atividades`);
        for (const a of atividades) {
            const s = acharCliente(sharings, a.sharing);
            const o = a.operadora ? acharCliente(operadoras, a.operadora) : null;
            if (!s) semSharing.add(a.sharing);
            if (a.operadora && !o) semOperadora.add(a.operadora);
            const novo = { sharing: s?.nome ?? a.sharing, contratante_id: s?.id ?? a.contratante_id, operadora: o?.nome ?? a.operadora };
            if (novo.sharing === a.sharing && novo.contratante_id === a.contratante_id && novo.operadora === a.operadora) continue;
            mudam++;
            console.log(`  ${a.codigo}: sharing "${a.sharing}" → "${novo.sharing}"${novo.operadora !== a.operadora ? ` · operadora "${a.operadora}" → "${novo.operadora}"` : ''}${novo.contratante_id !== a.contratante_id ? ' · ligada ao cadastro' : ''}`);
            if (aplicar) await prisma.atividade.update({ where: { id: a.id }, data: novo });
        }
        console.log(`  ${mudam} de ${atividades.length} atividade(s) mudam`);

        // ── 3. sites
        const sites = await prisma.site.findMany({ where: { tenant_id: tenant }, select: { id: true, detentora: true, id_site_detentora: true, operadoras: { select: { id: true, operadora: true, id_site: true } } } });
        console.log(`\n── Sites`);
        let sitesMudam = 0;
        for (const site of sites) {
            if (site.detentora) {
                const c = acharCliente(sharings, site.detentora);
                if (!c) semSharing.add(site.detentora);
                const nova = c ? maiusculo(c.nome) : site.detentora;
                if (nova !== site.detentora) {
                    const conflito = sites.find(x => x.id !== site.id && x.detentora === nova && x.id_site_detentora === site.id_site_detentora);
                    if (conflito) { console.log(`  ${site.id_site_detentora}: já existe outro site "${nova}" com este ID — resolver à mão`); }
                    else {
                        sitesMudam++;
                        console.log(`  ${site.id_site_detentora}: detentora "${site.detentora}" → "${nova}"`);
                        if (aplicar) await prisma.site.update({ where: { id: site.id }, data: { detentora: nova } });
                    }
                }
            }
            for (const op of site.operadoras) {
                const c = acharCliente(operadoras, op.operadora);
                if (!c) { semOperadora.add(op.operadora); continue; }
                const nova = maiusculo(c.nome);
                if (nova === op.operadora) continue;
                const repetido = site.operadoras.some(x => x.id !== op.id && x.operadora === nova && x.id_site === op.id_site);
                console.log(`  ${site.id_site_detentora}: operadora "${op.operadora}" → "${nova}"${repetido ? ' (já existe: o repetido sai)' : ''}`);
                if (!aplicar) continue;
                if (repetido) await prisma.siteOperadora.delete({ where: { id: op.id } });
                else await prisma.siteOperadora.update({ where: { id: op.id }, data: { operadora: nova } });
            }
        }
        console.log(`  ${sitesMudam} detentora(s) de site mudam`);

        if (semSharing.size) console.log(`\n⚠ Sharing sem cadastro de cliente (ficou como está): ${[...semSharing].join(', ')}`);
        if (semOperadora.size) console.log(`⚠ Operadora sem cadastro de cliente (ficou como está): ${[...semOperadora].join(', ')}`);
    }
    console.log(aplicar ? '\nAplicado.' : '\nNada gravado. Rode com --aplicar para corrigir.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
