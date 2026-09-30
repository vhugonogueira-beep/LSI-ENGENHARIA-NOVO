/**
 * Editar e excluir reembolsos/adiantamentos, contra a API de verdade.
 *
 * Complementa `validar-crud-contratacao.ts`. As duas seções financeiras da aba
 * Pagamentos precisam se comportar igual: a de fornecedores e a de reembolsos
 * manipulam dinheiro do mesmo jeito e não podem ter regras diferentes para a
 * mesma pergunta — "posso apagar isto?".
 *
 * O teste cria os próprios registros e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-crud-reembolso.ts
 */
import './_sessao-teste'; // toda rota de /api exige login desde 30/09/2026
const API = process.env.API_URL || 'http://localhost:3001/api';

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

const cabecalho = { 'Content-Type': 'application/json' };

async function main() {
    const atividades = await json('/atividades');
    const lista = Array.isArray(atividades.corpo) ? atividades.corpo : atividades.corpo?.atividades;
    if (!lista?.length) { console.log('\nPULADO — backend fora do ar ou sem atividades\n'); return; }
    const atividade_id = lista[0].id;

    const criar = (extra: Record<string, unknown> = {}) => json('/reembolsos', {
        method: 'POST', headers: cabecalho,
        body: JSON.stringify({
            atividade_id,
            natureza: 'REEMBOLSO',
            favorecido_nome: 'Teste automatizado — pode apagar',
            cpf_cnpj: '80460020200',
            motivo: 'Despesa de teste',
            forma_pagamento: 'PIX',
            despesas: [{ descricao: 'Item de teste', valor: 100, categoria: 'OUTROS' }],
            ...extra,
        }),
    });

    // ── Editar ──────────────────────────────────────────────────────────────
    console.log('\n── PUT /reembolsos/:id');
    const a = await criar();
    conferir('reembolso de teste criado', a.ok, a.corpo?.error);
    if (!a.ok) return;
    conferir('nasceu com referência sequencial', /^REE-\d{4}-\d{4}$/.test(String(a.corpo?.codigo)), a.corpo?.codigo);

    const edicao = await json(`/reembolsos/${a.corpo.id}`, {
        method: 'PUT', headers: cabecalho,
        body: JSON.stringify({ favorecido_nome: 'Favorecido corrigido', motivo: 'Serralheiro — grades' }),
    });
    conferir('aceita editar favorecido e motivo', edicao.ok, edicao.corpo?.error);
    conferir('gravou o favorecido', edicao.corpo?.favorecido_nome === 'Favorecido corrigido');
    conferir('gravou o motivo', edicao.corpo?.motivo === 'Serralheiro — grades');

    // ── Depósito: solicitar e desfazer ──────────────────────────────────────
    console.log('\n── Ciclo do depósito');
    // O reembolso já nasce com o depósito 1 cobrindo o total das despesas —
    // criar outro estouraria o valor, e o backend recusa (corretamente).
    const listaInicial = await json(`/reembolsos?atividade_id=${atividade_id}`);
    const registro = (listaInicial.corpo || []).find((r: any) => r.id === a.corpo.id);
    const depositoId = (registro?.pagamentos || [])[0]?.id;
    conferir('o reembolso já nasce com o depósito 1', Boolean(depositoId));

    const excedente = await json(`/reembolsos/${a.corpo.id}/pagamentos`, {
        method: 'POST', headers: cabecalho,
        body: JSON.stringify({ valor: 100, forma_pagamento: 'PIX' }),
    });
    conferir('recusa depósito que ultrapassa o valor do reembolso', excedente.status === 400);

    if (depositoId) {
        await json(`/reembolsos/pagamentos/${depositoId}/status`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ status: 'SOLICITADO' }),
        });
        const voltou = await json(`/reembolsos/pagamentos/${depositoId}/status`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ status: 'PENDENTE' }),
        });
        conferir('depósito volta para PENDENTE', voltou.ok && voltou.corpo?.status === 'PENDENTE');
        // Desfazer a solicitação tem de limpar a data do ciclo anterior, senão o
        // depósito fica "pendente" exibindo uma solicitação que não vale mais.
        conferir('cancelar a solicitação limpa a data', voltou.corpo?.data_solicitacao === null,
            String(voltou.corpo?.data_solicitacao));
    }

    // ── A recusa que protege o caixa ────────────────────────────────────────
    console.log('\n── Depósito pago não pode ser apagado');
    if (depositoId) {
        await json(`/reembolsos/pagamentos/${depositoId}/status`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ status: 'PAGO' }),
        });

        // O cabeçalho é derivado dos depósitos: com um depósito pago de um só,
        // o reembolso inteiro passa a PAGO.
        const cab = await json(`/reembolsos?atividade_id=${atividade_id}`);
        const atual = (cab.corpo || []).find((r: any) => r.id === a.corpo.id);
        conferir('o cabeçalho sincronizou com o depósito', atual?.status === 'PAGO', atual?.status);

        const recusa = await json(`/reembolsos/${a.corpo.id}`, { method: 'DELETE' });
        conferir('recusa excluir com depósito pago', recusa.status === 400);
        conferir('a recusa diz quanto já saiu do caixa',
            /R\$/.test(String(recusa.corpo?.error || '')), recusa.corpo?.error);

        const recusaDep = await json(`/reembolsos/pagamentos/${depositoId}`, { method: 'DELETE' });
        conferir('recusa excluir depósito pago', recusaDep.status === 400);

        // Limpeza: volta para PENDENTE e apaga.
        await json(`/reembolsos/pagamentos/${depositoId}/status`, {
            method: 'PUT', headers: cabecalho, body: JSON.stringify({ status: 'PENDENTE' }),
        });
    }

    // ── Excluir ─────────────────────────────────────────────────────────────
    console.log('\n── DELETE /reembolsos/:id');
    const apagar = await json(`/reembolsos/${a.corpo.id}`, { method: 'DELETE' });
    conferir('exclui reembolso sem depósito pago', apagar.ok, apagar.corpo?.error);

    const depois = await json(`/reembolsos?atividade_id=${atividade_id}`);
    conferir('sumiu da listagem', !(depois.corpo || []).some((r: any) => r.id === a.corpo.id));
    conferir('os depósitos foram junto',
        depositoId ? (await json(`/reembolsos/pagamentos/${depositoId}`, { method: 'DELETE' })).status >= 400 : true);
}

main()
    .catch(e => { console.error(e); falhas++; })
    .finally(() => {
        console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
        process.exitCode = falhas === 0 ? 0 : 1;
    });
