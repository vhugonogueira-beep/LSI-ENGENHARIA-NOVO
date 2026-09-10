import { PrismaClient, BudgetItem, Budget } from '@prisma/client';
import { prisma } from '../server';
import { carregarPvDoCliente } from './pv-cliente.service';
import { HIGHLINE_PV_CATALOG, HIGHLINE_PV_QUANTITY_RULES } from '../data/highline-pv-catalog';

export interface BudgetPricingInput {
    quantidade: number;
    valor_unitario: number;
    bdi_percent: number;
    desconto_interno_percent?: number | null;
    ativo?: boolean;
}

function roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcularValorUnitarioFinal(item: BudgetPricingInput): number {
    const valorUnitario = Number(item.valor_unitario);
    const bdiPercent = Number(item.bdi_percent);
    const descontoInternoPercent = Number(item.desconto_interno_percent ?? 0);
    const valid = [valorUnitario, bdiPercent, descontoInternoPercent].every(Number.isFinite)
        && valorUnitario >= 0
        && bdiPercent >= 0
        && descontoInternoPercent >= 0
        && descontoInternoPercent <= 100;
    if (!valid) return 0;

    const valorBaseLiquido = valorUnitario * (1 - descontoInternoPercent / 100);
    return roundCurrency(valorBaseLiquido * (1 + bdiPercent / 100));
}

