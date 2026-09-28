/**
 * O valor da atividade mudou: o que acontece com as parcelas já lançadas?
 *
 * Cenário real (Rodrigo Barbosa Sobral): contrato de R$ 1.600,00 com entrada de
 * R$ 1.000,00 (62,5%) e saldo de R$ 600,00 (37,5%). O total da atividade passou
 * para R$ 3.500,00 e o saldo precisa virar R$ 2.500,00.
 *
 * O caminho intuitivo — editar a parcela direto para 2.500 — é recusado, e tem
 * de ser: a soma passaria do contratado. O caminho certo é corrigir o contrato,
 * e o saldo se ajusta sozinho.
 *
 * Também confere a direção contrária, que é onde mora o buraco: `reconciliarSaldo`
 * só trata aumento.
 *
 *   npx tsx src/backend/scripts/validar-ajuste-valor-contrato.ts
 */
const API = process.env.API_URL || 'http://localhost:3001/api';
const cabecalho = { 'Content-Type': 'application/json' };

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}

async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    const corpo = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, corpo } as { status: number; ok: boolean; corpo: any };
}

const parcelaDe = (c: any, tipo: string) => (c?.parcelas || []).find((p: any) => p.tipo === tipo);

async function main() {
    const atividades = await json('/atividades');
    const lista = Array.isArray(atividades.corpo) ? atividades.corpo : atividades.corpo?.atividades;
    const fornecedores = await json('/suppliers?limit=1');
    const supplier = (fornecedores.corpo?.items || [])[0];
    if (!lista?.length || !supplier) { console.log('\nPULADO — sem atividade ou fornecedor\n'); return; }

    const criado = await json('/contratacoes', {
        method: 'POST', headers: cabecalho,
        body: JSON.stringify({
            atividade_id: lista[0].id, supplier_id: supplier.id,
            finalidade: 'OUTROS', valor_contratado: 1600,
            percentual_entrada: 62.5, percentual_saldo: 37.5,
            forma_pagamento: 'PIX', observacoes: 'Teste automatizado — pode apagar',
        }),
    });
    conferir('contrato de 1.600 criado', criado.ok, criado.corpo?.error);
    if (!criado.ok) return;
    const id = criado.corpo.id;

    try {
        const inicial = await json(`/contratacoes/${id}`);
        conferir('entrada nasce com 1.000', parcelaDe(inicial.corpo, 'ENTRADA')?.valor === 1000);
        conferir('saldo nasce com 600', parcelaDe(inicial.corpo, 'SALDO')?.valor === 600);

        // ── O caminho intuitivo, e por que ele é recusado ────────────────────
        console.log('\n── Editar a parcela direto para 2.500');
        const saldoId = parcelaDe(inicial.corpo, 'SALDO')?.id;
        const direto = await json(`/contratacoes/parcelas/${saldoId}`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ valor: 2500 }),
        });
        conferir('recusa, porque passaria do contratado', direto.status === 400);
        conferir('a recusa diz o que fazer',
            /valor do contrato/i.test(String(direto.corpo?.error || '')), direto.corpo?.error);

        // ── O caminho certo ─────────────────────────────────────────────────
        console.log('\n── Corrigir o contrato para 3.500');
        const subiu = await json(`/contratacoes/${id}`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ valor_contratado: 3500 }),
        });
        conferir('aceita o novo valor contratado', subiu.ok, subiu.corpo?.error);

        const depois = await json(`/contratacoes/${id}`);
        const entrada = parcelaDe(depois.corpo, 'ENTRADA');
        const saldo = parcelaDe(depois.corpo, 'SALDO');
        conferir('a entrada permanece em 1.000', entrada?.valor === 1000, String(entrada?.valor));
        conferir('o saldo virou 2.500 sozinho', saldo?.valor === 2500, String(saldo?.valor));
        conferir('a soma fecha com o contrato', round2((entrada?.valor || 0) + (saldo?.valor || 0)) === 3500);
        conferir('o percentual do saldo acompanhou', Math.abs((saldo?.percentual || 0) - 71.43) < 0.05,
            String(saldo?.percentual));

        // ── A direção contrária ─────────────────────────────────────────────
        console.log('\n── Baixar o contrato de 3.500 para 2.000');
        const desceu = await json(`/contratacoes/${id}`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ valor_contratado: 2000 }),
        });
        conferir('aceita baixar até onde o saldo absorve', desceu.ok, desceu.corpo?.error);

        const menor = await json(`/contratacoes/${id}`);
        const alocado = round2((menor.corpo?.parcelas || []).reduce((s: number, p: any) => s + p.valor, 0));
        conferir('a entrada permanece em 1.000', parcelaDe(menor.corpo, 'ENTRADA')?.valor === 1000);
        conferir('o saldo encolheu para 1.000', parcelaDe(menor.corpo, 'SALDO')?.valor === 1000,
            String(parcelaDe(menor.corpo, 'SALDO')?.valor));
        conferir('a soma fecha com o contrato', alocado === 2000, `alocado ${alocado}`);

        console.log('\n── Baixar abaixo do que já está comprometido');
        const demais = await json(`/contratacoes/${id}`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ valor_contratado: 500 }),
        });
        conferir('recusa: a entrada de 1.000 não cabe em 500', demais.status === 400);
        conferir('a recusa diz quanto está comprometido',
            String(demais.corpo?.error || '').includes('R$'), demais.corpo?.error);

        const intacto = await json(`/contratacoes/${id}`);
        const somaFinal = round2((intacto.corpo?.parcelas || []).reduce((s: number, p: any) => s + p.valor, 0));
        conferir('a recusa não deixou resíduo', somaFinal === round2(intacto.corpo?.valor_contratado),
            `contratado ${intacto.corpo?.valor_contratado}, alocado ${somaFinal}`);
    } finally {
        await json(`/contratacoes/${id}`, { method: 'DELETE' });
    }
}

function round2(v: number) { return Math.round(v * 100) / 100; }

main()
    .catch(e => { console.error(e); falhas++; })
    .finally(() => {
        console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
        process.exitCode = falhas === 0 ? 0 : 1;
    });
