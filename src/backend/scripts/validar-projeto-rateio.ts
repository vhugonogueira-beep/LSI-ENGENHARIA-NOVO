/**
 * Projeto de atividades e rateio nominal do adiantamento.
 *
 * Caso real: 25 vistorias de energia da Oi, orçadas juntas, com um adiantamento
 * único para pagar os técnicos. O dinheiro nasce no projeto e desce para cada
 * vistoria na prestação de contas, com o valor e o prestador nomeados.
 *
 * O teste cria o próprio projeto e as próprias atividades, e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-projeto-rateio.ts
 */
import './_sessao-teste'; // toda rota de /api exige login desde 30/09/2026
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

const TESTE = 'Teste automatizado — pode apagar';

async function criarAtividade(titulo: string, site: string) {
    return json('/atividades', {
        method: 'POST', headers: cabecalho,
        body: JSON.stringify({
            titulo, tipo_demanda: 'OPERACAO', subtipo_demanda: 'VISTORIA',
            sharing: 'HIGHLINE', id_site_sharing: site, id_site_operadora: site,
            modelo_operacao: 'EXECUCAO_DIRETA', descricao: TESTE,
        }),
    });
}

async function main() {
    const criados = { projeto: '', atividades: [] as string[], reembolso: '' };
    try {
        // ── Código sequencial não repete ────────────────────────────────────
        console.log('\n── Códigos sequenciais');
        const a1 = await criarAtividade('Vistoria de teste 1', 'TST001');
        const a2 = await criarAtividade('Vistoria de teste 2', 'TST002');
        conferir('duas atividades criadas', a1.ok && a2.ok, a1.corpo?.error || a2.corpo?.error);
        if (!a1.ok || !a2.ok) return;
        criados.atividades = [a1.corpo.id, a2.corpo.id];
        conferir('códigos diferentes entre si', a1.corpo.codigo !== a2.corpo.codigo,
            `${a1.corpo.codigo} / ${a2.corpo.codigo}`);

        const todas = await json('/atividades');
        const lista = Array.isArray(todas.corpo) ? todas.corpo : todas.corpo?.atividades;
        const codigos = lista.map((a: any) => a.codigo);
        conferir('nenhum código repetido na base', new Set(codigos).size === codigos.length,
            codigos.filter((c: string, i: number) => codigos.indexOf(c) !== i).join(', '));

        // ── Projeto ─────────────────────────────────────────────────────────
        console.log('\n── Projeto');
        const proj = await json('/acionamentos', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ titulo: 'Vistoria de Energia OI — teste', descricao_bruta: TESTE }),
        });
        conferir('projeto criado', proj.ok, proj.corpo?.error);
        if (!proj.ok) return;
        criados.projeto = proj.corpo.id;
        conferir('nasceu com código ACI', /^ACI-\d{4}-\d{3}$/.test(proj.corpo.codigo), proj.corpo.codigo);

        // ── Agrupar atividades JÁ existentes ────────────────────────────────
        console.log('\n── Agrupar atividades existentes');
        const agrupou = await json(`/acionamentos/${criados.projeto}/atividades`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ atividade_ids: criados.atividades }),
        });
        conferir('as duas entraram no projeto', agrupou.ok && agrupou.corpo?.atividades?.length === 2,
            String(agrupou.corpo?.atividades?.length ?? agrupou.corpo?.error));

        const soUma = await json(`/acionamentos/${criados.projeto}/atividades`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ atividade_ids: [criados.atividades[0]] }),
        });
        conferir('tirar do grupo não apaga a atividade', soUma.ok && soUma.corpo?.atividades?.length === 1);
        const aindaExiste = await json(`/atividades/${criados.atividades[1]}`);
        conferir('a desvinculada continua no sistema', aindaExiste.ok);

        await json(`/acionamentos/${criados.projeto}/atividades`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ atividade_ids: criados.atividades }),
        });

        // ── Adiantamento no projeto ─────────────────────────────────────────
        console.log('\n── Adiantamento do projeto');
        const fornecedores = await json('/suppliers?limit=1');
        const supplier = (fornecedores.corpo?.items || [])[0];

        const doisDonos = await json('/reembolsos', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({
                atividade_id: criados.atividades[0], acionamento_id: criados.projeto,
                natureza: 'ADIANTAMENTO', favorecido_nome: TESTE, valor_adiantado: 1000,
                forma_pagamento: 'PIX',
            }),
        });
        conferir('recusa atividade E projeto juntos', doisDonos.status === 400);

        const semDono = await json('/reembolsos', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ natureza: 'ADIANTAMENTO', favorecido_nome: TESTE, valor_adiantado: 1000, forma_pagamento: 'PIX' }),
        });
        conferir('recusa sem atividade e sem projeto', semDono.status === 400);

        const adi = await json('/reembolsos', {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({
                acionamento_id: criados.projeto, natureza: 'ADIANTAMENTO',
                favorecido_nome: 'Coordenador de campo — teste', cpf_cnpj: '80460020200',
                valor_adiantado: 1000, forma_pagamento: 'PIX', motivo: 'Diárias dos técnicos das vistorias',
            }),
        });
        conferir('adiantamento nasce no projeto', adi.ok, adi.corpo?.error);
        if (!adi.ok) return;
        criados.reembolso = adi.corpo.id;
        conferir('ficou sem atividade', adi.corpo.atividade_id === null);
        conferir('ganhou referência ADT', /^ADT-\d{4}-\d{4}$/.test(String(adi.corpo.codigo)), adi.corpo.codigo);

        // ── Rateio nominal ──────────────────────────────────────────────────
        console.log('\n── Rateio: valor, site e prestador em cada linha');
        const rateio = await json(`/reembolsos/${criados.reembolso}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({
                despesas: [
                    { descricao: 'Diária técnico', valor: 480, categoria: 'SERVICO', atividade_id: criados.atividades[0], supplier_id: supplier?.id || null },
                    { descricao: 'Combustível', valor: 180, categoria: 'COMBUSTIVEL', atividade_id: criados.atividades[0] },
                    { descricao: 'Diária técnico', valor: 300, categoria: 'SERVICO', atividade_id: criados.atividades[1] },
                ],
            }),
        });
        conferir('rateio aceito', rateio.ok, rateio.corpo?.error);

        const doisPrestadores = await json(`/reembolsos/${criados.reembolso}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({
                despesas: [{ descricao: 'x', valor: 10, atividade_id: criados.atividades[0], supplier_id: supplier?.id, funcionario_id: 'qualquer' }],
            }),
        });
        conferir('recusa funcionário E fornecedor na mesma linha', doisPrestadores.status === 400);

        const passaDoTeto = await json(`/reembolsos/${criados.reembolso}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({ despesas: [{ descricao: 'exagero', valor: 5000, atividade_id: criados.atividades[0] }] }),
        });
        conferir('recusa prestar mais do que foi adiantado', passaDoTeto.status === 400,
            passaDoTeto.corpo?.error);

        const foraDoProjeto = await json('/atividades');
        const alheia = (Array.isArray(foraDoProjeto.corpo) ? foraDoProjeto.corpo : foraDoProjeto.corpo?.atividades)
            .find((a: any) => !criados.atividades.includes(a.id));
        if (alheia) {
            const invasora = await json(`/reembolsos/${criados.reembolso}`, {
                method: 'PUT', headers: cabecalho,
                body: JSON.stringify({ despesas: [{ descricao: 'y', valor: 10, atividade_id: alheia.id }] }),
            });
            conferir('recusa atividade fora do projeto', invasora.status === 400, invasora.corpo?.error);
        }

        // ── O custo desce para a atividade ──────────────────────────────────
        console.log('\n── Consolidado do projeto');
        await json(`/reembolsos/${criados.reembolso}`, {
            method: 'PUT', headers: cabecalho,
            body: JSON.stringify({
                despesas: [
                    { descricao: 'Diária técnico', valor: 480, categoria: 'SERVICO', atividade_id: criados.atividades[0] },
                    { descricao: 'Diária técnico', valor: 300, categoria: 'SERVICO', atividade_id: criados.atividades[1] },
                ],
            }),
        });
        const fin = await json(`/acionamentos/${criados.projeto}/financeiro`);
        conferir('consolidado responde', fin.ok, fin.corpo?.error);
        conferir('lista as 2 atividades', fin.corpo?.atividades?.length === 2);
        const porAtividade = Object.fromEntries((fin.corpo?.atividades || []).map((a: any) => [a.id, a.custo_rateado]));
        conferir('a fatia caiu na vistoria certa', porAtividade[criados.atividades[0]] === 480,
            String(porAtividade[criados.atividades[0]]));
        conferir('e a outra fatia na outra', porAtividade[criados.atividades[1]] === 300,
            String(porAtividade[criados.atividades[1]]));
        conferir('o resumo soma o rateado', fin.corpo?.resumo?.rateado === 780, String(fin.corpo?.resumo?.rateado));
    } finally {
        // Ordem importa: o projeto só sai vazio, e excluir atividade exige motivo.
        // Sem isso a limpeza falhava calada e deixava TST001/TST002 na carteira.
        const limpeza: string[] = [];
        if (criados.reembolso) {
            const r = await json(`/reembolsos/${criados.reembolso}`, { method: 'DELETE' });
            if (!r.ok) limpeza.push(`reembolso: HTTP ${r.status} ${r.corpo?.error || ''}`);
        }
        for (const id of criados.atividades) {
            const r = await json(`/atividades/${id}`, {
                method: 'DELETE', headers: cabecalho,
                body: JSON.stringify({ motivo: 'Limpeza do teste automatizado validar-projeto-rateio' }),
            });
            if (!r.ok) limpeza.push(`atividade ${id}: HTTP ${r.status} ${r.corpo?.error || ''}`);
        }
        if (criados.projeto) {
            const r = await json(`/acionamentos/${criados.projeto}`, { method: 'DELETE' });
            if (!r.ok) limpeza.push(`projeto: HTTP ${r.status} ${r.corpo?.error || ''}`);
        }
        conferir('limpeza: nada do teste ficou na base', limpeza.length === 0, limpeza.join(' | '));
    }
}

main()
    .catch(e => { console.error(e); falhas++; })
    .finally(() => {
        console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
        process.exitCode = falhas === 0 ? 0 : 1;
    });
