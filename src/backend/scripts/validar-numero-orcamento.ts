/**
 * Número do orçamento gerado pelo sistema (12/10/2026):
 *
 *   - formato ORC-<ano>-<seq>-<site>, sequencial único no ano para todos os sites;
 *   - nasce no primeiro pedido (PDF) ou ao abrir a negociação; depois devolve o mesmo;
 *   - não é aceito vindo da tela (criar/editar cabeçalho);
 *   - nunca repete: nem com exclusão, nem com duas gerações ao mesmo tempo;
 *   - orçamento só nasce dentro de atividade, e o número exige Site ID.
 *
 * Cria as próprias atividades/orçamentos e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-numero-orcamento.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();
const TESTE = 'Teste automatizado — pode apagar';
const ANO = new Date().getFullYear();

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const post = (c: string, corpo: unknown) => json(c, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });
const seq = (numero: string) => Number(numero.split('-')[2]);

async function main() {
    const atividades: { id: string; site: string }[] = [];
    const budgets: string[] = [];
    try {
        const novaAtividade = async (n: number) => {
            const site = `TSN${n}${SUFIXO}`;
            const at = await post('/atividades', {
                titulo: `Teste número ${n} ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO',
                sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'TIM', id_site_operadora: `${site}T`,
                estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE });
            if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
            atividades.push({ id: at.corpo.id, site: at.corpo.site_id });
            return at.corpo;
        };
        const novoOrcamento = async (at: any, extra: any = {}) => {
            const b = await post('/budgets', { tenant_id: at.tenant_id, contratante_id: at.contratante_id, atividade_id: at.id, assunto: TESTE, tipo_orcamento: 'ORCAMENTO_LS', ...extra });
            if (b.ok) budgets.push(b.corpo.id);
            return b;
        };

        console.log('\n── Criação');
        const a1 = await novaAtividade(1);
        const semAtividade = await post('/budgets', { tenant_id: a1.tenant_id, contratante_id: a1.contratante_id, assunto: TESTE });
        if (semAtividade.ok) budgets.push(semAtividade.corpo.id);
        conferir('orçamento fora de atividade é recusado', semAtividade.status === 400, `HTTP ${semAtividade.status}`);
        const b1 = await novoOrcamento(a1, { numero: 'ORC-1999-999-FALSO' });
        conferir('orçamento nasce sem número (o enviado pela tela é ignorado)', b1.ok && b1.corpo.numero == null, b1.corpo.numero);

        console.log('\n── Geração');
        const n1 = await post(`/budgets/${b1.corpo.id}/numero`, {});
        const esperado = new RegExp(`^ORC-${ANO}-\\d{3}-TSN1${SUFIXO}$`);
        conferir('formato ORC-ano-seq-site', n1.ok && esperado.test(n1.corpo.numero), JSON.stringify(n1.corpo));
        const n1b = await post(`/budgets/${b1.corpo.id}/numero`, {});
        conferir('pedir de novo devolve o mesmo número', n1b.corpo.numero === n1.corpo.numero, n1b.corpo.numero);
        await json(`/budgets/${b1.corpo.id}/header`, { method: 'PUT', headers: cab, body: JSON.stringify({ numero: 'ORC-1999-999-FALSO' }) });
        const depois = await prisma.budget.findUnique({ where: { id: b1.corpo.id } });
        conferir('número não muda pelo cabeçalho', depois?.numero === n1.corpo.numero, depois?.numero || '');
        const reg = await prisma.numeroOrcamentoEmitido.findFirst({ where: { budget_id: b1.corpo.id } });
        conferir('número registrado como emitido', reg?.numero === n1.corpo.numero);

        console.log('\n── Sequência única no ano, para todos os sites');
        const a2 = await novaAtividade(2);
        const b2 = await novoOrcamento(a2);
        const n2 = await post(`/budgets/${b2.corpo.id}/numero`, {});
        conferir('outro site recebe o próximo sequencial', seq(n2.corpo.numero) === seq(n1.corpo.numero) + 1 && n2.corpo.numero.endsWith(`TSN2${SUFIXO}`), `${n1.corpo.numero} → ${n2.corpo.numero}`);

        console.log('\n── Nunca reaproveita');
        await prisma.budget.delete({ where: { id: b2.corpo.id } });
        budgets.splice(budgets.indexOf(b2.corpo.id), 1);
        const b3 = await novoOrcamento(a2);
        const n3 = await post(`/budgets/${b3.corpo.id}/numero`, {});
        conferir('orçamento excluído não libera o número', seq(n3.corpo.numero) === seq(n2.corpo.numero) + 1, `${n2.corpo.numero} → ${n3.corpo.numero}`);

        console.log('\n── Ao mesmo tempo');
        const b4 = await novoOrcamento(a1), b5 = await novoOrcamento(a2), b6 = await novoOrcamento(a1);
        const juntos = await Promise.all([b4, b5, b6].map(b => post(`/budgets/${b.corpo.id}/numero`, {})));
        const seqs = juntos.map(r => seq(r.corpo.numero || 'x-x-0'));
        conferir('três gerações simultâneas, três números diferentes', juntos.every(r => r.ok) && new Set(seqs).size === 3, JSON.stringify(juntos.map(r => r.corpo)));

        console.log('\n── Negociação e Site ID');
        const b7 = await novoOrcamento(a1);
        const neg = await post('/negociacoes', { budget_id: b7.corpo.id, atividade_id: a1.id });
        const b7depois = await prisma.budget.findUnique({ where: { id: b7.corpo.id } });
        conferir('abrir a negociação gera o número', neg.ok && !!b7depois?.numero, `${neg.corpo.error || ''} ${b7depois?.numero}`);
        const a3 = await novaAtividade(3);
        const b8 = await novoOrcamento(a3);
        await prisma.atividade.update({ where: { id: a3.id }, data: { id_site_sharing: null, id_site_operadora: null } });
        const semSite = await post(`/budgets/${b8.corpo.id}/numero`, {});
        conferir('sem Site ID na atividade não gera número', semSite.status === 400 && /Site ID/.test(semSite.corpo.error), JSON.stringify(semSite.corpo));
    } finally {
        for (const id of budgets) {
            const negs = await prisma.negociacao.findMany({ where: { budget_id: id } });
            await prisma.contraproposta.deleteMany({ where: { negociacao_id: { in: negs.map(n => n.id) } } });
            await prisma.negociacao.deleteMany({ where: { budget_id: id } });
            await prisma.auditLog.deleteMany({ where: { entidade_id: id } });
            await prisma.budget.delete({ where: { id } }).catch(() => undefined);
        }
        // Números de teste nunca circularam: saem do registro para não deixar buraco na sequência real.
        await prisma.numeroOrcamentoEmitido.deleteMany({ where: { numero: { contains: SUFIXO } } });
        for (const a of atividades) {
            await prisma.atividade.update({ where: { id: a.id }, data: { status_comercial: 'NAO_INICIADO' } }).catch(() => undefined);
            await json(`/atividades/${a.id}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
            if (a.site) await json(`/sites/${a.site}`, { method: 'DELETE' });
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
