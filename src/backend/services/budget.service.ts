import { PrismaClient, BudgetItem, Budget } from '@prisma/client';
import { prisma } from '../server';

export interface BudgetCalculationResult {
    totalGeral: number;
    subtotalsPorBloco: Record<string, number>;
    itensDelineados: BudgetItem[];
}

export class BudgetService {
    /**
     * Recalcula os totais de um orçamento com base em seus itens ativos.
     */
    static calcularOrcamento(itens: BudgetItem[]): BudgetCalculationResult {
        let totalGeral = 0;
        const subtotalsPorBloco: Record<string, number> = {};

        const itensDelineados = itens.map(item => {
            // Regras: total_linha = quantidade * valor_unitario * (1 + bdi_percent/100)
            // Arredondamento para 2 casas decimais
            let totalLinha = 0;

            if (item.ativo && item.quantidade >= 0 && item.valor_unitario >= 0) {
                // Assume isHeader if it has no children logic? No, just keep it simple: if unitario > 0, it counts.
                const bdiMultiplier = 1 + (Math.max(0, item.bdi_percent) / 100);
                totalLinha = item.quantidade * item.valor_unitario * bdiMultiplier;
                totalLinha = Math.round(totalLinha * 100) / 100;
            }

            // Atualiza o subtotal do bloco
            if (item.ativo) {
                if (!subtotalsPorBloco[item.bloco]) {
                    subtotalsPorBloco[item.bloco] = 0;
                }
                subtotalsPorBloco[item.bloco] += totalLinha;
                // garantindo round no subtotal
                subtotalsPorBloco[item.bloco] = Math.round(subtotalsPorBloco[item.bloco] * 100) / 100;
            }

            return {
                ...item,
                total_linha: totalLinha
            };
        });

        // Calcula total geral
        totalGeral = Object.values(subtotalsPorBloco).reduce((acc, curr) => acc + curr, 0);
        totalGeral = Math.round(totalGeral * 100) / 100;

        return {
            totalGeral,
            subtotalsPorBloco,
            itensDelineados
        };
    }

    // Define CRUD operations using Prisma
    static async getBudgetsByTenant(tenantId: string) {
        return prisma.budget.findMany({
            where: { tenant_id: tenantId },
            include: {
                contratante: true,
                site: true,
            },
            orderBy: { updated_at: 'desc' }
        });
    }

    static async getBudgetById(id: string) {
        return prisma.budget.findUnique({
            where: { id },
            include: {
                contratante: true,
                site: true,
                items: {
                    orderBy: { ordem: 'asc' }
                },
                versions: true
            }
        });
    }

    static async createBudget(data: any) {
        return prisma.budget.create({
            data
        });
    }

    static async updateBudgetHeader(id: string, data: Partial<Budget>) {
        return prisma.budget.update({
            where: { id },
            data
        });
    }

    static async updateBudgetItems(budgetId: string, versaoAtual: number, items: BudgetItem[]) {
        // 1. Calculate totals
        const calc = this.calcularOrcamento(items);

        // 2. Perform DB updates in transaction
        const updateOperations = calc.itensDelineados.map(item =>
            prisma.budgetItem.update({
                where: { id: item.id },
                data: {
                    quantidade: item.quantidade,
                    valor_unitario: item.valor_unitario,
                    bdi_percent: item.bdi_percent,
                    total_linha: item.total_linha,
                    ativo: item.ativo,
                    titulo: item.titulo,
                    descricao: item.descricao,
                }
            })
        );

        await prisma.$transaction(updateOperations);

        // Update budget updated_at
        await prisma.budget.update({
            where: { id: budgetId },
            data: { updated_at: new Date() }
        });

        return this.getBudgetById(budgetId);
    }

    static async createVersion(budgetId: string, userId?: string) {
        const budget = await this.getBudgetById(budgetId);
        if (!budget) throw new Error("Budget not found");

        const newVersionNum = budget.versao_atual + 1;
        const calc = this.calcularOrcamento(budget.items);

        // Create a snapshot string
        const snapshotJson = JSON.stringify(budget);

        // Database transaction to bump version and create record
        return prisma.$transaction([
            prisma.budgetVersion.create({
                data: {
                    budget_id: budgetId,
                    versao: newVersionNum,
                    snapshot_json: snapshotJson,
                    total_geral: calc.totalGeral,
                    criado_por: userId
                }
            }),
            prisma.budget.update({
                where: { id: budgetId },
                data: { versao_atual: newVersionNum }
            })
        ]);
    }
}
