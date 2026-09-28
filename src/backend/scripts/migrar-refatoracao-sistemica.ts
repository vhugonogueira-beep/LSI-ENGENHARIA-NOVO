import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const key = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
const recipients = (value: string | null) => String(value || '').split(/[;,\n]/).map(v => v.trim().toLowerCase()).filter(Boolean);

async function main() {
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    const [empresa, operadoras, clientes, atividades] = await Promise.all([
      prisma.empresaConfig.findUnique({ where: { tenant_id: tenant.id } }),
      prisma.operadora.findMany({ where: { tenant_id: tenant.id } }),
      prisma.contratante.findMany({ where: { tenant_id: tenant.id } }),
      prisma.atividade.findMany({ where: { tenant_id: tenant.id }, select: { contratante_id: true, sharing: true, operadora: true } }),
    ]);
    const all = [...clientes];
    for (const legacy of operadoras) {
      let target = all.find(c => key(c.nome) === key(legacy.nome) || (legacy.sigla && key(c.sigla) === key(legacy.sigla)));
      if (!target) {
        target = await prisma.contratante.create({ data: { tenant_id: tenant.id, nome: legacy.nome, sigla: legacy.sigla, logo_url: legacy.logo_url, tipo: 'OPERADORA', ativo: legacy.ativa } });
        all.push(target);
      } else {
        target = await prisma.contratante.update({ where: { id: target.id }, data: { sigla: target.sigla || legacy.sigla, logo_url: target.logo_url || legacy.logo_url, tipo: target.tipo === 'SHARING' ? 'SHARING_OPERADORA' : 'OPERADORA', ativo: target.ativo && legacy.ativa } });
      }
    }
    for (const cliente of all) {
      const sharing = atividades.some(a => a.contratante_id === cliente.id || key(a.sharing) === key(cliente.nome) || (cliente.sigla && key(a.sharing) === key(cliente.sigla)));
      const operadora = atividades.some(a => key(a.operadora) === key(cliente.nome) || (cliente.sigla && key(a.operadora) === key(cliente.sigla)));
      const tipo = sharing && operadora ? 'SHARING_OPERADORA' : sharing ? 'SHARING' : operadora ? 'OPERADORA' : cliente.tipo;
      if (tipo !== cliente.tipo) await prisma.contratante.update({ where: { id: cliente.id }, data: { tipo } });
    }
    if (empresa) {
      const defaults = [
        ['PAYMENT_REQUEST', recipients(empresa.destinatarios_pagamento)],
        ['PAYMENT_FORMALIZATION', recipients(empresa.destinatarios_pagamento)],
        ['BILLING', recipients(empresa.email_faturamento)],
      ] as const;
      for (const [tipo, para] of defaults) await prisma.emailRoutingConfig.upsert({
        where: { tenant_id_tipo: { tenant_id: tenant.id, tipo } },
        create: { tenant_id: tenant.id, empresa_id: empresa.id, tipo, para_json: JSON.stringify(para), cc_json: '[]' },
        update: {},
      });
    }
    await prisma.parcelaPagamento.updateMany({ where: { contratacao: { tenant_id: tenant.id }, formalizacao_posterior: true }, data: { processo_tipo: 'PAYMENT_FORMALIZATION' } });
  }
  console.log('Migração sistêmica concluída sem excluir registros legados.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
