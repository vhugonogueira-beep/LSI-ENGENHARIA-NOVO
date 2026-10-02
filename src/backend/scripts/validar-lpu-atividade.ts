/**
 * Escolha automática da LPU da atividade por ÁREA + CLIENTE.
 *
 *   - Highline Implantação (PAMRB008) → PV Padrão Highline, achada pelo Sharing
 *     mesmo com o contratante "Highline do Brasil";
 *   - Highline Operação, sem base própria → genérica de Operação;
 *   - criada uma base de Operação da Highline, ela passa a valer;
 *   - duas bases no mesmo grupo: vence a padrão, e marcar uma desmarca a outra;
 *   - orçamento novo grava a base escolhida.
 *
 * Cria as próprias bases e o próprio orçamento e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-lpu-atividade.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cabecalho = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36);

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const lpus = (id: string) => json(`/atividades/${id}/lpus`);

async function main() {
    const bases: string[] = [];
    const orcamentos: string[] = [];
    try {
        const highline = await prisma.contratante.findFirst({ where: { nome: 'HIGHLINE' } });
        const implantacao = await prisma.atividade.findFirst({ where: { id_site_sharing: 'PAMRB008' } });
        const operacao = await prisma.atividade.findFirst({ where: { sharing: 'HIGHLINE', tipo_demanda: 'OPERACAO' } });
        if (!highline || !implantacao || !operacao) throw new Error('Dados de referência não encontrados (HIGHLINE / PAMRB008 / atividade de operação)');

        console.log('\n── Bases reais');
        const a = await lpus(implantacao.id);
        conferir('PAMRB008 (Highline Implantação) → PV Padrão Highline', a.corpo.precoCliente?.nome === 'PV Padrão Highline', JSON.stringify(a.corpo.precoCliente));
        conferir('achada pelo Sharing, já que o contratante é "Highline do Brasil"', /Sharing/.test(a.corpo.precoCliente?.motivo || ''), a.corpo.precoCliente?.motivo);
        conferir('custo → LPU LS Office Geral', a.corpo.custo?.nome === 'LPU LS Office Geral', JSON.stringify(a.corpo.custo));
        const o = await lpus(operacao.id);
        conferir('Highline Operação sem base própria → genérica de Operação', o.corpo.precoCliente?.nome === 'LPU Genérico — Manutenção', JSON.stringify(o.corpo.precoCliente));

        console.log('\n── Base própria do cliente');
        const nova = await json('/pricebooks', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ nome_lpu: `Teste Highline Operação ${SUFIXO}`, regiao: 'NACIONAL', origem: 'PV_CLIENTE', tipo: 'OPERACAO', contratante_id: highline.id }),
        });
        conferir('base de Operação da Highline criada', nova.ok, `HTTP ${nova.status} ${nova.corpo.error || ''}`);
        if (nova.ok) bases.push(nova.corpo.id);
        const o2 = await lpus(operacao.id);
        conferir('Highline Operação passa a usar a base própria', o2.corpo.precoCliente?.id === nova.corpo.id, JSON.stringify(o2.corpo.precoCliente));
        const a2 = await lpus(implantacao.id);
        conferir('Implantação não é afetada', a2.corpo.precoCliente?.nome === 'PV Padrão Highline');

        console.log('\n── Duas bases no mesmo grupo');
        const outra = await json('/pricebooks', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ nome_lpu: `Teste Highline Operação B ${SUFIXO}`, regiao: 'NACIONAL', origem: 'PV_CLIENTE', tipo: 'OPERACAO', contratante_id: highline.id }),
        });
        if (outra.ok) bases.push(outra.corpo.id);
        await json(`/pricebooks/${outra.corpo.id}`, { method: 'PUT', headers: cabecalho, body: JSON.stringify({ padrao: true }) });
        const o3 = await lpus(operacao.id);
        conferir('vence a marcada como padrão', o3.corpo.precoCliente?.id === outra.corpo.id, JSON.stringify(o3.corpo.precoCliente));
        await json(`/pricebooks/${nova.corpo.id}`, { method: 'PUT', headers: cabecalho, body: JSON.stringify({ padrao: true }) });
        const [pa, pb] = await Promise.all([
            prisma.priceBook.findUnique({ where: { id: nova.corpo.id } }),
            prisma.priceBook.findUnique({ where: { id: outra.corpo.id } }),
        ]);
        conferir('marcar uma desmarca a outra do mesmo grupo', !!pa?.padrao && !pb?.padrao);
        const genericas = await prisma.priceBook.count({ where: { padrao: true, nome_lpu: { in: ['PV Padrão Highline', 'LPU Genérico — Manutenção'] } } });
        conferir('padrões de outros grupos continuam intactos', genericas === 2);
        const invalida = await json(`/pricebooks/${nova.corpo.id}`, { method: 'PUT', headers: cabecalho, body: JSON.stringify({ tipo: 'QUALQUER' }) });
        conferir('área inválida é recusada', invalida.status === 400, `HTTP ${invalida.status}`);

        console.log('\n── Orçamento grava a base');
        const orc = await json('/budgets', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ tenant_id: operacao.tenant_id, contratante_id: operacao.contratante_id, atividade_id: operacao.id, assunto: `Teste LPU ${SUFIXO}`, tipo_orcamento: 'COTACAO_INTERNA' }),
        });
        conferir('orçamento criado', orc.ok, `HTTP ${orc.status} ${orc.corpo.error || ''}`);
        if (orc.ok) orcamentos.push(orc.corpo.id);
        conferir('orçamento nasce com a LPU escolhida', orc.corpo.pricebook_id === nova.corpo.id, `${orc.corpo.pricebook_id}`);
    } finally {
        if (orcamentos.length) {
            await prisma.budgetVersion.deleteMany({ where: { budget_id: { in: orcamentos } } }).catch(() => undefined);
            await prisma.budget.deleteMany({ where: { id: { in: orcamentos } } });
        }
        for (const id of bases) {
            await prisma.priceBookItem.deleteMany({ where: { pricebook_id: id } });
            await prisma.priceBook.deleteMany({ where: { id } });
        }
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
        if (falhas) process.exitCode = 1;
    })
    .catch(e => { console.error(e); process.exitCode = 1; });
