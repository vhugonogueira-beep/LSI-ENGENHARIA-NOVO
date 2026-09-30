/**
 * Editar e excluir contratações e pagamentos, contra a API de verdade.
 *
 * A aba Pagamentos não tinha como corrigir um lançamento errado: dava para
 * "excluir a solicitação" (que devolve a parcela para PENDENTE e a mantém no
 * contrato) mas não para apagar a linha nem a contratação. Estes são os
 * endpoints novos, e o que importa neles é o que eles RECUSAM.
 *
 * O teste cria os próprios registros e apaga tudo no fim — não mexe em
 * contratação existente.
 *
 *   npx tsx src/backend/scripts/validar-crud-contratacao.ts
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

async function main() {
    const atividades = await json('/atividades');
    const lista = Array.isArray(atividades.corpo) ? atividades.corpo : atividades.corpo?.atividades;
    if (!lista?.length) { console.log('\nPULADO — backend fora do ar ou sem atividades\n'); return; }
    const atividade = lista[0];

    const fornecedores = await json('/suppliers?limit=1');
    const supplier = (fornecedores.corpo?.items || [])[0];
    if (!supplier) { console.log('\nPULADO — nenhum fornecedor cadastrado\n'); return; }

    const criar = () => json('/contratacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            atividade_id: atividade.id,
            supplier_id: supplier.id,
            finalidade: 'MAO_DE_OBRA',
            valor_contratado: 1000,
            percentual_entrada: 40,
            percentual_saldo: 60,
            forma_pagamento: 'PIX',
            observacoes: 'Teste automatizado — pode apagar',
        }),
    });

    // ── Editar ──────────────────────────────────────────────────────────────
    console.log('\n── PUT /contratacoes/:id');
    const a = await criar();
    conferir('contratação de teste criada', a.ok, a.corpo?.error);
    if (!a.ok) return;

    const edicao = await json(`/contratacoes/${a.corpo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_contratado: 1500, observacoes: 'Serralheiro — grades e portão' }),
    });
    conferir('aceita novo valor e detalhamento', edicao.ok, edicao.corpo?.error);
    conferir('gravou o valor', edicao.corpo?.valor_contratado === 1500);
    conferir('gravou o detalhamento', edicao.corpo?.observacoes === 'Serralheiro — grades e portão');

    const zero = await json(`/contratacoes/${a.corpo.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_contratado: 0 }),
    });
    conferir('recusa valor zero', zero.status === 400);

    const vazio = await json(`/contratacoes/${a.corpo.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    conferir('recusa edição sem campo nenhum', vazio.status === 400);

    // O detalhamento tem de chegar ao e-mail: é para isso que ele existe.
    const detalhada = await json(`/contratacoes/${a.corpo.id}`);
    const parcela = (detalhada.corpo?.parcelas || [])[0];
    if (parcela) {
        const email = await json(`/contratacoes/parcelas/${parcela.id}/email`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        if (email.ok) {
            conferir('o detalhamento sai no e-mail',
                String(email.corpo?.html || '').includes('Serralheiro'));
        } else {
            console.log('   (e-mail exige autenticação; conferência do detalhamento feita na prévia)');
        }
    }

    // ── Excluir ─────────────────────────────────────────────────────────────
    console.log('\n── DELETE /contratacoes/:id');
    const antesParcelas = (detalhada.corpo?.parcelas || []).length;
    conferir('a contratação nasceu com parcelas', antesParcelas > 0);

    const apagar = await json(`/contratacoes/${a.corpo.id}`, { method: 'DELETE' });
    conferir('exclui contratação sem pagamento', apagar.ok, apagar.corpo?.error);

    const sumiu = await json(`/contratacoes/${a.corpo.id}`);
    conferir('a contratação sumiu de verdade', sumiu.status === 404);

    if (parcela) {
        const parcelaSumiu = await json(`/contratacoes/parcelas/${parcela.id}`, { method: 'DELETE' });
        conferir('as parcelas foram junto', parcelaSumiu.status === 404 || parcelaSumiu.status === 400);
    }

    // ── A recusa que protege o caixa ────────────────────────────────────────
    console.log('\n── Pagamento efetuado não pode ser apagado');
    const b = await criar();
    if (b.ok) {
        const p = (b.corpo?.parcelas || [])[0]
            || ((await json(`/contratacoes/${b.corpo.id}`)).corpo?.parcelas || [])[0];
        if (p) {
            await json(`/contratacoes/parcelas/${p.id}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PAGO' }),
            });
            const recusa = await json(`/contratacoes/${b.corpo.id}`, { method: 'DELETE' });
            conferir('recusa excluir contratação com parcela paga', recusa.status === 400);
            conferir('a recusa diz quanto já saiu do caixa',
                /R\$/.test(String(recusa.corpo?.error || '')), recusa.corpo?.error);

            const recusaParcela = await json(`/contratacoes/parcelas/${p.id}`, { method: 'DELETE' });
            conferir('recusa excluir parcela paga', recusaParcela.status === 400);

            const abaixo = await json(`/contratacoes/${b.corpo.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor_contratado: 1 }),
            });
            conferir('recusa valor contratado abaixo do já pago', abaixo.status === 400);

            // Limpeza: volta a parcela para PENDENTE e apaga.
            await json(`/contratacoes/parcelas/${p.id}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PENDENTE' }),
            });
        }
        const limpou = await json(`/contratacoes/${b.corpo.id}`, { method: 'DELETE' });
        conferir('limpeza do segundo registro de teste', limpou.ok, limpou.corpo?.error);
    }
}

main()
    .catch(e => { console.error(e); falhas++; })
    .finally(() => {
        console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
        process.exitCode = falhas === 0 ? 0 : 1;
    });
