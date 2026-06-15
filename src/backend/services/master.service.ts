import { prisma } from '../server';
import { PriceEngineService } from './price-engine.service';

export class MasterService {
    // --- Tenants & Users ---
    static async getTenants() { return prisma.tenant.findMany(); }
    static async createTenant(data: any) { return prisma.tenant.create({ data }); }
    static async getUsers(tenantId: string) { return prisma.user.findMany({ where: { tenant_id: tenantId } }); }

    // --- Contratantes ---
    static async getContratantes(tenantId: string) {
        return prisma.contratante.findMany({ where: { tenant_id: tenantId } });
    }
    static async createContratante(data: any) {
        return prisma.contratante.create({ data });
    }
    static async updateContratante(id: string, data: any) {
        return prisma.contratante.update({ where: { id }, data });
    }

    // --- Sites ---
    static async getSites(tenantId: string) {
        return prisma.site.findMany({ where: { tenant_id: tenantId } });
    }
    static async createSite(data: any) {
        return prisma.site.create({ data });
    }

    // --- Catalog Services ---
    static async getCatalogServices(tenantId: string) {
        return prisma.catalogService.findMany({ where: { tenant_id: tenantId, ativo: true } });
    }
    static async createCatalogService(data: any) {
        if (!data.descricao_item_normalizada) {
            data.descricao_item_normalizada = PriceEngineService.normalizarDescricao(data.titulo + ' ' + (data.descricao_padrao || ''));
        }
        return prisma.catalogService.create({ data });
    }

    // --- Budget Templates ---
    static async getTemplates(tenantId: string) {
        return prisma.budgetTemplate.findMany({
            where: { tenant_id: tenantId, ativo: true },
            include: { items: { orderBy: { ordem: 'asc' } } }
        });
    }
    static async getTemplateById(id: string) {
        return prisma.budgetTemplate.findUnique({
            where: { id },
            include: { items: { orderBy: { ordem: 'asc' } } }
        });
    }
    static async createTemplate(data: any, items: any[]) {
        return prisma.$transaction(async (tx) => {
            const template = await tx.budgetTemplate.create({ data });
            if (items && items.length > 0) {
                const itemsToCreate = items.map(item => ({ ...item, template_id: template.id }));
                await tx.budgetTemplateItem.createMany({ data: itemsToCreate });
            }
            return tx.budgetTemplate.findUnique({ where: { id: template.id }, include: { items: true } });
        });
    }
}
