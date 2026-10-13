/**
 * Relatório de fiscalização na documentação da atividade (13/10/2026):
 *
 *   - toda implantação recebe o requisito, de qualquer detentora e tipo de site;
 *   - matriz que já existia ganha o requisito ao abrir a aba Documentação;
 *   - é obrigatório e com assinatura;
 *   - atividade de operação não recebe matriz de obra.
 *
 * Cria as próprias atividades e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-relatorio-fiscalizacao.ts
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
const fiscalizacao = (docs: any[]) => (Array.isArray(docs) ? docs : []).find(d => d.requisito?.codigo === 'LS-FISCALIZACAO');

async function main() {
    const criadas: { id: string; site: string }[] = [];
    try {
        const nova = async (n: number, extra: Record<string, unknown>) => {
            const site = `TSF${n}${SUFIXO}`;
            const r = await json('/atividades', { method: 'POST', headers: cab, body: JSON.stringify({
                titulo: `Teste fiscalização ${n} ${SUFIXO}`, sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'TIM',
                id_site_operadora: `${site}T`, estado: 'PA', municipio: 'Belém', descricao: TESTE, ...extra }) });
            if (!r.ok) throw new Error(`atividade: ${r.corpo.error}`);
            criadas.push({ id: r.corpo.id, site: r.corpo.site_id });
            return r.corpo;
        };

        console.log('\n── Implantação nova');
        const bts = await nova(1, { tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO', tipo_obra: 'BTS' });
        const docsBts = (await json(`/documentacao/atividades/${bts.id}`)).corpo;
        const f = fiscalizacao(docsBts);
        conferir('BTS Highline tem o relatório de fiscalização', !!f, `${docsBts.length} documentos`);
        conferir('obrigatório e com assinatura', f?.requisito?.obrigatorio === true && f?.requisito?.exige_assinatura === true);
        conferir('aparece por último na lista (fecha a obra)', docsBts[docsBts.length - 1]?.requisito?.codigo === 'LS-FISCALIZACAO');
        const roof = await nova(2, { tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO', tipo_obra: 'ROOF_TOP' });
        const docsRoof = (await json(`/documentacao/atividades/${roof.id}`)).corpo;
        conferir('Roof Top (sem checklist da Highline) também tem', !!fiscalizacao(docsRoof), JSON.stringify(docsRoof).slice(0, 120));

        console.log('\n── Matriz que já existia');
        const req = await prisma.requisitoDocumental.findFirst({ where: { codigo: 'LS-FISCALIZACAO' } });
        await prisma.documentoAtividade.deleteMany({ where: { atividade_id: bts.id, requisito_id: req!.id } });
        const antes = await prisma.documentoAtividade.count({ where: { atividade_id: bts.id, requisito_id: req!.id } });
        const depois = (await json(`/documentacao/atividades/${bts.id}`)).corpo;
        conferir('ao abrir a aba, o requisito entra na matriz antiga', antes === 0 && !!fiscalizacao(depois));

        console.log('\n── Operação');
        const vist = await nova(3, { tipo_demanda: 'OPERACAO', subtipo_demanda: 'VISTORIA', modelo_operacao: 'EXECUCAO_DIRETA', tipo_obra: 'BTS' });
        const docsVist = await prisma.documentoAtividade.count({ where: { atividade_id: vist.id, aplicavel: true } });
        conferir('vistoria não recebe matriz de obra', docsVist === 0, `${docsVist} documentos`);
    } finally {
        for (const a of criadas) {
            await prisma.documentoAtividade.deleteMany({ where: { atividade_id: a.id } });
            const r = await json(`/atividades/${a.id}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
            if (!r.ok) console.log('   (limpeza) atividade:', r.corpo.error);
            if (a.site) await json(`/sites/${a.site}`, { method: 'DELETE' });
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
