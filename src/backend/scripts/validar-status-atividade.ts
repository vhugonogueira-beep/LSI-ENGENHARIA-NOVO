/**
 * Fluxo de status da atividade — regra central e endpoint.
 *
 * Cobre as três decisões que diferenciam este fluxo do anterior:
 *   1. automação nunca regride;
 *   2. automação nunca tira ninguém de ON_HOLD;
 *   3. automação só alcança EM_EXECUCAO e CONCLUIDA — os outros dois são manuais.
 *
 * E confere que o PUT rejeita status fora do fluxo, que era por onde os estados
 * antigos entravam.
 *
 *   npx tsx src/backend/scripts/validar-status-atividade.ts
 */
import './_sessao-teste'; // toda rota de /api exige login desde 30/09/2026
import {
    STATUS_ATIVIDADE, STATUS_ATIVIDADE_LABEL, STATUS_AUTOMATICOS,
    proximoStatusAutomatico, avanca, automacaoPodeAlterar,
} from '../services/status-atividade.service';

let falhas = 0;
function ok(nome: string, condicao: boolean) {
    console.log(`   ${condicao ? 'OK  ' : 'FALHA'} ${nome}`);
    if (!condicao) falhas++;
}

console.log('\n── Fluxo');
ok('cinco estados', STATUS_ATIVIDADE.length === 5);
ok('todos com rótulo', STATUS_ATIVIDADE.every(s => !!STATUS_ATIVIDADE_LABEL[s]));
ok('só EM_EXECUCAO e CONCLUIDA são automáticos', STATUS_AUTOMATICOS.join() === 'EM_EXECUCAO,CONCLUIDA');

console.log('\n── Automação avança');
ok('PLANEJAMENTO → EM_EXECUCAO', proximoStatusAutomatico('PLANEJAMENTO', 'EM_EXECUCAO') === 'EM_EXECUCAO');
ok('AGUARDANDO_LIBERACAO → EM_EXECUCAO', proximoStatusAutomatico('AGUARDANDO_LIBERACAO', 'EM_EXECUCAO') === 'EM_EXECUCAO');
ok('EM_EXECUCAO → CONCLUIDA', proximoStatusAutomatico('EM_EXECUCAO', 'CONCLUIDA') === 'CONCLUIDA');

console.log('\n── Automação não regride');
ok('CONCLUIDA não volta a EM_EXECUCAO', proximoStatusAutomatico('CONCLUIDA', 'EM_EXECUCAO') === null);
ok('EM_EXECUCAO não repete EM_EXECUCAO', proximoStatusAutomatico('EM_EXECUCAO', 'EM_EXECUCAO') === null);
ok('avanca() é estritamente crescente', avanca('EM_EXECUCAO', 'EM_EXECUCAO') === false);

console.log('\n── ON_HOLD é decisão humana');
ok('automação não sai de ON_HOLD', proximoStatusAutomatico('ON_HOLD', 'EM_EXECUCAO') === null);
ok('automação não conclui quem está em hold', proximoStatusAutomatico('ON_HOLD', 'CONCLUIDA') === null);
ok('automacaoPodeAlterar(ON_HOLD) = false', automacaoPodeAlterar('ON_HOLD') === false);

console.log('\n── Estados manuais são inalcançáveis por automação');
ok('não chega em AGUARDANDO_LIBERACAO', proximoStatusAutomatico('PLANEJAMENTO', 'AGUARDANDO_LIBERACAO' as any) === null);
ok('não chega em ON_HOLD', proximoStatusAutomatico('EM_EXECUCAO', 'ON_HOLD' as any) === null);

console.log('\n── Estados antigos não sobrevivem');
for (const velho of ['AGUARDANDO_APC', 'APC_LIBERADO', 'PAUSADA']) {
    ok(`${velho} fora do fluxo`, !(STATUS_ATIVIDADE as readonly string[]).includes(velho));
}

async function endpoint() {
    console.log('\n── PUT /api/atividades/:id');
    const base = 'http://localhost:3001';
    const lista = await fetch(`${base}/api/atividades`).then(r => r.ok ? r.json() : null).catch(() => null);
    const itens = Array.isArray(lista) ? lista : lista?.atividades;
    if (!itens?.length) {
        console.log('   PULADO — backend fora do ar ou sem atividades');
        return;
    }
    const alvo = itens[0];
    const original = alvo.status_operacional;

    const recusa = await fetch(`${base}/api/atividades/${alvo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_operacional: 'APC_LIBERADO' }),
    });
    ok('rejeita APC_LIBERADO com 400', recusa.status === 400);

    const aceita = await fetch(`${base}/api/atividades/${alvo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_operacional: 'ON_HOLD', observacao_status: 'teste automatizado' }),
    });
    ok('aceita ON_HOLD', aceita.ok);

    const depois = await fetch(`${base}/api/atividades/${alvo.id}`).then(r => r.json());
    ok('gravou ON_HOLD', depois.status_operacional === 'ON_HOLD');

    // Devolve como estava — o script roda contra a base real.
    await fetch(`${base}/api/atividades/${alvo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_operacional: original, observacao_status: 'reversão do teste' }),
    });
    const voltou = await fetch(`${base}/api/atividades/${alvo.id}`).then(r => r.json());
    ok(`restaurou ${original}`, voltou.status_operacional === original);
}

endpoint().finally(() => {
    console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
    process.exitCode = falhas === 0 ? 0 : 1;
});
