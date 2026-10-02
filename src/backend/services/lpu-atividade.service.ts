// Qual LPU uma atividade usa — decidido aqui, uma vez, para todas as telas.
//
// As bases se organizam por ÁREA (PriceBook.tipo: IMPLANTACAO | OPERACAO;
// null = serve às duas) e por CLIENTE (contratante_id; null = genérica). Para
// cada atividade são escolhidas duas:
//
//   preço ao cliente  origem PV_CLIENTE    — o que a LS cobra
//   custo             origem LPU_LS_OFFICE — o que a LS paga
//
// Ordem de preferência, a primeira que existir vence:
//   1. cliente da atividade (contratante)  + mesma área
//   2. cliente pelo Sharing da atividade   + mesma área
//   3. mesmo cliente, base sem área (serve às duas)
//   4. genérica (sem cliente) da mesma área
//   5. genérica sem área
// Dentro do mesmo degrau, a base marcada como padrão e depois a com mais
// itens com preço. A resposta diz qual degrau foi usado, para a tela explicar
// por que aquela base foi escolhida.

import { prisma } from '../server';

export type OrigemLpu = 'PV_CLIENTE' | 'LPU_LS_OFFICE';

export interface LpuEscolhida {
    id: string;
    nome: string;
    origem: string;
    tipo: string | null;
    cliente: string | null;
    padrao: boolean;
    motivo: string;
}

const AREA_LABEL: Record<string, string> = { IMPLANTACAO: 'Implantação', OPERACAO: 'Operação' };
const chave = (v?: string | null) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/** Contratantes que representam o cliente da atividade: o vínculo direto e o Sharing. */
async function clientesDaAtividade(tenantId: string, contratanteId: string | null, sharing: string | null) {
    const ids: { id: string; via: 'CONTRATANTE' | 'SHARING' }[] = [];
    if (contratanteId) ids.push({ id: contratanteId, via: 'CONTRATANTE' });
    if (sharing) {
        const todos = await prisma.contratante.findMany({ where: { tenant_id: tenantId, ativo: true }, select: { id: true, nome: true, sigla: true } });
        for (const c of todos) {
            if (ids.some(i => i.id === c.id)) continue;
            if (chave(c.nome) === chave(sharing) || (c.sigla && chave(c.sigla) === chave(sharing))) ids.push({ id: c.id, via: 'SHARING' });
        }
    }
    return ids;
}

export async function escolherLpu(
    atividade: { tenant_id: string; tipo_demanda: string; contratante_id: string | null; sharing: string | null },
    origem: OrigemLpu,
): Promise<LpuEscolhida | null> {
    const bases = await prisma.priceBook.findMany({
        where: { tenant_id: atividade.tenant_id, origem, status: 'ATIVA' },
        include: { contratante: { select: { nome: true } }, _count: { select: { items: true } } },
    });
    if (!bases.length) return null;

    const comPreco = new Map<string, number>();
    for (const b of bases) {
        comPreco.set(b.id, await prisma.priceBookItem.count({
            where: {
                pricebook_id: b.id, ativo: true,
                OR: [{ valor_unitario: { gt: 0 } }, { valor_venda: { gt: 0 } }, { custo_ls: { gt: 0 } }],
            },
        }));
    }
    const melhor = (lista: typeof bases) => lista.sort((a, b) =>
        Number(b.padrao) - Number(a.padrao) || (comPreco.get(b.id)! - comPreco.get(a.id)!))[0];

    const area = atividade.tipo_demanda;
    const nomeArea = AREA_LABEL[area] || area;
    const clientes = await clientesDaAtividade(atividade.tenant_id, atividade.contratante_id, atividade.sharing);

    const degraus: { filtro: (b: typeof bases[number]) => boolean; motivo: (b: typeof bases[number]) => string }[] = [];
    for (const c of clientes) {
        const via = c.via === 'CONTRATANTE' ? 'cliente da atividade' : 'Sharing da atividade';
        degraus.push({ filtro: b => b.contratante_id === c.id && b.tipo === area, motivo: b => `${via} (${b.contratante?.nome}) + ${nomeArea}` });
    }
    for (const c of clientes) {
        degraus.push({ filtro: b => b.contratante_id === c.id && !b.tipo, motivo: b => `cliente ${b.contratante?.nome}, base que serve às duas áreas` });
    }
    degraus.push({ filtro: b => !b.contratante_id && b.tipo === area, motivo: () => `genérica de ${nomeArea} — nenhuma base própria do cliente nesta área` });
    degraus.push({ filtro: b => !b.contratante_id && !b.tipo, motivo: () => 'genérica, serve às duas áreas' });

    for (const d of degraus) {
        const candidatas = bases.filter(d.filtro);
        if (!candidatas.length) continue;
        const b = melhor(candidatas);
        return {
            id: b.id, nome: b.nome_lpu, origem: b.origem, tipo: b.tipo,
            cliente: b.contratante?.nome || null, padrao: b.padrao,
            motivo: d.motivo(b) + (candidatas.length > 1 ? ` · ${candidatas.length} bases neste grupo, ${b.padrao ? 'usada a marcada como padrão' : 'usada a com mais preços'}` : ''),
        };
    }
    return null;
}

/** As duas bases da atividade: preço ao cliente e custo. */
export async function lpusDaAtividade(atividadeId: string) {
    const atividade = await prisma.atividade.findUnique({
        where: { id: atividadeId },
        select: { tenant_id: true, tipo_demanda: true, contratante_id: true, sharing: true },
    });
    if (!atividade) return null;
    const [precoCliente, custo] = await Promise.all([
        escolherLpu(atividade, 'PV_CLIENTE'),
        escolherLpu(atividade, 'LPU_LS_OFFICE'),
    ]);
    return { precoCliente, custo };
}

/**
 * Marca uma base como padrão do seu grupo (mesma origem + área + cliente) e
 * desmarca as outras — só pode haver uma padrão por grupo.
 */
export async function marcarPadrao(id: string) {
    const b = await prisma.priceBook.findUnique({ where: { id } });
    if (!b) throw new Error('Base não encontrada');
    await prisma.$transaction([
        prisma.priceBook.updateMany({
            where: { tenant_id: b.tenant_id, origem: b.origem, tipo: b.tipo, contratante_id: b.contratante_id, id: { not: id } },
            data: { padrao: false },
        }),
        prisma.priceBook.update({ where: { id }, data: { padrao: true } }),
    ]);
}
