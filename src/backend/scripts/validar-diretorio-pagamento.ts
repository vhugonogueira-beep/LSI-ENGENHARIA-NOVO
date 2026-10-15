/**
 * Diretório do pagamento (14/10/2026): informado no novo pagamento, sai em todo
 * e-mail de despesa; editável depois; sem ele, vale o diretório da atividade.
 * Vale também para adiantamento/reembolso.
 *
 *   npx tsx src/backend/scripts/validar-diretorio-pagamento.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };

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
    const tenant = await prisma.tenant.findFirst();
    const atividade = await prisma.atividade.findFirst({ where: { tenant_id: tenant!.id }, orderBy: { created_at: 'desc' } });
    const fornecedor = await prisma.supplier.create({ data: { tenant_id: tenant!.id, nome: `Diretório ${Date.now().toString(36)}`, tipo: 'PESSOA_JURIDICA', categoria: 'MATERIAL', pix: '12345678000199', pix_tipo: 'CNPJ', forma_pagamento: 'PIX', observacoes: 'Teste automatizado — pode apagar' } as any });
    const DIR = 'P:\\Obras\\TESTE-DIR\\Pagamentos';
    let contratacaoId = '', reembolsoId = '';
    try {
        console.log('\n── Pagamento');
        const c = await json('/contratacoes', 'POST', { atividade_id: atividade!.id, supplier_id: fornecedor.id, finalidade: 'OUTROS', valor_contratado: 10, forma_pagamento: 'PIX', processo_tipo: 'PAYMENT_REQUEST', percentual_entrada: 100, percentual_saldo: 0, diretorio_url: `  ${DIR}  ` });
        contratacaoId = c.corpo.id;
        conferir('diretório gravado (sem espaços nas pontas)', c.corpo.diretorio_url === DIR, JSON.stringify(c.corpo).slice(0, 200));
        const parcela = c.corpo.parcelas?.[0]?.id;
        const e1 = await json(`/contratacoes/parcelas/${parcela}/email`, 'POST', {});
        conferir('sai no e-mail de pagamento', JSON.stringify(e1.corpo).includes('TESTE-DIR'), e1.corpo.error);
        await json(`/contratacoes/${contratacaoId}`, 'PUT', { diretorio_url: 'P:\\Outro\\Lugar' });
        const e2 = await json(`/contratacoes/parcelas/${parcela}/email`, 'POST', {});
        conferir('editado, o e-mail acompanha', JSON.stringify(e2.corpo).includes('Outro'), e2.corpo.error);

        console.log('\n── Adiantamento');
        const r = await json('/reembolsos', 'POST', { atividade_id: atividade!.id, natureza: 'ADIANTAMENTO', supplier_id: fornecedor.id, favorecido_nome: fornecedor.nome, valor_adiantado: 50, destino: 'Marabá/PA', diretorio_url: DIR, forma_pagamento: 'PIX' });
        reembolsoId = r.corpo.id;
        conferir('diretório gravado no adiantamento', r.corpo.diretorio_url === DIR, JSON.stringify(r.corpo).slice(0, 200));
        const e3 = await json(`/reembolsos/${reembolsoId}/email`, 'POST', {});
        conferir('sai no e-mail do adiantamento', JSON.stringify(e3.corpo).includes('TESTE-DIR'), `HTTP ${e3.status} ${e3.corpo.error || ''}`);
    } finally {
        if (contratacaoId) {
            const ps = await prisma.parcelaPagamento.findMany({ where: { contratacao_id: contratacaoId } });
            await prisma.solicitacaoPagamento.deleteMany({ where: { parcela_id: { in: ps.map(x => x.id) } } });
            await prisma.contratacaoFornecedor.delete({ where: { id: contratacaoId } }).catch(() => undefined);
        }
        if (reembolsoId) {
            await prisma.reembolsoPagamento.deleteMany({ where: { reembolso_id: reembolsoId } }).catch(() => undefined);
            await prisma.reembolsoDespesa.deleteMany({ where: { reembolso_id: reembolsoId } }).catch(() => undefined);
            await prisma.reembolso.delete({ where: { id: reembolsoId } }).catch(() => undefined);
        }
        await prisma.supplier.delete({ where: { id: fornecedor.id } }).catch(() => undefined);
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
