// Corrige a detentora gravada como "HIGHLINE DO BRASIL" (ou outra variação) nas
// atividades e nos sites: vira HIGHLINE, que é o que as regras da Highline
// reconhecem (PV Highline, PV O&M, documentação). 23/10/2026.
//
// Sem --aplicar só mostra o que mudaria.
//
//   npx tsx src/backend/scripts/normalizar-sharing-highline.ts [--aplicar]

import { PrismaClient } from '@prisma/client';
import { normalizarSharing } from '../utils/sharing';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

async function main() {
    const atividades = (await prisma.atividade.findMany({ select: { id: true, codigo: true, sharing: true } }))
        .filter(a => a.sharing !== normalizarSharing(a.sharing) && normalizarSharing(a.sharing) === 'HIGHLINE');
    const sites = (await prisma.site.findMany({ select: { id: true, id_site_detentora: true, detentora: true } }))
        .filter(s => s.detentora && s.detentora !== normalizarSharing(s.detentora) && normalizarSharing(s.detentora) === 'HIGHLINE');

    console.log(`Atividades a corrigir: ${atividades.length}`);
    atividades.forEach(a => console.log(`  ${a.codigo}: "${a.sharing}" → HIGHLINE`));
    console.log(`Sites a corrigir: ${sites.length}`);
    sites.forEach(s => console.log(`  ${s.id_site_detentora}: "${s.detentora}" → HIGHLINE`));

    if (!aplicar) { console.log('\nNada gravado. Rode com --aplicar para corrigir.'); return; }
    for (const a of atividades) await prisma.atividade.update({ where: { id: a.id }, data: { sharing: 'HIGHLINE' } });
    for (const s of sites) await prisma.site.update({ where: { id: s.id }, data: { detentora: 'HIGHLINE' } });
    console.log(`\nCorrigidos: ${atividades.length} atividade(s) e ${sites.length} site(s).`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
