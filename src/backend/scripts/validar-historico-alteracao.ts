/**
 * O motivo da alteração de valor fica guardado e volta na leitura.
 *
 * A pergunta que originou isto: "onde ficou salvo o comentário que eu fiz a
 * respeito do motivo da alteração do valor?". A resposta era: em lugar nenhum.
 * O modelo `AuditLog` existia no schema e nunca tinha recebido uma escrita, e a
 * edição de valor não tinha campo de motivo.
 *
 *   npx tsx src/backend/scripts/validar-historico-alteracao.ts
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

const MOTIVO_CONTRATO = 'Escopo ampliado — total da atividade passou para R$ 3.500,00';
const MOTIVO_PARCELA = 'Correção: entrada acordada em 800 na reunião de 16/09';

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
    conferir('contrato de teste criado', criado.ok, criado.corpo?.error);
    if (!criado.ok) return;
    const id = criado.corpo.id;

    try {
        console.log('\n── Histórico começa vazio');
        const zero = await json(`/contratacoes/${id}/historico`);
        conferir('endpoint responde', zero.ok, zero.corpo?.error);
        conferir('sem alterações ainda', Array.isArray(zero.corpo) && zero.corpo.length === 0);

        console.log('\n── Alterar o contrato com motivo');
        const edicao = await json(`/contratacoes/${id}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ valor_contratado: 3500, motivo: MOTIVO_CONTRATO }),
        });
        conferir('edição aceita', edicao.ok, edicao.corpo?.error);

        const h1 = await json(`/contratacoes/${id}/historico`);
        const doContrato = (h1.corpo || []).find((a: any) => a.entidade === 'ContratacaoFornecedor');
        conferir('a alteração foi registrada', Boolean(doContrato));
        conferir('o motivo voltou inteiro', doContrato?.motivo === MOTIVO_CONTRATO, doContrato?.motivo);
        conferir('guardou o valor anterior', doContrato?.antes?.valor_contratado === 1600, String(doContrato?.antes?.valor_contratado));
        conferir('guardou o valor novo', doContrato?.depois?.valor_contratado === 3500, String(doContrato?.depois?.valor_contratado));
        conferir('o alvo é legível', doContrato?.alvo === 'Contratação', doContrato?.alvo);

        console.log('\n── Alterar uma parcela com motivo');
        const detalhe = await json(`/contratacoes/${id}`);
        const entrada = (detalhe.corpo?.parcelas || []).find((p: any) => p.tipo === 'ENTRADA');
        const edParcela = await json(`/contratacoes/parcelas/${entrada.id}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ valor: 800, motivo: MOTIVO_PARCELA }),
        });
        conferir('edição da parcela aceita', edParcela.ok, edParcela.corpo?.error);

        const h2 = await json(`/contratacoes/${id}/historico`);
        const daParcela = (h2.corpo || []).find((a: any) => a.entidade === 'ParcelaPagamento');
        conferir('a alteração da parcela foi registrada', Boolean(daParcela));
        conferir('o motivo da parcela voltou inteiro', daParcela?.motivo === MOTIVO_PARCELA, daParcela?.motivo);
        conferir('o alvo mostra o tipo da parcela', daParcela?.alvo === 'ENTRADA', daParcela?.alvo);
        conferir('o histórico junta contrato e parcelas', (h2.corpo || []).length === 2, String((h2.corpo || []).length));
        conferir('mais recente primeiro',
            new Date(h2.corpo[0].criado_em).getTime() >= new Date(h2.corpo[1].criado_em).getTime());

        console.log('\n── Alterar sem motivo continua permitido');
        const semMotivo = await json(`/contratacoes/${id}`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ valor_contratado: 3600 }),
        });
        conferir('edição sem motivo aceita', semMotivo.ok, semMotivo.corpo?.error);
        const h3 = await json(`/contratacoes/${id}/historico`);
        conferir('registrada mesmo sem motivo', (h3.corpo || []).length === 3, String((h3.corpo || []).length));
        conferir('o motivo vem nulo, não inventado', h3.corpo[0]?.motivo === null, String(h3.corpo[0]?.motivo));
    } finally {
        await json(`/contratacoes/${id}`, { method: 'DELETE' });
    }
}

main()
    .catch(e => { console.error(e); falhas++; })
    .finally(() => {
        console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
        process.exitCode = falhas === 0 ? 0 : 1;
    });
