import { prisma } from '../server';
import { PriceEngineService } from './price-engine.service';
import * as fuzzball from 'fuzzball';

export interface PriceBookFilters {
    supplier_id?: string;
    regiao?: string;
    status?: string;
}

export interface PriceBookItemFilters {
    tipo_escopo?: string;
    search?: string;
    unidade?: string;
    page?: number;
    limit?: number;
}

export class PriceBookService {

    // ─── PriceBook CRUD ──────────────────────────────────────────────

    static async getPriceBooks(tenantId: string, filters: PriceBookFilters = {}) {
        const where: any = { tenant_id: tenantId };
        if (filters.supplier_id) where.supplier_id = filters.supplier_id;
        if (filters.regiao) where.regiao = filters.regiao;
        if (filters.status) where.status = filters.status;

        return prisma.priceBook.findMany({
            where,
            include: {
                supplier: { select: { id: true, nome: true, logo_url: true } },
                _count: { select: { items: true } }
            },
            orderBy: { created_at: 'desc' }
        });
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
        supplier_id: string;
        nome_lpu: string;
        regiao: string;
        data_inicio_vigencia?: Date | string;
        data_fim_vigencia?: Date | string;
        moeda?: string;
    }) {
        return prisma.priceBook.create({ data });
    }

    static async updatePriceBook(id: string, data: any) {
        return prisma.priceBook.update({
            where: { id },
            data: { ...data, updated_at: new Date() }
        });
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

        const [items, total] = await Promise.all([
            prisma.priceBookItem.findMany({
                where,
                orderBy: [{ tipo_escopo: 'asc' }, { descricao: 'asc' }],
                skip,
                take: limit,
            }),
            prisma.priceBookItem.count({ where })
        ]);

        return { items, total, page, limit };
    }

    static async createPriceBookItem(data: {
        tenant_id: string;
        pricebook_id: string;
        supplier_id: string;
        regiao: string;
        tipo_escopo: string;
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
            data: { ...data, descricao_normalizada }
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