export function calcularTotalLinha(item: BudgetPricingInput): number {
    const quantidade = Number(item.quantidade);
    if (item.ativo === false || !Number.isFinite(quantidade) || quantidade < 0) return 0;
    return roundCurrency(quantidade * calcularValorUnitarioFinal(item));
}

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
            // O desconto interno reduz a base antes do BDI. Arredonda primeiro
            // o valor unitario final e depois o total, como nos documentos exportados.
            const totalLinha = calcularTotalLinha(item);

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

    static async updateBudgetItems(
        budgetId: string,
        versaoAtual: number,
        items: any[],
        expectedUpdatedAt?: string,
        scope?: 'catalog' | 'internal' | 'all',
    ) {
        const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { atividade: true } });
        if (!budget) throw new Error('Orçamento não encontrado');
        if (!Array.isArray(items)) throw new Error('items deve ser uma lista');
        if (!Number.isInteger(versaoAtual) || versaoAtual !== budget.versao_atual) {
            throw new Error('O orçamento foi alterado em outra versão. Recarregue antes de salvar.');
        }

        const expectedDate = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
        if (expectedDate && Number.isNaN(expectedDate.getTime())) {
            throw new Error('Referência de atualização inválida');
        }

        const hasHighlineCatalogItems = items.some(item => item?.highline_template_row != null);
        if (hasHighlineCatalogItems && (!budget.atividade
            || budget.atividade.sharing.trim().toUpperCase() !== 'HIGHLINE'
            || budget.atividade.tipo_demanda !== 'IMPLANTACAO')) {
            throw new Error('O catálogo Highline só pode ser usado em Atividades de implantação Highline');
        }

        const catalogByRow = new Map(HIGHLINE_PV_CATALOG.map(item => [item.templateRow, item]));
        // A base "PV Padrão" manda na estrutura e no preço de referência; o catálogo
        // do código é reserva. É daqui que sai o vínculo com a LPU e a marca de
        // preço alterado — decididos no servidor, não confiados ao navegador.
        const pvCliente = hasHighlineCatalogItems ? await carregarPvDoCliente() : null;
        const seenRows = new Set<number>();
        const normalized = items.map((item, index) => {
            const quantidade = Number(item.quantidade || 0);
            const valorUnitario = Number(item.valor_unitario || 0);
            const bdiPercent = Number(item.bdi_percent || 0);
            const descontoInternoPercent = Number(item.desconto_interno_percent ?? 0);
            if (![quantidade, valorUnitario, bdiPercent].every(Number.isFinite) || quantidade < 0 || valorUnitario < 0 || bdiPercent < 0) {
                throw new Error(`Valores inválidos no item ${index + 1}`);
            }

            if (!Number.isFinite(descontoInternoPercent) || descontoInternoPercent < 0 || descontoInternoPercent > 100) {
                throw new Error(`Desconto interno inválido no item ${index + 1}: informe um percentual entre 0 e 100`);
            }

            const templateRow = item.highline_template_row == null ? null : Number(item.highline_template_row);
            const catalogItem = templateRow == null ? null : catalogByRow.get(templateRow);
            if (templateRow != null && !catalogItem) throw new Error(`Linha Highline inválida: ${templateRow}`);
            if (templateRow != null && seenRows.has(templateRow)) throw new Error(`Item Highline duplicado na linha ${templateRow}`);
            if (templateRow != null) seenRows.add(templateRow);

            const quantityRule = templateRow == null ? undefined : HIGHLINE_PV_QUANTITY_RULES[templateRow];
            if (quantityRule && quantidade > 0) {
                const invalidRange = quantidade < quantityRule.min || quantidade > quantityRule.max;
                const invalidInteger = quantityRule.integer && !Number.isInteger(quantidade);
                if (invalidRange || invalidInteger) {
                    const integerLabel = quantityRule.integer ? ' inteira' : '';
                    throw new Error(
                        `${catalogItem?.code}: a quantidade deve ser${integerLabel} entre ${quantityRule.min} e ${quantityRule.max}`,
                    );
                }
            }

            const ativo = item.ativo !== false;
            const totalLinha = calcularTotalLinha({
                quantidade,
                valor_unitario: valorUnitario,
                bdi_percent: bdiPercent,
                desconto_interno_percent: descontoInternoPercent,
                ativo,
            });
            const daBase = templateRow == null ? undefined : pvCliente?.porLinha.get(templateRow);
            // Alterado de propósito = o valor gravado difere do preço de referência da
            // base. Sem isso não dá para distinguir preço negociado de preço esquecido.
            const alteradoManualmente = !!daBase && daBase.valor > 0
                && Math.round(daBase.valor * 100) !== Math.round(valorUnitario * 100);

            return {
                budget_id: budgetId,
                versao: versaoAtual || budget.versao_atual,
                bloco: daBase?.categoria || catalogItem?.category || String(item.bloco || 'OUTROS'),
                codigo_item: catalogItem?.code || String(item.codigo_item || `ITEM-${index + 1}`),
                titulo: daBase?.descricao || catalogItem?.description || String(item.titulo || item.descricao || 'Item sem descrição'),
                descricao: item.descricao || null,
                unidade: daBase?.unidade || catalogItem?.unit || String(item.unidade || 'un'),
                quantidade,
                valor_unitario: valorUnitario,
                bdi_percent: bdiPercent,
                desconto_interno_percent: descontoInternoPercent,
                total_linha: totalLinha,
                source_pricebook_item_id: daBase?.itemId || item.source_pricebook_item_id || null,
                highline_template_row: templateRow,
                origem_item: catalogItem ? 'CATALOGO_HIGHLINE' : (item.origem_item || 'INTERNO'),
                user_overridden: catalogItem ? alteradoManualmente : Boolean(item.user_overridden),
                ativo,
                ordem: Number.isFinite(Number(item.ordem)) ? Number(item.ordem) : index,
            };
        });

        // Cada aba (PV Highline / Cotação LS) edita só o seu subconjunto de itens no mesmo
        // orçamento. `scope` diz qual subconjunto está sendo substituído — o outro é preservado
        // intacto, senão salvar de uma aba apagaria os itens da outra (Blueprint LSI, "mesmo
        // orçamento, itens compartilhados" entre PV Highline e Cotação LS).
        const effectiveScope: 'catalog' | 'internal' | 'all' = scope || 'all';
        if (effectiveScope === 'catalog' && normalized.some(item => item.highline_template_row == null)) {
            throw new Error('Este salvamento é restrito ao catálogo Highline (PV) — item sem linha de catálogo encontrado');
        }
        if (effectiveScope === 'internal' && normalized.some(item => item.highline_template_row != null)) {
            throw new Error('Este salvamento é restrito aos itens da Cotação LS — item de catálogo Highline encontrado');
        }

        const toReinsertRow = (item: BudgetItem, highlineTemplateRow: number | null) => ({
            budget_id: budgetId,
            versao: versaoAtual || budget.versao_atual,
            bloco: item.bloco,
            codigo_item: item.codigo_item,
            titulo: item.titulo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            bdi_percent: item.bdi_percent,
            desconto_interno_percent: Number((item as any).desconto_interno_percent ?? 0),
            total_linha: calcularTotalLinha({
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                bdi_percent: item.bdi_percent,
                desconto_interno_percent: Number((item as any).desconto_interno_percent ?? 0),
                ativo: item.ativo,
            }),
            source_pricebook_item_id: item.source_pricebook_item_id,
            highline_template_row: highlineTemplateRow,
            origem_item: item.origem_item,
            user_overridden: item.user_overridden,
            ativo: item.ativo,
            ordem: item.ordem,
        });

        const preservedInternalItems = effectiveScope === 'catalog'
            ? await prisma.budgetItem.findMany({ where: { budget_id: budgetId, highline_template_row: null } })
            : [];
        const catalogIdentity = new Set(normalized
            .filter(item => item.highline_template_row != null)
            .map(item => `${item.codigo_item.trim().toUpperCase()}|${item.titulo.trim().toUpperCase()}`));
        const preservedCatalogItems = effectiveScope === 'internal'
            ? await prisma.budgetItem.findMany({ where: { budget_id: budgetId, highline_template_row: { not: null } } })
            : [];

        const preservedData = [
            ...preservedInternalItems
                .filter(item => !catalogIdentity.has(`${item.codigo_item.trim().toUpperCase()}|${item.titulo.trim().toUpperCase()}`))
                .map(item => toReinsertRow(item, null)),
            ...preservedCatalogItems.map(item => toReinsertRow(item, item.highline_template_row)),
        ];

        await prisma.$transaction(async tx => {
            // BudgetItem representa sempre o estado corrente. O histórico imutável fica em BudgetVersion.snapshot_json.
            if (expectedDate) {
                const lock = await tx.budget.updateMany({
                    where: { id: budgetId, updated_at: expectedDate },
                    data: { updated_at: new Date() },
                });
                if (lock.count === 0) {
                    throw new Error('O orçamento foi alterado em outra aba. Recarregue antes de salvar.');
                }
            }
            await tx.budgetItem.deleteMany({ where: { budget_id: budgetId } });
            const nextItems = [...preservedData, ...normalized];
            if (nextItems.length > 0) await tx.budgetItem.createMany({ data: nextItems });

            // Usou o catálogo da PV: o orçamento é uma PV Highline, não uma cotação
            // interna. Sem isso o rótulo na tela dizia o contrário do que o orçamento é.
            const virouPv = nextItems.some(i => i.highline_template_row != null);
            const precisaCorrigirTipo = virouPv && budget.tipo_orcamento !== 'PV_HIGHLINE';
            if (precisaCorrigirTipo || !expectedDate) {
                await tx.budget.update({
                    where: { id: budgetId },
                    data: {
                        ...(precisaCorrigirTipo ? { tipo_orcamento: 'PV_HIGHLINE' } : {}),
                        updated_at: new Date(),
                    },
                });
            }
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
