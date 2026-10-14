/**
 * Pagamento com saldo programado (14/10/2026).
 *
 *   1. 100% agora: uma parcela única;
 *   2. 50% agora + saldo em uma parcela com data prevista;
 *   3. 40% agora + saldo em duas parcelas (35% + 25%), cada uma com a sua data;
 *   4. recusas: saldo sem data, parcelas do saldo que não fecham.
 *
 *   npx tsx src/backend/scripts/validar-saldo-programado.ts
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
async function post(caminho: string, corpo: unknown) {
    const r = await fetch(`${API}${caminho}`, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
}
const resumo = (ps: any[]) => [...ps].sort((a, b) => (a.tipo + (a.data_prevista || '')).localeCompare(b.tipo + (b.data_prevista || '')))
    .map(p => `${p.tipo}:${p.percentual}:${p.valor}${p.data_prevista ? `:${String(p.data_prevista).slice(0, 10)}` : ''}`).join(' | ');

async function main() {
    const tenant = await prisma.tenant.findFirst();
    const atividade = await prisma.atividade.findFirst({ where: { tenant_id: tenant!.id }, orderBy: { created_at: 'desc' } });
    const fornecedor = await prisma.supplier.create({ data: { tenant_id: tenant!.id, nome: `Saldo programado ${Date.now().toString(36)}`, tipo: 'PESSOA_JURIDICA', categoria: 'MATERIAL', observacoes: 'Teste automatizado — pode apagar' } as any });
    const criadas: string[] = [];
    const base = { atividade_id: atividade!.id, supplier_id: fornecedor.id, finalidade: 'MATERIAL_CIVIL', valor_contratado: 1000, forma_pagamento: 'PIX', processo_tipo: 'PAYMENT_REQUEST', gatilho_saldo: 'CONCLUSAO' };
    try {
        console.log('\n── 1. 100% agora');
        const c1 = await post('/contratacoes', { ...base, percentual_entrada: 100, percentual_saldo: 0 });
        if (c1.corpo.id) criadas.push(c1.corpo.id);
        conferir('parcela única de R$ 1.000', resumo(c1.corpo.parcelas || []) === 'UNICA:100:1000', JSON.stringify(c1.corpo).slice(0, 300));

        console.log('\n── 2. 50% agora + saldo com data');
        const c2 = await post('/contratacoes', { ...base, percentual_entrada: 50, percentual_saldo: 50, saldos: [{ percentual: 50, data_prevista: '2026-11-30' }] });
        if (c2.corpo.id) criadas.push(c2.corpo.id);
        conferir('entrada 500 + saldo 500 em 30/11', resumo(c2.corpo.parcelas || []) === 'ENTRADA:50:500 | SALDO:50:500:2026-11-30', resumo(c2.corpo.parcelas || []) || JSON.stringify(c2.corpo));
        conferir('saldo nasce pendente', (c2.corpo.parcelas || []).filter((p: any) => p.tipo === 'SALDO').every((p: any) => p.status === 'PENDENTE'));

        console.log('\n── 3. 40% agora + saldo em duas parcelas');
        const c3 = await post('/contratacoes', { ...base, valor_contratado: 999.99, percentual_entrada: 40, percentual_saldo: 60, saldos: [{ percentual: 35, data_prevista: '2026-11-15' }, { percentual: 25, data_prevista: '2026-12-15' }] });
        if (c3.corpo.id) criadas.push(c3.corpo.id);
        const ps3 = c3.corpo.parcelas || [];
        conferir('três parcelas com datas', resumo(ps3) === 'ENTRADA:40:400 | SALDO:35:350:2026-11-15 | SALDO:25:249.99:2026-12-15', resumo(ps3) || JSON.stringify(c3.corpo));
        conferir('soma fecha com o contrato', Math.abs(ps3.reduce((s: number, p: any) => s + p.valor, 0) - 999.99) < 0.001);

        console.log('\n── 4. Recusas');
        const semData = await post('/contratacoes', { ...base, percentual_entrada: 50, percentual_saldo: 50, saldos: [{ percentual: 50 }] });
        if (semData.corpo.id) criadas.push(semData.corpo.id);
        conferir('saldo sem data prevista é recusado', semData.status === 400 && /data prevista/.test(semData.corpo.error), JSON.stringify(semData.corpo).slice(0, 200));
        const naoFecha = await post('/contratacoes', { ...base, percentual_entrada: 50, percentual_saldo: 50, saldos: [{ percentual: 30, data_prevista: '2026-11-30' }] });
        if (naoFecha.corpo.id) criadas.push(naoFecha.corpo.id);
        conferir('parcelas do saldo que não fecham são recusadas', naoFecha.status === 400 && /somam/.test(naoFecha.corpo.error), JSON.stringify(naoFecha.corpo).slice(0, 200));
    } finally {
        for (const id of criadas) {
            const parcelas = await prisma.parcelaPagamento.findMany({ where: { contratacao_id: id }, select: { id: true } });
            await prisma.solicitacaoPagamento.deleteMany({ where: { parcela_id: { in: parcelas.map(p => p.id) } } });
            await prisma.contratacaoFornecedor.delete({ where: { id } }).catch(() => undefined);
        }
        await prisma.supplier.delete({ where: { id: fornecedor.id } }).catch(() => undefined);
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
