/**
 * Cadastro único de sites (03/10/2026): liga cada atividade antiga ao site
 * da detentora + ID que ela já tinha gravado, criando o site quando não existe
 * e acrescentando nele o ID da operadora. Idempotente — pode rodar de novo.
 *
 * Faça backup de prisma/dev.db antes. Com o backend no ar:
 *
 *   npx tsx src/backend/scripts/migrar-cadastro-sites.ts
 */
import './_sessao-teste';

const API = process.env.API_URL || 'http://localhost:3001/api';

async function main() {
    const r = await fetch(`${API}/sites/vincular-atividades`, { method: 'POST' });
    const corpo: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status} ${corpo.error || ''}`);
    console.log(`Atividades sem site: ${corpo.atividades}`);
    console.log(`Vinculadas: ${corpo.vinculadas} · sites criados: ${corpo.sitesCriados}`);
    if (corpo.semId.length) console.log(`Sem detentora/ID (ficaram de fora): ${corpo.semId.join(', ')}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
