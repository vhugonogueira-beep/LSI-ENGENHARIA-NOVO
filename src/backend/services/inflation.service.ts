import { prisma } from '../server';

export class InflationService {

    /**
     * Calculates the compounded adjustment factor between two dates for a specific index.
     * Assumes factors in DB are stored as multipliers (e.g., 1.0042 for 0.42% inflation that month).
     */
    static async getFatorAcumulado(tenantId: string, indexName: string, dataReferencia: Date, dataAlvo: Date) {
        if (dataReferencia >= dataAlvo) return 1.0;

        const refYM = dataReferencia.toISOString().slice(0, 7); // YYYY-MM
        const alvoYM = dataAlvo.toISOString().slice(0, 7);

        const indices = await prisma.inflationIndex.findMany({
            where: {
                tenant_id: tenantId,
                index_name: indexName,
                year_month: {
                    gt: refYM,
                    lte: alvoYM
                }
            }
        });

        if (indices.length === 0) {
            // Fallback to Tenant default annual rate if no indices found
            const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id: tenantId } });
            if (settings && settings.default_inflation_rate_annual > 0) {
                const yearsDiff = (dataAlvo.getTime() - dataReferencia.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                return Math.pow(1 + settings.default_inflation_rate_annual, yearsDiff);
            }
            return 1.0;
        }

        // Compound all the found monthly factors
        return indices.reduce((acc, current) => acc * current.factor, 1.0);
    }

    /**
     * Adjusts a value for inflation based on Tenant settings.
     */
    static async ajustarValor(tenantId: string, valor: number, dataReferencia: Date, dataAlvo: Date = new Date(), indexName: string = 'IPCA') {
        const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id: tenantId } });

        if (!settings?.aplicar_correcao_automatica) {
            return valor;
        }

        const fator = await this.getFatorAcumulado(tenantId, indexName, dataReferencia, dataAlvo);
        return valor * fator;
    }

    /**
     * Helper to import or register a bunch of monthly indices
     */
    static async registerIndices(tenantId: string, indexName: string, indices: { yearMonth: string, factor: number }[]) {
        const createData = indices.map(i => ({
            tenant_id: tenantId,
            index_name: indexName,
            year_month: i.yearMonth,
            factor: i.factor
        }));

        // SQLite doesn't have createMany skipDuplicates, so we can do a transaction or just loop
        for (const data of createData) {
            const existing = await prisma.inflationIndex.findFirst({
                where: { tenant_id: tenantId, index_name: indexName, year_month: data.year_month }
            });
            if (existing) {
                await prisma.inflationIndex.update({
                    where: { id: existing.id },
                    data: { factor: data.factor }
                });
            } else {
                await prisma.inflationIndex.create({ data });
            }
        }
        return { success: true, count: indices.length };
    }
}
