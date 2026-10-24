/**
 * Agente de IA do orçamento (14/10/2026). Sem gastar a API: a resposta da
 * Anthropic é simulada para conferir o pedido (modelo, resposta estruturada,
 * chave no cabeçalho) e a leitura (sugestões válidas, descarte do inválido).
 * Contra o servidor, confere o status e a recusa clara sem chave.
 *
 *   npx tsx src/backend/scripts/validar-ia-orcamento.ts
 */
import './_sessao-teste';
import { descreverItem, revisarItens } from '../services/ia-orcamento.service';

const API = process.env.API_URL || 'http://localhost:3001/api';
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}

function falsaApi(input: object, capturar: (corpo: any, cab: any) => void, status = 200): typeof fetch {
    return (async (_url: any, init: any) => {
        capturar(JSON.parse(init.body), init.headers);
        const corpo = status === 200
            ? { content: [{ type: 'tool_use', name: JSON.parse(init.body).tools[0].name, input }], usage: { input_tokens: 100, output_tokens: 50 } }
            : { error: { message: 'invalid x-api-key' } };
        return new Response(JSON.stringify(corpo), { status });
    }) as any;
}

async function main() {
    console.log('\n── Servidor');
    const st = await fetch(`${API}/ia/status`).then(r => r.json()) as any;
    conferir('status informa disponibilidade e modelo Sonnet 5.5', typeof st.disponivel === 'boolean' && st.modelo === 'claude-sonnet-5-5', JSON.stringify(st));
    if (!st.disponivel) {
        const r = await fetch(`${API}/ia/orcamento/revisar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: [] }) });
        const d: any = await r.json();
        conferir('sem chave: recusa clara (503) pedindo a ANTHROPIC_API_KEY', r.status === 503 && /ANTHROPIC_API_KEY/.test(d.error), `${r.status} ${d.error}`);
    }

    console.log('\n── Revisão (resposta simulada)');
    const chaveAntes = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
    try {
        let pedido: any = null, cabecalho: any = null;
        const itens = [
            { indice: 0, servico: 'Remanejamento do sistema de energia', descricao: 'extensão de cabemente e remanejamento do QTM', unidade: 'vb', quantidade: 1 },
            { indice: 1, servico: 'Portão Tela', descricao: 'Portão de pedestre', unidade: 'm', quantidade: 1 },
        ];
        const r = await revisarItens(itens, { tipo_site: 'BTS', sharing: 'HIGHLINE' }, falsaApi({
            sugestoes: [
                { indice: 0, campo: 'descricao', sugerido: 'Extensão do cabeamento e remanejamento do QTM.', motivo: '"cabemente" → "cabeamento"', tipo: 'ortografia' },
                { indice: 1, campo: 'unidade', sugerido: 'un', motivo: 'Portão é contado por unidade', tipo: 'unidade' },
                { indice: 7, campo: 'descricao', sugerido: 'item que não existe', motivo: 'x', tipo: 'clareza' },
                { indice: 1, campo: 'servico', sugerido: 'Portão Tela', motivo: 'igual', tipo: 'clareza' },
            ],
            observacoes: ['Não há item de aterramento para o portão metálico.'],
        }, (c, h) => { pedido = c; cabecalho = h; }));
        conferir('pede ao modelo claude-sonnet-5-5', pedido?.model === 'claude-sonnet-5-5', pedido?.model);
        conferir('resposta pela ferramenta (tool_choice auto: o Sonnet 5.5 recusa "tool"/"any")', pedido?.tool_choice?.type === 'auto' && pedido?.tools?.[0]?.name === 'registrar_revisao');
        conferir('chave vai no cabeçalho x-api-key, versão da API informada', cabecalho?.['x-api-key'] === 'chave-de-teste' && !!cabecalho?.['anthropic-version']);
        conferir('itens e contexto vão no texto do pedido', /cabemente/.test(pedido?.messages?.[0]?.content) && /BTS/.test(pedido?.messages?.[0]?.content));
        conferir('2 sugestões válidas (descarta item inexistente e sugestão igual ao atual)', r.sugestoes.length === 2, JSON.stringify(r.sugestoes));
        conferir('sugestão traz o texto atual para comparar', r.sugestoes[0]?.atual === 'extensão de cabemente e remanejamento do QTM');
        conferir('observação geral do orçamento', r.observacoes.length === 1);

        console.log('\n── Descrição a partir de comentários');
        const d = await descreverItem({ comentario: 'radier 3x3 concreto 25 mpa base dos equipamentos', contexto: {} }, falsaApi(
            { servico: 'Construção de radier de concreto (25 MPa)', descricao: 'Radier em concreto fck 25 MPa, 3,00 × 3,00 m, para base dos equipamentos, conforme projeto.', unidade: 'm³' }, () => undefined));
        conferir('devolve serviço, descrição e unidade', d.servico.startsWith('Construção de radier') && /fck 25 MPa/.test(d.descricao) && d.unidade === 'm³');
        let recusou = false;
        try { await descreverItem({ comentario: 'ab', contexto: {} }, falsaApi({}, () => undefined)); } catch { recusou = true; }
        conferir('comentário vazio é recusado antes de chamar a IA', recusou);

        console.log('\n── Erro da API');
        let mensagem = '';
        try { await revisarItens(itens, {}, falsaApi({}, () => undefined, 401)); } catch (e: any) { mensagem = e.message; }
        conferir('erro da Anthropic chega com a mensagem dela', /invalid x-api-key/.test(mensagem), mensagem);
    } finally {
        if (chaveAntes === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = chaveAntes;
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
