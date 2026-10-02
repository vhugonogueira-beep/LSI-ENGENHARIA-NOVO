import { prisma } from '../server';
import { PriceEngineService } from './price-engine.service';
import * as fuzzball from 'fuzzball';
import { marcarPadrao } from './lpu-atividade.service';

export interface PriceBookFilters {
    supplier_id?: string;
    regiao?: string;
    status?: string;
}

export interface PriceBookItemFilters {
    tipo_escopo?: string;
    search?: string;
    unidade?: string;
    comDerivados?: boolean;
    page?: number;
    limit?: number;
}

export class PriceBookService {

    // ─── PriceBook CRUD ──────────────────────────────────────────────

    static async getPriceBooks(tenantId: string, filters: PriceBookFilters = {}) {
        const where: any = { tenant_id: tenantId };
        if (filters.supplier_id) where.supplier_id = filters.supplier_id;
        if (filters.regiao) where.regiao = filters.regiao;
        // Base arquivada (excluída mas ainda referenciada por orçamento) some das
        // listas; só aparece pedindo ?status=ARQUIVADA.
        where.status = filters.status || { not: 'ARQUIVADA' };

        return prisma.priceBook.findMany({
            where,
            include: {
                supplier: { select: { id: true, nome: true, logo_url: true } },
                contratante: { select: { id: true, nome: true, logo_url: true } },
                _count: { select: { items: true } }
            },
            orderBy: [{ origem: 'asc' }, { nome_lpu: 'asc' }]
        });
    }

    /**
     * Exclui uma base. Se algum orçamento ainda aponta para ela — como base do
     * orçamento ou por item copiado dela — ou se outra base tem itens
     * vinculados aos dela (PV ↔ LPU), a base é ARQUIVADA: some das listas e os
     * orçamentos antigos continuam íntegros. Sem nenhuma referência, sai de vez.
     */
    static async excluirPriceBook(id: string) {
        const base = await prisma.priceBook.findUnique({ where: { id }, select: { id: true, nome_lpu: true, status: true } });
        if (!base) throw new Error('Base não encontrada');
        const itemIds = (await prisma.priceBookItem.findMany({ where: { pricebook_id: id }, select: { id: true } })).map(i => i.id);
        const [orcamentos, itensEmOrcamento, vinculosExternos] = await Promise.all([
            prisma.budget.count({ where: { pricebook_id: id } }),
            itemIds.length ? prisma.budgetItem.count({ where: { source_pricebook_item_id: { in: itemIds } } }) : 0,
            itemIds.length ? prisma.priceBookItem.count({ where: { pv_item_id: { in: itemIds }, pricebook_id: { not: id } } }) : 0,
        ]);

        if (orcamentos || itensEmOrcamento || vinculosExternos) {
            await prisma.priceBook.update({ where: { id }, data: { status: 'ARQUIVADA' } });
            const motivos = [
                orcamentos && `${orcamentos} orçamento(s) usam esta base`,
                itensEmOrcamento && `${itensEmOrcamento} item(ns) de orçamento vieram dela`,
                vinculosExternos && `${vinculosExternos} item(ns) de outra base estão vinculados a ela`,
            ].filter(Boolean);
            return { modo: 'ARQUIVADA' as const, nome: base.nome_lpu, itens: itemIds.length, motivos };
        }

        await prisma.$transaction([
            // Vínculos internos (item → item da mesma base) primeiro, senão a FK trava.
            prisma.priceBookItem.updateMany({ where: { pricebook_id: id }, data: { pv_item_id: null } }),
            prisma.importBatch.updateMany({ where: { pricebook_id: id }, data: { pricebook_id: null } }),
            prisma.priceBookItem.deleteMany({ where: { pricebook_id: id } }),
            prisma.priceBook.delete({ where: { id } }),
        ]);
        return { modo: 'EXCLUIDA' as const, nome: base.nome_lpu, itens: itemIds.length, motivos: [] as string[] };
    }

    static async getPriceBookById(id: string) {
        return prisma.priceBook.findUnique({
            where: { id },
            include: {
                supplier: true,
                _count: { select: { items: true } }
            }
        });
    }

    static async createPriceBook(data: {
        tenant_id: string;
        nome_lpu: string;
        regiao: string;
        origem?: string;
        supplier_id?: string | null;
        contratante_id?: string | null;
        tipo?: string | null;
        versao?: string;
        data_inicio_vigencia?: Date | string;
        data_fim_vigencia?: Date | string;
        moeda?: string;
    }) {
        return prisma.priceBook.create({ data: data as any });
    }

