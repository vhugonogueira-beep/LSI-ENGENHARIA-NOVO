import { prisma } from '../server';
import { InflationService } from './inflation.service';

export class AnalyticsService {

    // Calculates p25, median (p50), and p75 from a sorted array of numbers
    private static calculatePercentiles(values: number[]) {
        if (values.length === 0) return { p25: 0, median: 0, p75: 0 };
        values.sort((a, b) => a - b);

        const q1Src = (values.length - 1) * 0.25;
        const q2Src = (values.length - 1) * 0.5;
        const q3Src = (values.length - 1) * 0.75;

        const lerp = (idx: number) => {
            const base = Math.floor(idx);
            const rest = idx - base;
            if (values[base + 1] !== undefined) {
                return values[base] + rest * (values[base + 1] - values[base]);
            } else {
                return values[base];
            }
        };

        return {
            p25: lerp(q1Src),
            median: lerp(q2Src),
            p75: lerp(q3Src)
        };
    }

    private static calculateStdDev(values: number[], mean: number) {
        if (values.length < 2) return 0;
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    /**
     * Compute and update the PriceStats for a given item across a region based on historical Budgets
     */
    static async computeStatsForCatalogItem(tenantId: string, catalogItemId: string, regiao: string) {
        const catalogItem = await prisma.catalogService.findUnique({ where: { id: catalogItemId } });
        if (!catalogItem) throw new Error("Catalog item not found");

        // Find all budget items that match this catalog item's code or title, and are in the given region
        // Since regiao might map to Site.uf, we'll try to find budgets where site.uf === regiao
        const historicalItems = await prisma.budgetItem.findMany({
            where: {
                budget: {
                    tenant_id: tenantId,
                    site: {
                        uf: regiao // Assuming regiao is UF for now
                    }
                },
                OR: [
                    { codigo_item: catalogItem.codigo },
                    { titulo: catalogItem.titulo }
                ]
            },
            select: {
                valor_unitario: true,
                budget: {
                    select: { created_at: true }
                }
            }
        });

        const rawValues = historicalItems.map(i => i.valor_unitario);
        const count = rawValues.length;

        // If we have no historical data, fallback to base value
        if (count === 0) {
            return {
                tenant_id: tenantId,
                item_key: catalogItemId,
                regiao: regiao,
                count: 0,
                min: catalogItem.valor_base,
                max: catalogItem.valor_base,
                mean: catalogItem.valor_base,
                median: catalogItem.valor_base,
                p25: catalogItem.valor_base,
                p75: catalogItem.valor_base,
                stddev: 0,
            };
        }

        const min = Math.min(...rawValues);
        const max = Math.max(...rawValues);
        const mean = rawValues.reduce((a, b) => a + b, 0) / count;
        const { p25, median, p75 } = this.calculatePercentiles([...rawValues]);
        const stddev = this.calculateStdDev(rawValues, mean);

        const statsData = {
            count, min, max, mean, median, p25, p75, stddev
        };

        const existingStats = await prisma.priceStats.findFirst({
            where: { tenant_id: tenantId, item_key: catalogItemId, regiao: regiao }
        });

        if (existingStats) {
            return prisma.priceStats.update({
                where: { id: existingStats.id },
                data: statsData
            });
        } else {
            return prisma.priceStats.create({
                data: {
                    tenant_id: tenantId,
                    item_key: catalogItemId,
                    regiao: regiao,
                    ...statsData
                }
            });
        }
    }

    /**
     * Get the dispersion dataset (stats + points) for the graphic
     */
    static async getDispersion(tenantId: string, itemKey: string, regiao: string, mode: string = 'ORIGINAL', targetDateStr?: string) {
        // Try to get stats
        let stats = await prisma.priceStats.findFirst({
            where: { tenant_id: tenantId, item_key: itemKey, regiao: regiao }
        });

        if (!stats) {
            // Attempt auto compute if possible
            try {
                stats = await this.computeStatsForCatalogItem(tenantId, itemKey, regiao) as any;
            } catch (e) {
                // Ignore
            }
        }

        // Fetch raw points for the scatter plot
        const catalogItem = await prisma.catalogService.findUnique({ where: { id: itemKey } });
        let rawPoints: any[] = [];

        if (catalogItem) {
            const historicalItems = await prisma.budgetItem.findMany({
                where: {
                    budget: { tenant_id: tenantId, site: { uf: regiao } },
                    OR: [
                        { codigo_item: catalogItem.codigo },
                        { titulo: catalogItem.titulo }
                    ]
                },
                select: {
                    valor_unitario: true,
                    budget: { select: { created_at: true, site: { select: { id_site: true } } } }
                },
                take: 100, // Limit for UI performance
                orderBy: { budget: { created_at: 'desc' } }
            });

            const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();

            rawPoints = await Promise.all(historicalItems.map(async h => {
                let val = h.valor_unitario;
                if (mode === 'CORRIGIDO') {
                    // Adjust inflation using IPCA default for now
                    val = await InflationService.ajustarValor(tenantId, val, h.budget.created_at, targetDate, 'IPCA');
                }
                return {
                    date: h.budget.created_at.toISOString().split('T')[0],
                    value: val,
                    site: h.budget.site.id_site
                };
            }));
        }

        // Recompute stats inline if in CORRIGIDO mode to reflect adjusted values
        if (mode === 'CORRIGIDO' && rawPoints.length > 0) {
            const vals = rawPoints.map(p => p.value);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const { p25, median, p75 } = this.calculatePercentiles([...vals]);
            const stddev = this.calculateStdDev(vals, mean);

            stats = {
                ...stats,
                min, max, mean, median, p25, p75, stddev
            } as any;
        }

        return {
            stats: stats || null,
            dataset: rawPoints
        };
    }
}
