// ─────────────────────────────────────────────────────────────────────────────
// Agente de IA do orçamento (14/10/2026) — Claude Sonnet 5.5 pela API da Anthropic.
//
//   - revisar: lê os itens (serviço, descrição, unidade, quantidade) e sugere
//     correções de português, clareza, unidade incoerente e lacunas de escopo;
//   - descrever: transforma os comentários livres de quem orça numa descrição
//     técnica no padrão da LS.
//
// Nada é aplicado sozinho: a tela mostra a sugestão e a pessoa aceita ou ignora.
// Só vão para a IA os textos dos itens e o contexto da obra (tipo de site,
// sharing, escopo) — nenhum dado pessoal ou bancário.
//
// A chave fica só no .env do servidor (ANTHROPIC_API_KEY); o repositório é
// público. Sem chave, o recurso aparece desativado na tela.
// ─────────────────────────────────────────────────────────────────────────────

export const MODELO_IA = process.env.IA_MODELO || 'claude-sonnet-5-5';
const URL_API = 'https://api.anthropic.com/v1/messages';

export const iaDisponivel = () => Boolean(process.env.ANTHROPIC_API_KEY);

export interface ItemParaRevisao { indice: number; codigo?: string; servico: string; descricao?: string; unidade?: string; quantidade?: number }
export interface ContextoObra { tipo_site?: string | null; sharing?: string | null; escopo?: string | null; tipo_demanda?: string | null }
export interface Sugestao { indice: number; campo: 'servico' | 'descricao' | 'unidade'; atual: string; sugerido: string; motivo: string; tipo: string }

const PADRAO_LS = `Você é engenheiro orçamentista sênior da LS Office, empresa de engenharia de telecom (implantação e
operação de sites: BTS, roof top, collo, small cell; obras civis, infraestrutura elétrica, aterramento, SPDA, RF).
Padrão de redação da LS para itens de orçamento:
- Serviço: título curto, começa com substantivo (ex.: "Construção de radier de concreto (25 MPa)", "Malha de aterramento").
- Descrição: frase técnica objetiva, em português correto, com o que será feito, materiais/especificação e referência
  ao projeto quando couber (ex.: "Execução de 6 caixas de passagem (60x60 cm) e 1 caixa de aterramento (30x30 cm).").
- Use unidades do SI e grafia correta: m, m², m³, kg, un, vb (verba), cj (conjunto); "MPa", "fck", "kV".
- Não invente quantidades, preços, marcas ou normas que não estejam no texto; não mude o sentido do serviço.`;

async function chamar(ferramenta: { name: string; description: string; input_schema: object }, conteudo: string, fetcher: typeof fetch = fetch) {
    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) throw new Error('IA_NAO_CONFIGURADA');
    const r = await fetcher(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: MODELO_IA,
            max_tokens: 4096,
            system: `${PADRAO_LS}\n\nResponda SEMPRE chamando a ferramenta ${ferramenta.name}, uma única vez, sem texto fora dela.`,
            tools: [ferramenta],
            // O Sonnet 5.5 recusa tool_choice "tool"/"any" (erro visto em 23/10/2026):
            // a escolha fica automática e a instrução acima pede a ferramenta.
            tool_choice: { type: 'auto' },
            messages: [{ role: 'user', content: conteudo }],
        }),
    });
    const corpo: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.error?.message ? `IA: ${corpo.error.message}` : `IA indisponível (HTTP ${r.status})`);
    const tokens = (corpo.usage?.input_tokens || 0) + (corpo.usage?.output_tokens || 0);
    const uso = corpo.content?.find((c: any) => c.type === 'tool_use' && c.name === ferramenta.name);
    if (uso) return { dados: uso.input, tokens };
    // Respondeu em texto: aproveita o JSON, se houver.
    const texto = (corpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const json = texto.match(/\{[\s\S]*\}/);
    if (json) { try { return { dados: JSON.parse(json[0]), tokens }; } catch { /* segue para o erro */ } }
    throw new Error('A IA não devolveu uma resposta estruturada. Tente de novo.');
}

const contextoTexto = (c: ContextoObra) => [
    c.tipo_demanda && `Área: ${c.tipo_demanda}`, c.tipo_site && `Tipo de site: ${c.tipo_site}`,
    c.sharing && `Sharing/cliente: ${c.sharing}`, c.escopo && `Escopo do orçamento: ${c.escopo}`,
].filter(Boolean).join(' · ') || 'Sem contexto adicional';

