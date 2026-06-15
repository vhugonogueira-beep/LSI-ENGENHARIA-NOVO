import { prisma } from '../server';

export class BdiService {

    /**
     * Finds the BDI suggestion for a given category and region based on the tenant's strategy.
     */
    static async suggestBdi(tenantId: string, categoria: string, regiao: string) {
        const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id: tenantId } });

        // Defaults if no specific rules are found or applied
        const defaultResponse = {
            sugerido: 0,
            min: 0,
            max: 0,
            strategy: 'INATIVA'
        };

        if (!settings || !settings.aplicar_bdi_automatico) {
            return defaultResponse;
        }

        const rule = await prisma.bdiRules.findFirst({
            where: {
                tenant_id: tenantId,
                regiao: regiao,
                categoria: categoria,
                active: true
            }
        });

        if (settings.bdi_strategy === 'REGRA_FIXA' && rule) {
            return {
                sugerido: rule.bdi_default_percent,
                min: rule.bdi_default_percent,
                max: rule.bdi_default_percent,
                strategy: 'REGRA_FIXA',
                mensagem: `BDI Fixo regional de ${rule.bdi_default_percent}% (Região: ${regiao})`
            };
        }

        if (settings.bdi_strategy === 'FAIXA_SUGERIDA' && rule) {
            return {
                sugerido: rule.bdi_default_percent,
                min: rule.bdi_min_percent,
                max: rule.bdi_max_percent,
                strategy: 'FAIXA_SUGERIDA',
                mensagem: `Faixa sugerida entre ${rule.bdi_min_percent}% e ${rule.bdi_max_percent}% (Região: ${regiao})`
            };
        }

        if (settings.bdi_strategy === 'HISTORICO') {
            // Calculate historical median BDI for this category and region based on Budgets
            const historicalItems = await prisma.budgetItem.findMany({
                where: {
                    ativo: true,
                    budget: {
                        tenant_id: tenantId,
                        site: { uf: regiao }
                    },
                    // Assuming we can map category somehow, but BudgetItem doesn't have it natively unless stored in DB
                    // It only has 'bloco' or we must join catalog. Since we don't have it easily mapped on BudgetItem,
                    // we might just return the rule default as fallback
                },
                select: { bdi_percent: true }
            });

            if (historicalItems.length > 0) {
                const bdis = historicalItems.map(h => h.bdi_percent).filter(b => b > 0).sort((a, b) => a - b);
                if (bdis.length > 0) {
                    const median = bdis[Math.floor(bdis.length / 2)];
                    return {
                        sugerido: median,
                        min: rule ? rule.bdi_min_percent : 0,
                        max: rule ? rule.bdi_max_percent : 100,
                        strategy: 'HISTORICO',
                        mensagem: `Mediana histórica regional de ${median}%`
                    };
                }
            }

            // Fallback to Rule if history is empty
            if (rule) {
                return {
                    sugerido: rule.bdi_default_percent,
                    min: rule.bdi_min_percent,
                    max: rule.bdi_max_percent,
                    strategy: 'HISTORICO_FALLBACK',
                    mensagem: `Sem histórico. Usando regra de ${rule.bdi_default_percent}%`
                };
            }
        }

        return defaultResponse;
    }

    /**
     * Create or update a BDI Rule
     */
    static async upsertRule(tenantId: string, data: any) {
        const existing = await prisma.bdiRules.findFirst({
            where: { tenant_id: tenantId, regiao: data.regiao, categoria: data.categoria }
        });
        if (existing) {
            return prisma.bdiRules.update({ where: { id: existing.id }, data });
        } else {
            return prisma.bdiRules.create({ data: { ...data, tenant_id: tenantId } });
        }
    }
}
