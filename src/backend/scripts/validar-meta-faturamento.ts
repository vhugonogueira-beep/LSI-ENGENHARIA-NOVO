/**
 * Meta de faturamento da atividade (18/10/2026).
 *
 *   1. definir a meta (mês + valor); valor obrigatório; mês inválido recusado;
 *   2. mudar o mês: usuário comum não pode; gestor/admin pode, só com motivo;
 *   3. situação: no prazo, vence este mês, vencida, cumprida;
 *   4. dois adiamentos = reincidente; histórico guarda de → para e motivo;
 *   5. a carteira traz a situação da meta.
 *
 *   npx tsx src/backend/scripts/validar-meta-faturamento.ts
 */
import './_sessao-teste';
import { prisma } from '../server';
import { definirMeta, mesDe } from '../services/meta-faturamento.service';

const API = process.env.API_URL || 'http://localhost:3001/api';
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
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
}
const put = (c: string, b: unknown) => json(c, { method: 'PUT', headers: cab, body: JSON.stringify(b) });
const mesMais = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return mesDe(d); };
const usuarioComum = { email: 'comum@lsoffice.invalid', role: 'USUARIO', permissoes: ['atividades.gerenciar'] };
const gestor = { email: 'gestor@lsoffice.invalid', role: 'USUARIO', permissoes: ['atividades.gerenciar', 'metas.alterar'] };

async function main() {
    let atividadeId = '', siteId = '';
    try {
        const site = `TMF${SUFIXO}`;
        const at = await json('/atividades', { method: 'POST', headers: cab, body: JSON.stringify({
            titulo: `Teste meta ${SUFIXO}`, tipo_demanda: 'OPERACAO', subtipo_demanda: 'MANUTENCAO', modelo_operacao: 'EXECUCAO_DIRETA',
            sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'TIM', id_site_operadora: `${site}T`, estado: 'PA', municipio: 'Marabá', descricao: TESTE }) });
        if (at.status >= 300) throw new Error(`atividade: ${at.corpo.error}`);
        atividadeId = at.corpo.id; siteId = at.corpo.site_id;

        console.log('\n── 1. Definir');
        const semValor = await put(`/atividades/${atividadeId}/meta`, { mes: mesMais(2) });
        conferir('valor obrigatório', semValor.status === 400 && /valor/.test(semValor.corpo.error), JSON.stringify(semValor.corpo));
        const invalido = await put(`/atividades/${atividadeId}/meta`, { mes: '2026-13', valor: 100 });
        conferir('mês inválido recusado', invalido.status === 400);
        await definirMeta(atividadeId, { mes: mesMais(2), valor: 1000 }, usuarioComum);
        const m1 = (await json(`/atividades/${atividadeId}/meta`)).corpo;
        conferir('definida por quem edita a atividade; no prazo', m1.mes === mesMais(2) && m1.valor === 1000 && m1.situacao === 'NO_PRAZO', JSON.stringify(m1));

        console.log('\n── 2. Mudar o mês');
        const erroComum = await definirMeta(atividadeId, { mes: mesMais(3), valor: 1000, motivo: 'cliente pediu' }, usuarioComum).then(() => '', e => e.message);
        conferir('usuário comum não muda o mês', /gestor ou administrador/.test(erroComum), erroComum);
        const erroMotivo = await definirMeta(atividadeId, { mes: mesMais(3), valor: 1000 }, gestor).then(() => '', e => e.message);
        conferir('gestor precisa de motivo', /motivo/.test(erroMotivo), erroMotivo);
        await definirMeta(atividadeId, { mes: mesMais(3), valor: 1000, motivo: 'PO atrasou no cliente' }, gestor);
        await definirMeta(atividadeId, { mes: mesMais(4), valor: 1200, motivo: 'Obra remarcada' }, gestor);
        const m2 = (await json(`/atividades/${atividadeId}/meta`)).corpo;
        conferir('dois adiamentos = reincidente', m2.adiamentos === 2 && m2.reincidente === true, JSON.stringify({ a: m2.adiamentos, r: m2.reincidente }));
        conferir('histórico com de → para e motivo', m2.historico[0]?.mes_anterior === mesMais(3) && m2.historico[0]?.mes_novo === mesMais(4) && m2.historico[0]?.motivo === 'Obra remarcada', JSON.stringify(m2.historico[0]));

        console.log('\n── 3. Situação');
        await prisma.atividade.update({ where: { id: atividadeId }, data: { meta_faturamento_mes: mesMais(0) } });
        conferir('vence este mês', (await json(`/atividades/${atividadeId}/meta`)).corpo.situacao === 'VENCE_ESTE_MES');
        await prisma.atividade.update({ where: { id: atividadeId }, data: { meta_faturamento_mes: mesMais(-1) } });
        conferir('vencida', (await json(`/atividades/${atividadeId}/meta`)).corpo.situacao === 'VENCIDA');
        await prisma.atividade.update({ where: { id: atividadeId }, data: { status_faturamento: 'FATURADO' } });
        const m3 = (await json(`/atividades/${atividadeId}/meta`)).corpo;
        conferir('faturada = cumprida', ['CUMPRIDA', 'CUMPRIDA_ATRASO'].includes(m3.situacao), m3.situacao);

        console.log('\n── 4. Carteira');
        const carteira = (await json('/atividades/carteira')).corpo as any[];
        const linha = carteira.find(x => x.id === atividadeId);
        conferir('carteira traz meta e situação', linha?.meta_faturamento_mes === mesMais(-1) && !!linha?.meta_situacao && linha?.meta_adiamentos === 2, JSON.stringify({ m: linha?.meta_faturamento_mes, s: linha?.meta_situacao, a: linha?.meta_adiamentos }));
    } finally {
        if (atividadeId) {
            await prisma.metaFaturamentoHistorico.deleteMany({ where: { atividade_id: atividadeId } });
            await prisma.atividade.update({ where: { id: atividadeId }, data: { status_faturamento: 'NAO_INICIADO' } }).catch(() => undefined);
            await json(`/atividades/${atividadeId}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
        }
        if (siteId) await json(`/sites/${siteId}`, { method: 'DELETE' });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
