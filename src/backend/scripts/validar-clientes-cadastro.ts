/**
 * Sharing e operadora pelo cadastro de Clientes (23/10/2026).
 *
 *   1. atividade criada com o nome antigo ("HIGHLINE", "VIVO") grava o nome do
 *      cadastro e fica ligada ao cadastro do sharing;
 *   2. escolhido o cadastro (contratante_id), o sharing sai dele; cadastro
 *      inativo é recusado;
 *   3. a LPU da atividade sai do cadastro ligado (Highline → PV Padrão Highline);
 *   4. cliente repetido é recusado (mesmo nome, ou uma segunda Highline).
 *
 *   npx tsx src/backend/scripts/validar-clientes-cadastro.ts
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
const json = async (c: string, metodo = 'GET', corpo?: unknown) => {
    const r = await fetch(`${API}${c}`, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
};

async function main() {
    const highline = await prisma.contratante.findFirst({ where: { ativo: true, OR: [{ nome: { startsWith: 'Highline' } }, { nome: { startsWith: 'HIGHLINE' } }] } });
    const vivo = await prisma.contratante.findFirst({ where: { ativo: true, tipo: { in: ['OPERADORA', 'SHARING_OPERADORA'] }, nome: { startsWith: 'Vivo' } } });
    if (!highline) { console.log('   (sem cadastro ativo da Highline — roteiro pulado)\n\nTudo certo.'); return; }
    const atividades: { id: string; site: string | null }[] = [];
    const clientes: string[] = [];
    const base = { tipo_demanda: 'IMPLANTACAO', tipo_obra: 'BTS', estado: 'PA', municipio: 'Marabá', descricao: TESTE };
    try {
        console.log('\n── 1. Nome antigo vira o nome do cadastro');
        const a1 = await json('/atividades', 'POST', { ...base, titulo: `Cliente ${SUFIXO} 1`, sharing: 'HIGHLINE', operadora: vivo ? 'VIVO' : undefined, id_site_sharing: `ZC1${SUFIXO}`, id_site_operadora: `ZC1${SUFIXO}V` });
        if (a1.corpo.id) atividades.push({ id: a1.corpo.id, site: a1.corpo.site_id });
        conferir('sharing gravado como no cadastro', a1.corpo.sharing === highline.nome, `${a1.status} ${a1.corpo.sharing || a1.corpo.error}`);
        conferir('ligada ao cadastro do sharing', a1.corpo.contratante_id === highline.id, a1.corpo.contratante_id);
        if (vivo) conferir('operadora gravada como no cadastro', a1.corpo.operadora === vivo.nome, a1.corpo.operadora);

        console.log('\n── 2. Escolha pelo cadastro');
        const a2 = await json('/atividades', 'POST', { ...base, titulo: `Cliente ${SUFIXO} 2`, contratante_id: highline.id, sharing: '', id_site_sharing: `ZC2${SUFIXO}`, id_site_operadora: `ZC2${SUFIXO}O` });
        if (a2.corpo.id) atividades.push({ id: a2.corpo.id, site: a2.corpo.site_id });
        conferir('sharing sai do cadastro escolhido', a2.corpo.sharing === highline.nome && a2.corpo.contratante_id === highline.id, `${a2.status} ${a2.corpo.sharing || a2.corpo.error}`);
        const inativo = await prisma.contratante.create({ data: { tenant_id: highline.tenant_id, nome: `Inativo ${SUFIXO}`, tipo: 'SHARING', ativo: false } });
        clientes.push(inativo.id);
        const a3 = await json('/atividades', 'POST', { ...base, titulo: `Cliente ${SUFIXO} 3`, contratante_id: inativo.id, id_site_sharing: `ZC3${SUFIXO}`, id_site_operadora: `ZC3${SUFIXO}O` });
        if (a3.corpo.id) atividades.push({ id: a3.corpo.id, site: a3.corpo.site_id });
        conferir('cadastro inativo é recusado', a3.status === 400 && /inativo/.test(a3.corpo.error), `${a3.status} ${a3.corpo.error}`);

        console.log('\n── 3. LPU pelo cadastro ligado');
        if (a1.corpo.id) {
            const l = await json(`/atividades/${a1.corpo.id}/lpus`);
            conferir('Highline + Implantação → base da Highline', l.corpo.precoCliente?.cliente === highline.nome, JSON.stringify(l.corpo.precoCliente));
        }

        console.log('\n── 4. Cliente repetido');
        const d1 = await json('/clientes', 'POST', { nome: highline.nome.toUpperCase(), tipo: 'SHARING' });
        if (d1.corpo.id) clientes.push(d1.corpo.id);
        conferir('mesmo nome recusado', d1.status === 409, `${d1.status} ${d1.corpo.error}`);
        const d2 = await json('/clientes', 'POST', { nome: 'HIGHLINE', tipo: 'SHARING' });
        if (d2.corpo.id) clientes.push(d2.corpo.id);
        conferir('segunda Highline recusada', d2.status === 409, `${d2.status} ${d2.corpo.error}`);
        const d3 = await json(`/clientes/${inativo.id}`, 'PUT', { nome: highline.nome, ativo: true });
        conferir('reativar com nome repetido recusado', d3.status === 409, `${d3.status} ${d3.corpo.error}`);
    } finally {
        for (const a of atividades) {
            await json(`/atividades/${a.id}`, 'DELETE', { motivo: TESTE });
            if (a.site) await json(`/sites/${a.site}`, 'DELETE');
        }
        for (const id of clientes) await prisma.contratante.delete({ where: { id } }).catch(() => undefined);
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
