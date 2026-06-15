import * as fuzzball from 'fuzzball';
import { prisma } from '../server';

export class PriceEngineService {

    static normalizarDescricao(texto: string): string {
        if (!texto) return '';
        return texto
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^\w\s]|_/g, "") // Remove punctuation
            .replace(/\s+/g, " ") // Remove extra spaces
            .trim();
    }

    static async suggestItems(tenantId: string, query: string, regiao: string, limit: number = 5) {
        if (!query) return [];
        const normalizedQuery = this.normalizarDescricao(query);

        // Get all active catalog items from this tenant
        // Later we can filter by 'origem_importacao_id' or 'regiao' if the DB size justifies it
        const allItems = await prisma.catalogService.findMany({
            where: { tenant_id: tenantId, ativo: true },
        });

        // Score them
        const scored = allItems.map(item => {
            // Use pre-computed normalized description if available, otherwise compute on the fly
            const targetNorm = item.descricao_item_normalizada || this.normalizarDescricao(item.titulo + ' ' + (item.descricao_padrao || ''));

            // fuzzball ratio: standard levenshtein percentage
            // token_sort_ratio: ignores word order
            const score = fuzzball.token_sort_ratio(normalizedQuery, targetNorm);

            return {
                catalog_item_id: item.id,
                codigo: item.codigo,
                descricao_original: item.titulo,
                descricao_normalizada: targetNorm,
                valor_base: item.valor_base,
                unidade_padrao: item.unidade_padrao,
                categoria: item.categoria,
                score_fuzzy: score,
                score_embedding: null, // Placeholder for future embedding implementation
                match_type: score >= 85 ? 'STRONG_MATCH' : (score >= 70 ? 'POSSIBLE_MATCH' : 'WEAK_MATCH')
            };
        });

        // Sort by score descending and filter only possible or strong matches
        const matches = scored
            .filter(s => s.score_fuzzy >= 70)
            .sort((a, b) => b.score_fuzzy - a.score_fuzzy)
            .slice(0, limit);

        // If we want regional stats immediately, we can join PriceStats here
        const enrichedMatches = await Promise.all(matches.map(async (m) => {
            // Find stats for this specific item and region
            const stats = await prisma.priceStats.findFirst({
                where: {
                    tenant_id: tenantId,
                    regiao: regiao,
                    item_key: m.catalog_item_id // Assuming item_key binds to CatalogService ID
                }
            });

            return {
                ...m,
                stats_regiao: stats ? {
                    min: stats.min,
                    max: stats.max,
                    mean: stats.mean,
                    median: stats.median,
                    p25: stats.p25,
                    p75: stats.p75,
                    count: stats.count
                } : null
            };
        }));

        return enrichedMatches;
    }
}
