/**
 * Adiantamento de projeto e prestação de contas com destino por site (12/10/2026):
 *
 *   A) adiantamento pedido no projeto -> na prestação, cada gasto vai para uma
 *      atividade do projeto;
 *   B) adiantamento pedido numa atividade do projeto -> pode ir para ela e para
 *      as outras do mesmo projeto;
 *   - nunca para fora do projeto; sem destino, recusado quando há mais de um;
 *   - atividade sem projeto: destino único, preenchido sozinho;
 *   - depósitos de projetos diferentes não entram na mesma prestação;
 *   - o gasto vira custo da atividade de destino; o projeto mostra o que falta.
 *
 * Cria os próprios registros e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-adiantamento-projeto.ts
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
const post = (c: string, b: unknown) => json(c, { method: 'POST', headers: cab, body: JSON.stringify(b) });
const put = (c: string, b: unknown) => json(c, { method: 'PUT', headers: cab, body: JSON.stringify(b) });

async function main() {
    const atividades: { id: string; site: string }[] = [];
    const reembolsos: string[] = [];
    const prestacoes: string[] = [];
    let projetoId = '', funcionarioId = '';
    try {
        const tenant = await prisma.tenant.findFirst();
        funcionarioId = (await prisma.funcionario.create({ data: { tenant_id: tenant!.id, nome: `Técnico SST ${SUFIXO}`, pix_tipo: 'CPF', pix_chave: '000.000.000-00', forma_pagamento: 'PIX', observacoes: TESTE } })).id;
        const novaAtividade = async (n: number) => {
            const site = `TSA${n}${SUFIXO}`;
            const at = await post('/atividades', {
                titulo: `Vistoria energia ${n} ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO',
                sharing: 'HIGHLINE', id_site_sharing: site, operadora: 'OI', id_site_operadora: `${site}O`,
                estado: 'PA', municipio: 'Belém', tipo_obra: 'BTS', descricao: TESTE });
            if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
            atividades.push({ id: at.corpo.id, site: at.corpo.site_id });
            return at.corpo;
        };
        const adiantamento = async (dono: Record<string, string>, valor: number) => {
            const r = await post('/reembolsos', { ...dono, natureza: 'ADIANTAMENTO', valor_adiantado: valor, funcionario_id: funcionarioId, motivo: TESTE });
            if (!r.ok) throw new Error(`adiantamento: ${r.corpo.error}`);
            reembolsos.push(r.corpo.id);
            // Depósito pago (o fluxo de aprovação/pagamento tem teste próprio).
            const pg = await prisma.reembolsoPagamento.findFirst({ where: { reembolso_id: r.corpo.id } });
            await prisma.reembolsoPagamento.update({ where: { id: pg!.id }, data: { status: 'PAGO', data_pagamento: new Date() } });
            return { reembolso: r.corpo, pagamentoId: pg!.id };
        };
        const novaPrestacao = async (pagamento_ids: string[]) => {
            const r = await post('/prestacoes-contas', { pagamento_ids });
            if (r.ok) prestacoes.push(r.corpo.id);
            return r;
        };

        const a1 = await novaAtividade(1), a2 = await novaAtividade(2), a3 = await novaAtividade(3), fora = await novaAtividade(4);
        const proj = await post('/acionamentos', { titulo: `Vistorias energia Oi ${SUFIXO}`, descricao_bruta: TESTE });
        projetoId = proj.corpo.id;
        await put(`/acionamentos/${projetoId}/atividades`, { atividade_ids: [a1.id, a2.id, a3.id] });

        console.log('\n── A) Adiantamento do projeto');
        const { reembolso: rA, pagamentoId: pgA } = await adiantamento({ acionamento_id: projetoId }, 3000);
        conferir('adiantamento nasce no projeto', rA.acionamento_id === projetoId && !rA.atividade_id);
        const lista = await json(`/reembolsos?acionamento_id=${projetoId}`);
        conferir('listado nos pagamentos do projeto', lista.corpo.some((r: any) => r.id === rA.id));
        const pA = await novaPrestacao([pgA]);
        conferir('prestação oferece os 3 sites do projeto como destino', pA.ok && pA.corpo.atividades_destino?.length === 3, JSON.stringify(pA.corpo.atividades_destino || pA.corpo));
        const semDestino = await put(`/prestacoes-contas/${pA.corpo.id}`, { despesas: [{ descricao: 'Vistoria', valor: 500, categoria: 'VISTORIA' }] });
        conferir('gasto sem site é recusado quando há vários', semDestino.status === 400 && /destino/.test(semDestino.corpo.error), JSON.stringify(semDestino.corpo));
        const foraDoProjeto = await put(`/prestacoes-contas/${pA.corpo.id}`, { despesas: [{ descricao: 'Vistoria', valor: 500, categoria: 'VISTORIA', atividade_id: fora.id }] });
        conferir('gasto para atividade fora do projeto é recusado', foraDoProjeto.status === 400 && /fora do projeto/.test(foraDoProjeto.corpo.error), JSON.stringify(foraDoProjeto.corpo));
        const ok = await put(`/prestacoes-contas/${pA.corpo.id}`, { despesas: [
            { descricao: 'Vistoria site 1', valor: 1200, categoria: 'VISTORIA', atividade_id: a1.id },
            { descricao: 'Combustível site 2', valor: 350.5, categoria: 'COMBUSTIVEL', atividade_id: a2.id },
            { descricao: 'Vistoria site 2', valor: 900, categoria: 'VISTORIA', atividade_id: a2.id },
        ] });
        conferir('gastos distribuídos entre os sites', ok.ok && ok.corpo.despesas.length === 3 && ok.corpo.valor_despesas === 2450.5, JSON.stringify(ok.corpo.error || ok.corpo.valor_despesas));
        conferir('tipo de gasto Vistoria e Combustível gravados', ok.corpo.despesas?.map((d: any) => d.categoria).join(',') === 'VISTORIA,COMBUSTIVEL,VISTORIA');
        const fin2 = await json(`/contratacoes/financeiro/${a2.id}`);
        conferir('custo do site 2 recebe 1.250,50 do adiantamento', fin2.corpo.custo_adiantamentos === 1250.5 && fin2.corpo.custo_pago >= 1250.5, JSON.stringify(fin2.corpo));
        const projFin = await json(`/acionamentos/${projetoId}/financeiro`);
        conferir('projeto: adiantado 3.000, distribuído 2.450,50, falta 549,50', projFin.corpo.resumo?.adiantado === 3000 && projFin.corpo.resumo?.rateado === 2450.5 && projFin.corpo.resumo?.a_ratear === 549.5, JSON.stringify(projFin.corpo.resumo));
        const site1 = projFin.corpo.atividades?.find((a: any) => a.id === a1.id);
        conferir('projeto mostra o custo distribuído por site', site1?.custo_rateado === 1200, JSON.stringify(site1));
        const doSite = await json(`/prestacoes-contas?atividade_id=${a1.id}`);
        conferir('a prestação aparece na atividade que recebeu gasto', doSite.corpo.some((p: any) => p.id === pA.corpo.id));

        console.log('\n── B) Adiantamento de uma atividade do projeto');
        const { pagamentoId: pgB } = await adiantamento({ atividade_id: a3.id }, 800);
        const pB = await novaPrestacao([pgB]);
        conferir('adiantamento da atividade pode ir para as outras do projeto', pB.ok && pB.corpo.atividades_destino?.length === 3, JSON.stringify(pB.corpo.atividades_destino || pB.corpo));
        const okB = await put(`/prestacoes-contas/${pB.corpo.id}`, { despesas: [
            { descricao: 'Vistoria site 3', valor: 500, categoria: 'VISTORIA', atividade_id: a3.id },
            { descricao: 'Combustível site 1', valor: 300, categoria: 'COMBUSTIVEL', atividade_id: a1.id },
        ] });
        conferir('distribuído para o próprio site e para outro do projeto', okB.ok, okB.corpo.error);

        console.log('\n── Gestão do projeto');
        const curto = await put(`/acionamentos/${projetoId}`, { titulo: 'ab' });
        conferir('nome curto demais é recusado', curto.status === 400, `HTTP ${curto.status}`);
        const renomeado = await put(`/acionamentos/${projetoId}`, { titulo: `  Vistorias Oi renomeado ${SUFIXO}  ` });
        conferir('projeto renomeado (sem espaços nas pontas)', renomeado.ok && renomeado.corpo.titulo === `Vistorias Oi renomeado ${SUFIXO}`, JSON.stringify(renomeado.corpo.titulo || renomeado.corpo));
        const tirarComGasto = await put(`/acionamentos/${projetoId}/atividades`, { atividade_ids: [a2.id, a3.id] });
        conferir('atividade com gasto do adiantamento do projeto não sai do projeto', tirarComGasto.status === 400 && /recebeu gasto/.test(tirarComGasto.corpo.error), JSON.stringify(tirarComGasto.corpo));
        const comAtividades = await json(`/acionamentos/${projetoId}`, { method: 'DELETE' });
        conferir('projeto com atividades não é excluído', comAtividades.status === 400);
        const vazio = await post('/acionamentos', { titulo: `Projeto vazio ${SUFIXO}`, descricao_bruta: TESTE });
        const { reembolso: rVazio } = await adiantamento({ acionamento_id: vazio.corpo.id }, 50);
        const comDinheiro = await json(`/acionamentos/${vazio.corpo.id}`, { method: 'DELETE' });
        conferir('projeto com adiantamento não é excluído (mensagem clara)', comDinheiro.status === 400 && /adiantamento/.test(comDinheiro.corpo.error), JSON.stringify(comDinheiro.corpo));
        await prisma.reembolso.delete({ where: { id: rVazio.id } });
        reembolsos.splice(reembolsos.indexOf(rVazio.id), 1);
        const excluido = await json(`/acionamentos/${vazio.corpo.id}`, { method: 'DELETE' });
        conferir('projeto vazio é excluído', excluido.ok, JSON.stringify(excluido.corpo));

        console.log('\n── Fora de projeto e mistura');
        const { pagamentoId: pgFora } = await adiantamento({ atividade_id: fora.id }, 200);
        const { pagamentoId: pgA2 } = await adiantamento({ acionamento_id: projetoId }, 100);
        const mistura = await novaPrestacao([pgFora, pgA2]);
        conferir('depósitos de projetos diferentes não se misturam', mistura.status === 400 && /projetos diferentes/.test(mistura.corpo.error), JSON.stringify(mistura.corpo));
        const pFora = await novaPrestacao([pgFora]);
        conferir('atividade sem projeto: um destino só', pFora.ok && pFora.corpo.atividades_destino?.length === 1);
        const okFora = await put(`/prestacoes-contas/${pFora.corpo.id}`, { despesas: [{ descricao: 'Outros', valor: 150, categoria: 'OUTROS' }] });
        conferir('destino único preenchido sozinho', okFora.ok && okFora.corpo.despesas?.[0]?.atividade_id === fora.id, JSON.stringify(okFora.corpo.error || okFora.corpo.despesas));
        conferir('saldo vira acerto (adiantado 200, gasto 150)', okFora.corpo.valor_adiantado - okFora.corpo.valor_despesas === 50);
    } finally {
        for (const id of prestacoes) await prisma.prestacaoContasConsolidada.delete({ where: { id } }).catch(() => undefined);
        for (const id of reembolsos) await prisma.reembolso.delete({ where: { id } }).catch(e => console.log('   (limpeza) reembolso:', e.message));
        for (const a of atividades) {
            await prisma.atividade.update({ where: { id: a.id }, data: { acionamento_id: null } }).catch(() => undefined);
            const r = await json(`/atividades/${a.id}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
            if (!r.ok) console.log('   (limpeza) atividade:', r.corpo.error);
            if (a.site) await json(`/sites/${a.site}`, { method: 'DELETE' });
        }
        if (projetoId) await json(`/acionamentos/${projetoId}`, { method: 'DELETE' });
        if (funcionarioId) await prisma.funcionario.delete({ where: { id: funcionarioId } }).catch(e => console.log('   (limpeza) funcionário:', e.message));
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