    static async updatePriceBook(id: string, data: any) {
        // Só o que a tela de LPUs edita; o resto (tenant, status) tem rota própria.
        const EDITAVEIS = ['nome_lpu', 'versao', 'regiao', 'tipo', 'contratante_id', 'origem', 'padrao', 'data_inicio_vigencia', 'data_fim_vigencia'];
        const dados: any = {};
        for (const k of EDITAVEIS) if (data[k] !== undefined) dados[k] = data[k];
        if (dados.tipo !== undefined && dados.tipo !== null && !['IMPLANTACAO', 'OPERACAO'].includes(dados.tipo)) {
            throw new Error('Área inválida: use IMPLANTACAO, OPERACAO ou vazio (serve às duas)');
        }
        if (dados.tipo === '') dados.tipo = null;
        if (dados.contratante_id === '') dados.contratante_id = null;
        if (dados.padrao !== undefined) dados.padrao = Boolean(dados.padrao);

        const salvo = await prisma.priceBook.update({ where: { id }, data: { ...dados, updated_at: new Date() } });
        // Padrão é único por área + cliente + origem: mudar de grupo ou marcar
        // agora desmarca a outra que ocupava o lugar.
        if (salvo.padrao) await marcarPadrao(id);
        return prisma.priceBook.findUnique({ where: { id }, include: { contratante: { select: { id: true, nome: true } } } });
    }

    // ─── PriceBookItem CRUD ──────────────────────────────────────────

    static async getPriceBookItems(pricebookId: string, filters: PriceBookItemFilters = {}) {
        const page = filters.page || 1;
        const limit = filters.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = { pricebook_id: pricebookId, ativo: true };
        if (filters.tipo_escopo) where.tipo_escopo = filters.tipo_escopo;
        if (filters.unidade) where.unidade = filters.unidade;
        if (filters.search) {
            where.descricao_normalizada = {
                contains: PriceEngineService.normalizarDescricao(filters.search)
            };
        }

        // comDerivados: traz, para cada item da PV, o preço de cliente e o custo
        // LSOC ligados a ele — é o que deixa margem visível sem misturar as bases.
        const include = filters.comDerivados
            ? {
                derivados: {
                    where: { ativo: true },
                    select: {
                        id: true, valor_unitario: true, custo_ls: true,
                        valor_venda: true, fonte: true, uf: true,
                        observacoes: true, data_referencia: true,
                        pricebook: { select: { id: true, nome_lpu: true, origem: true } },
                    },
                },
            }
            : undefined;

        const [items, total] = await Promise.all([
            prisma.priceBookItem.findMany({
                where,
                orderBy: [{ highline_template_row: 'asc' }, { descricao: 'asc' }],
                skip,
                take: limit,
                ...(include ? { include } : {}),
            }),
            prisma.priceBookItem.count({ where })
        ]);

        return { items, total, page, limit };
    }

    static async createPriceBookItem(data: {
        tenant_id: string;
        pricebook_id: string;
        supplier_id?: string | null;
        regiao: string;
        tipo_escopo: string;
        tipo_custo?: string;
        obrigatorio?: boolean;
        subtipo?: string;
        codigo_item?: string;
        descricao: string;
        unidade: string;
        valor_unitario: number;
        observacoes?: string;
        detalhamento?: string;
        data_referencia?: Date | string;
        origem_importacao_id?: string;
    }) {
        const descricao_normalizada = PriceEngineService.normalizarDescricao(data.descricao);
        return prisma.priceBookItem.create({
            data: { ...data, descricao_normalizada } as any
        });
    }

    static async createPriceBookItemsBatch(items: any[]) {
        // Normalizar todas as descrições
        const normalizedItems = items.map(item => ({
            ...item,
            descricao_normalizada: PriceEngineService.normalizarDescricao(item.descricao)
        }));

        return prisma.priceBookItem.createMany({ data: normalizedItems });
    }

    static async updatePriceBookItem(id: string, data: any) {
        if (data.descricao) {
            data.descricao_normalizada = PriceEngineService.normalizarDescricao(data.descricao);
        }
        return prisma.priceBookItem.update({
            where: { id },
            data: { ...data, updated_at: new Date() }
        });
    }

    static async deletePriceBookItem(id: string) {
        return prisma.priceBookItem.update({
            where: { id },
            data: { ativo: false, updated_at: new Date() }
        });
    }

    // ─── Price Lookup (para auto-fill no Budget Editor) ─────────────

    static async lookupPrice(
        tenantId: string,
        supplierId: string | undefined,
        regiao: string,
        descricao: string,
        unidade?: string,
        limit = 5
    ) {
        if (!descricao) return [];

        const normalizedQuery = PriceEngineService.normalizarDescricao(descricao);

        // Build the where clause
        const where: any = {
            tenant_id: tenantId,
            ativo: true,
            pricebook: { status: 'ATIVA' }
        };
        if (supplierId) where.supplier_id = supplierId;
        if (regiao) where.regiao = regiao;

        const allItems = await prisma.priceBookItem.findMany({
            where,
            include: {
                supplier: { select: { nome: true } },
                pricebook: { select: { nome_lpu: true } }
            },
            take: 500 // Performance cap
        });

        // Fuzzy match
        const scored = allItems.map(item => {
            const score = fuzzball.token_sort_ratio(normalizedQuery, item.descricao_normalizada);
            return { ...item, score };
        });

        return scored
            .filter(s => s.score >= 60)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => ({
                pricebook_item_id: s.id,
                descricao: s.descricao,
                unidade: s.unidade,
                valor_unitario: s.valor_unitario,
                tipo_escopo: s.tipo_escopo,
                supplier_nome: (s as any).supplier?.nome,
                pricebook_nome: (s as any).pricebook?.nome_lpu,
                score: s.score
            }));
    }
}
