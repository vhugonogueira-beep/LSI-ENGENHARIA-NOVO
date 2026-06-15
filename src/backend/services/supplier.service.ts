import { prisma } from '../server';

export class SupplierService {

    static async getSuppliers(tenantId: string, page = 1, limit = 50) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.supplier.findMany({
                where: { tenant_id: tenantId, ativo: true },
                include: {
                    _count: { select: { priceBooks: true } }
                },
                orderBy: { nome: 'asc' },
                skip,
                take: limit,
            }),
            prisma.supplier.count({ where: { tenant_id: tenantId, ativo: true } })
        ]);
        return { items, total, page, limit };
    }

    static async getSupplierById(id: string) {
        return prisma.supplier.findUnique({
            where: { id },
            include: {
                priceBooks: {
                    orderBy: { created_at: 'desc' },
                    where: { status: 'ATIVA' }
                }
            }
        });
    }

    static async createSupplier(data: {
        tenant_id: string;
        nome: string;
        cnpj?: string;
        email?: string;
        telefone?: string;
        logo_url?: string;
    }) {
        return prisma.supplier.create({ data });
    }

    static async updateSupplier(id: string, data: {
        nome?: string;
        cnpj?: string;
        email?: string;
        telefone?: string;
        logo_url?: string;
        ativo?: boolean;
    }) {
        return prisma.supplier.update({
            where: { id },
            data: { ...data, updated_at: new Date() }
        });
    }

    static async deleteSupplier(id: string) {
        // Soft-delete
        return prisma.supplier.update({
            where: { id },
            data: { ativo: false, updated_at: new Date() }
        });
    }
}
