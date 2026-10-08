/**
 * Tipo de site unificado (08/10/2026): um campo só (Atividade.tipo_obra) do
 * qual saem o tipo da PV Highline, os documentos e a estrutura do site.
 *
 *   npx tsx src/backend/scripts/validar-tipo-site.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cabecalho = { 'Content-Type': 'application/json' };
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
const implantacaoHighline = (id: string, tipo_obra: string) => json('/atividades', {
    method: 'POST', headers: cabecalho, body: JSON.stringify({
        titulo: `Teste tipo de site ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO',
        sharing: 'HIGHLINE', id_site_sharing: id, operadora: 'TIM', id_site_operadora: `${id}T`,
        estado: 'PA', municipio: 'Marabá', tipo_obra, descricao: TESTE,
    }),
});

async function main() {
    const atividades: string[] = [];
    const sites = new Set<string>();
    try {
        console.log('\n── Tipo da PV Highline sai do tipo de site');
        const rt = await implantacaoHighline(`TSTR${SUFIXO}`, 'COLLO_RT');
        conferir('Collo RT criada sem escolher o tipo Highline à parte', rt.status === 201, `HTTP ${rt.status} ${rt.corpo.error || ''}`);
        if (rt.ok) { atividades.push(rt.corpo.id); sites.add(rt.corpo.site_id); }
        conferir('tipo da PV = "Collo RT"', rt.corpo.tipo_site_highline === 'Collo RT', rt.corpo.tipo_site_highline);
        const site = rt.ok ? await prisma.site.findUnique({ where: { id: rt.corpo.site_id } }) : null;
        conferir('site novo recebe a estrutura "Roof Top"', site?.tipo_site === 'Roof Top', site?.tipo_site || '');

        console.log('\n── Documentos');
        const docs = rt.ok ? await prisma.documentoAtividade.findMany({ where: { atividade_id: rt.corpo.id }, include: { requisito: true } }) : [];
        const colloDocs = await prisma.requisitoDocumental.count({ where: { tipo_obra: 'COLLO', ativo: true } });
        conferir('Collo RT recebe os documentos de Collo', docs.some(d => d.requisito?.tipo_obra === 'COLLO') && docs.filter(d => d.requisito?.tipo_obra === 'COLLO').length === colloDocs, `${docs.length} docs, ${colloDocs} de Collo`);
        conferir('e nenhum documento de BTS', !docs.some(d => d.requisito?.tipo_obra === 'BTS'));

        console.log('\n── Tipo sem PV numa implantação Highline');
        const ret = await implantacaoHighline(`TSTX${SUFIXO}`, 'RETROFIT');
        conferir('Retrofit em implantação Highline é recusado, com explicação', ret.status === 400 && /aceito pela PV/.test(ret.corpo.error || ''), `HTTP ${ret.status} ${ret.corpo.error || ''}`);
        if (ret.ok) { atividades.push(ret.corpo.id); sites.add(ret.corpo.site_id); }
        const orfao = await prisma.site.findFirst({ where: { id_site_detentora: `TSTX${SUFIXO}` } });
        conferir('atividade recusada não deixa site cadastrado', !orfao, orfao?.id || '');
        if (orfao) sites.add(orfao.id);

        console.log('\n── Edição');
        if (rt.ok) {
            const ed = await json(`/atividades/${rt.corpo.id}`, { method: 'PUT', headers: cabecalho, body: JSON.stringify({ tipo_obra: 'BTS' }) });
            conferir('trocar para BTS troca o tipo da PV', ed.ok && ed.corpo.tipo_site_highline === 'BTS', `HTTP ${ed.status} ${ed.corpo.tipo_site_highline || ed.corpo.error || ''}`);
            const ruim = await json(`/atividades/${rt.corpo.id}`, { method: 'PUT', headers: cabecalho, body: JSON.stringify({ tipo_obra: 'INDOOR' }) });
            conferir('trocar para Indoor (sem PV) é recusado', ruim.status === 400, `HTTP ${ruim.status}`);
        }

        console.log('\n── Operação aceita qualquer tipo, inclusive digitado');
        const op = await json('/atividades', {
            method: 'POST', headers: cabecalho, body: JSON.stringify({
                titulo: `Teste tipo livre ${SUFIXO}`, tipo_demanda: 'OPERACAO', subtipo_demanda: 'VISTORIA', modelo_operacao: 'EXECUCAO_DIRETA',
                sharing: 'HIGHLINE', id_site_sharing: `TSTR${SUFIXO}`, operadora: 'TIM', id_site_operadora: `TSTR${SUFIXO}T`,
                tipo_obra: 'Torre autoportante', descricao: TESTE,
            }),
        });
        conferir('tipo digitado gravado', op.ok && op.corpo.tipo_obra === 'Torre autoportante', `HTTP ${op.status} ${op.corpo.error || ''}`);
        if (op.ok) atividades.push(op.corpo.id);
    } finally {
        for (const id of atividades) {
            await json(`/atividades/${id}`, { method: 'DELETE', headers: cabecalho, body: JSON.stringify({ motivo: TESTE }) });
        }
        for (const id of sites) if (id) await json(`/sites/${id}`, { method: 'DELETE' });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