export async function revisarItens(itens: ItemParaRevisao[], contexto: ContextoObra, fetcher?: typeof fetch) {
    if (!itens.length) return { sugestoes: [] as Sugestao[], observacoes: [] as string[], tokens: 0 };
    const lista = itens.map(i => `#${i.indice} | código: ${i.codigo || '—'} | serviço: ${i.servico || '—'} | descrição: ${i.descricao || '—'} | unidade: ${i.unidade || '—'} | qtd: ${i.quantidade ?? '—'}`).join('\n');
    const { dados, tokens } = await chamar({
        name: 'registrar_revisao',
        description: 'Registra as sugestões de melhoria para os itens do orçamento.',
        input_schema: {
            type: 'object',
            properties: {
                sugestoes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            indice: { type: 'integer', description: 'O # do item' },
                            campo: { type: 'string', enum: ['servico', 'descricao', 'unidade'] },
                            sugerido: { type: 'string', description: 'O texto completo corrigido para o campo' },
                            motivo: { type: 'string', description: 'Por que mudar, em uma frase curta' },
                            tipo: { type: 'string', enum: ['ortografia', 'clareza', 'unidade', 'padrao'] },
                        },
                        required: ['indice', 'campo', 'sugerido', 'motivo', 'tipo'],
                    },
                },
                observacoes: {
                    type: 'array', items: { type: 'string' },
                    description: 'Lacunas ou incoerências do orçamento como um todo (ex.: item provavelmente faltando, duplicidade). No máximo 5.',
                },
            },
            required: ['sugestoes', 'observacoes'],
        },
    }, `Revise os itens deste orçamento. Só sugira o que melhora de fato (erro de português, texto confuso ou incompleto, unidade incoerente, fora do padrão); item já bom fica sem sugestão. Item sem descrição: proponha uma, a partir do serviço.\n\nContexto: ${contextoTexto(contexto)}\n\nItens:\n${lista}`, fetcher);
    const porIndice = new Map(itens.map(i => [i.indice, i]));
    const sugestoes: Sugestao[] = (Array.isArray(dados?.sugestoes) ? dados.sugestoes : [])
        .filter((s: any) => porIndice.has(Number(s.indice)) && ['servico', 'descricao', 'unidade'].includes(s.campo) && String(s.sugerido || '').trim())
        .map((s: any) => {
            const item = porIndice.get(Number(s.indice))!;
            const atual = String((s.campo === 'servico' ? item.servico : s.campo === 'descricao' ? item.descricao : item.unidade) || '');
            return { indice: Number(s.indice), campo: s.campo, atual, sugerido: String(s.sugerido).trim(), motivo: String(s.motivo || '').trim(), tipo: String(s.tipo || 'clareza') };
        })
        // Sugestão igual ao texto atual não é sugestão.
        .filter((s: Sugestao) => s.sugerido !== s.atual.trim());
    const observacoes = (Array.isArray(dados?.observacoes) ? dados.observacoes : []).map(String).filter(Boolean).slice(0, 5);
    return { sugestoes, observacoes, tokens };
}

export async function descreverItem(entrada: { comentario: string; servico?: string; unidade?: string; contexto: ContextoObra }, fetcher?: typeof fetch) {
    const comentario = String(entrada.comentario || '').trim();
    if (comentario.length < 3) throw new Error('Escreva seus comentários sobre o item (o que será feito, medidas, materiais)');
    const { dados, tokens } = await chamar({
        name: 'registrar_descricao',
        description: 'Registra o serviço e a descrição técnica do item.',
        input_schema: {
            type: 'object',
            properties: {
                servico: { type: 'string', description: 'Título curto do serviço' },
                descricao: { type: 'string', description: 'Descrição técnica objetiva no padrão LS' },
                unidade: { type: 'string', description: 'Unidade sugerida (m, m², m³, un, vb, cj, kg...)' },
            },
            required: ['servico', 'descricao'],
        },
    }, `Escreva o serviço e a descrição de um item de orçamento a partir dos comentários de quem orça.\n\nContexto: ${contextoTexto(entrada.contexto)}\nServiço já informado: ${entrada.servico || '—'}\nUnidade já informada: ${entrada.unidade || '—'}\nComentários: ${comentario}`, fetcher);
    return {
        servico: String(dados?.servico || entrada.servico || '').trim(),
        descricao: String(dados?.descricao || '').trim(),
        unidade: String(dados?.unidade || entrada.unidade || '').trim(),
        tokens,
    };
}
