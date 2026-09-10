// Ponte entre a base "PV Padrão" (tabela PriceBook, editada em Bases/LPUs) e a
// PV que aparece dentro da Atividade.
//
// A base é a fonte da verdade para estrutura E preço. O catálogo fixo do código
// (HIGHLINE_PV_CATALOG) fica como reserva: ele garante que a PV abra numa
// instalação nova, antes de a base existir, e mantém o mapa de linhas do template
// .xlsm usado na exportação.

import { prisma } from '../server';

export interface LinhaPvCliente {
    itemId: string;
    /** Preço que a LS Office cobra do cliente. Zero = ainda sem referência. */
    valor: number;
    descricao: string;
    categoria: string;
    unidade: string;
    observacoes: string | null;
}

export interface PvDoCliente {
    baseId: string | null;
    baseNome: string | null;
    porLinha: Map<number, LinhaPvCliente>;
}

/**
 * Carrega a PV do cliente indexada pela linha do template — a identidade estável,
 * já que a PV original repete alguns códigos.
 *
 * Havendo mais de uma base de cliente ativa, a mais recente por item vence. Buscar
 * pelos ITENS (e não "a base mais recente") evita que uma base nova e vazia
 * roube a seleção e deixe a Atividade sem preço nenhum.
 */
export async function carregarPvDoCliente(): Promise<PvDoCliente> {
    const itens = await prisma.priceBookItem.findMany({
        where: {
            ativo: true,
            highline_template_row: { not: null },
            pricebook: { origem: 'PV_CLIENTE', status: 'ATIVA' },
        },
        orderBy: { updated_at: 'asc' }, // o mais recente sobrescreve
        include: { pricebook: { select: { id: true, nome_lpu: true } } },
    });

    const porLinha = new Map<number, LinhaPvCliente>();
    let baseId: string | null = null;
    let baseNome: string | null = null;

    for (const i of itens) {
        porLinha.set(i.highline_template_row!, {
            itemId: i.id,
            valor: i.valor_unitario,
            descricao: i.descricao,
            categoria: i.subtipo || '',
            unidade: i.unidade,
            observacoes: i.observacoes,
        });
        baseId = i.pricebook.id;
        baseNome = i.pricebook.nome_lpu;
    }

    return { baseId, baseNome, porLinha };
}
