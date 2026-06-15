import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function normalizarDescricao(texto: string): string {
    if (!texto) return '';
    return texto
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, "")
        .replace(/[^\w\s]|_/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const USUARIOS = [
    { nome: "Victor Hugo",      email: "victor.hugo@lsoffice.com.br", senha: "Victor@2026!",    role: "ADMIN" },
    { nome: "Admin LS",         email: "admin@lsoffice.com",           senha: "LsAdmin@2026!",   role: "ADMIN" },
    { nome: "Comercial LS",     email: "comercial@lsoffice.com",       senha: "LsCom@2026!",     role: "COMERCIAL" },
    { nome: "Operações LS",     email: "operacoes@lsoffice.com",       senha: "LsOp@2026!",      role: "OPERACOES" },
];

async function main() {
    console.log("Seeding database...");

    // 1. Criar Tenant
    const tenant = await prisma.tenant.create({
        data: { nome: "LS Office" }
    });
    console.log("Tenant created:", tenant.id);

    // 2. Criar Usuários com senhas hasheadas
    for (const u of USUARIOS) {
        const hash = await bcrypt.hash(u.senha, 12);
        await prisma.user.create({
            data: {
                tenant_id: tenant.id,
                nome: u.nome,
                email: u.email,
                senha_hash: hash,
                role: u.role,
            }
        });
        console.log(`User created: ${u.email} [${u.role}]`);
    }

    // 3. Criar Contratante (HIGHLINE)
    const contratante = await prisma.contratante.create({
        data: {
            tenant_id: tenant.id,
            nome: "HIGHLINE",
            contato_nome: "Contato Teste"
        }
    });

    // 4. Criar Site
    const site = await prisma.site.create({
        data: {
            tenant_id: tenant.id,
            id_site: "RJCAM15_001 / RJCMP031",
            cidade: "Rio de Janeiro",
            uf: "RJ"
        }
    });

    // 5. Config do Template
    const templateConfig = {
        nome: "Energia – UR + Manutenção FCC + Bateria",
        descricao: "TPL-ENE-UR-FCC-BAT",
        tenant_id: tenant.id,
    };

    const templateItems = [
        { bloco_id: "MOBILIZACAO", codigo_item: "01", titulo: "Mobilização", descricao: "Mobilização de equipe, ferramentas...", unidade: "vb", ordem: 10 },
        { bloco_id: "SERVICOS", codigo_item: "02", titulo: "Serviços", descricao: "Serviços técnicos...", unidade: "vb", ordem: 20 },
        { bloco_id: "SERVICOS", codigo_item: "02.1", titulo: "Instalação / Ajustes em UR", descricao: "Serviço de instalação...", unidade: "vb", ordem: 21 },
        { bloco_id: "SERVICOS", codigo_item: "02.2", titulo: "Manutenção FCC", descricao: "Manutenção do gabinete...", unidade: "vb", ordem: 22 },
        { bloco_id: "SERVICOS", codigo_item: "02.3", titulo: "Manutenção / Substituição de Baterias", descricao: "Serviços relacionados a banco...", unidade: "vb", ordem: 23 },
        { bloco_id: "INFRA", codigo_item: "03", titulo: "Infra – Fornecimento e Instalação", descricao: "Materiais/infraestrutura...", unidade: "vb", ordem: 30 }
    ];

    const template = await prisma.budgetTemplate.create({ data: templateConfig });
    await prisma.budgetTemplateItem.createMany({
        data: templateItems.map(item => ({ ...item, template_id: template.id }))
    });

    // 6. Criar Itens de Catálogo
    const catalogItems = [
        { codigo: "MOB-01", titulo: "Mobilização", unidade_padrao: "vb", categoria: "OUTROS" },
        { codigo: "ENE-01", titulo: "Instalação / Ajustes em UR", unidade_padrao: "vb", categoria: "ENERGIA" },
        { codigo: "ENE-02", titulo: "Manutenção FCC", unidade_padrao: "vb", categoria: "ENERGIA" },
        { codigo: "ENE-03", titulo: "Substituição de Baterias", unidade_padrao: "vb", categoria: "ENERGIA" },
        { codigo: "INF-01", titulo: "Infra – Fornecimento", unidade_padrao: "vb", categoria: "CIVIL" },
    ];

    await prisma.catalogService.createMany({
        data: catalogItems.map(item => ({ ...item, tenant_id: tenant.id, valor_base: 0, bdi_sugerido_percent: 0 }))
    });

    // 7. Fornecedores + PriceBooks + PriceBookItems
    console.log("Creating suppliers...");

    const highline = await prisma.supplier.create({
        data: {
            tenant_id: tenant.id,
            nome: "Highline",
            cnpj: "12.345.678/0001-01",
            email: "contato@highline.com.br",
            telefone: "(21) 3333-4444",
        }
    });

    const winity = await prisma.supplier.create({
        data: {
            tenant_id: tenant.id,
            nome: "Winity",
            cnpj: "22.333.444/0001-55",
            email: "comercial@winity.com.br",
            telefone: "(11) 5555-6666",
        }
    });

    const sba = await prisma.supplier.create({
        data: {
            tenant_id: tenant.id,
            nome: "SBA Communications",
            cnpj: "33.444.555/0001-77",
            email: "brazil@sbasite.com",
        }
    });

    console.log("Suppliers created:", highline.id, winity.id, sba.id);

    const pbHighline = await prisma.priceBook.create({
        data: {
            tenant_id: tenant.id,
            supplier_id: highline.id,
            nome_lpu: "LPU Highline 2026 - Sudeste",
            regiao: "SUDESTE",
            data_inicio_vigencia: new Date("2026-01-01"),
            data_fim_vigencia: new Date("2026-12-31"),
        }
    });

    const pbWinity = await prisma.priceBook.create({
        data: {
            tenant_id: tenant.id,
            supplier_id: winity.id,
            nome_lpu: "LPU Winity 2026 - Nordeste",
            regiao: "NORDESTE",
            data_inicio_vigencia: new Date("2026-01-01"),
        }
    });

    const highlineItems = [
        { tipo_escopo: "SERVICO", codigo_item: "S-01", descricao: "Mobilização de equipe técnica (até 100km)", unidade: "vb", valor_unitario: 1200.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-02", descricao: "Desmobilização de equipe técnica (até 100km)", unidade: "vb", valor_unitario: 800.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-03", descricao: "Instalação de UR (Unidade Retificadora)", unidade: "vb", valor_unitario: 3500.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-04", descricao: "Adequação de quadro de energia / QTM", unidade: "vb", valor_unitario: 2800.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-05", descricao: "Instalação de antena setorial (por setor)", unidade: "un", valor_unitario: 1500.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-06", descricao: "Lançamento de cabo de fibra óptica", unidade: "m", valor_unitario: 12.50 },
        { tipo_escopo: "SERVICO", codigo_item: "S-07", descricao: "Comissionamento e testes de RF", unidade: "vb", valor_unitario: 2200.00 },
        { tipo_escopo: "SERVICO", codigo_item: "S-08", descricao: "Elaboração de as-built", unidade: "vb", valor_unitario: 950.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-01", descricao: "Eletroduto galvanizado 1\" (fornecimento e instalação)", unidade: "m", valor_unitario: 45.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-02", descricao: "Cabo de energia 10mm² (fornecimento e instalação)", unidade: "m", valor_unitario: 28.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-03", descricao: "Disjuntor trifásico 63A", unidade: "un", valor_unitario: 180.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-04", descricao: "DPS classe II (por fase)", unidade: "un", valor_unitario: 95.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-05", descricao: "Base de concreto para gabinete outdoor", unidade: "vb", valor_unitario: 3200.00 },
        { tipo_escopo: "INFRA", codigo_item: "I-06", descricao: "Grade de proteção metálica com pintura", unidade: "vb", valor_unitario: 2400.00 },
    ];

    await prisma.priceBookItem.createMany({
        data: highlineItems.map(item => ({
            ...item,
            tenant_id: tenant.id,
            pricebook_id: pbHighline.id,
            supplier_id: highline.id,
            regiao: "SUDESTE",
            descricao_normalizada: normalizarDescricao(item.descricao),
        }))
    });

    const winityItems = [
        { tipo_escopo: "SERVICO", codigo_item: "W-01", descricao: "Mobilização de equipe técnica (até 100km)", unidade: "vb", valor_unitario: 1350.00 },
        { tipo_escopo: "SERVICO", codigo_item: "W-02", descricao: "Instalação de UR (Unidade Retificadora)", unidade: "vb", valor_unitario: 3200.00 },
        { tipo_escopo: "SERVICO", codigo_item: "W-03", descricao: "Adequação de quadro de energia / QTM", unidade: "vb", valor_unitario: 2600.00 },
        { tipo_escopo: "SERVICO", codigo_item: "W-04", descricao: "Instalação de antena setorial (por setor)", unidade: "un", valor_unitario: 1400.00 },
        { tipo_escopo: "SERVICO", codigo_item: "W-05", descricao: "Comissionamento e testes de RF", unidade: "vb", valor_unitario: 2000.00 },
        { tipo_escopo: "INFRA", codigo_item: "WI-01", descricao: "Eletroduto galvanizado 1\"", unidade: "m", valor_unitario: 42.00 },
        { tipo_escopo: "INFRA", codigo_item: "WI-02", descricao: "Cabo de energia 10mm²", unidade: "m", valor_unitario: 25.00 },
        { tipo_escopo: "INFRA", codigo_item: "WI-03", descricao: "Base de concreto para gabinete outdoor", unidade: "vb", valor_unitario: 2900.00 },
    ];

    await prisma.priceBookItem.createMany({
        data: winityItems.map(item => ({
            ...item,
            tenant_id: tenant.id,
            pricebook_id: pbWinity.id,
            supplier_id: winity.id,
            regiao: "NORDESTE",
            descricao_normalizada: normalizarDescricao(item.descricao),
        }))
    });

    console.log("PriceBookItems created:", highlineItems.length + winityItems.length, "total items");
    console.log("\n✅ Database seeded successfully!");
    console.log("\n═══════════════ LOGINS CRIADOS ═══════════════");
    for (const u of USUARIOS) {
        console.log(`  ${u.role.padEnd(10)} | ${u.email.padEnd(35)} | ${u.senha}`);
    }
    console.log("══════════════════════════════════════════════");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
