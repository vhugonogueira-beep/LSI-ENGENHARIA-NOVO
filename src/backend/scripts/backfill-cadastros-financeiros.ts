import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pixCanonico(valor: string | null | undefined, tipoPessoa?: string | null) {
    const atual = String(valor || '').trim().toUpperCase();
    if (['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA', 'NAO_POSSUI'].includes(atual)) return atual;
    if (['CELULAR', 'TELEFONE', 'PHONE'].includes(atual)) return 'TELEFONE';
    if (['E-MAIL', 'EMAIL'].includes(atual)) return 'EMAIL';
    if (['N/A', 'NA', 'NAO POSSUI'].includes(atual)) return 'NAO_POSSUI';
    return tipoPessoa === 'PESSOA_JURIDICA' ? 'CNPJ' : 'CPF';
}

function contaCanonica(valor: string | null | undefined) {
    const atual = String(valor || '').trim().toUpperCase();
    if (!atual) return null;
    if (['N/A', 'NA', 'NAO APLICAVEL', 'NAO_APLICAVEL'].includes(atual)) return 'NAO_APLICAVEL';
    if (atual.includes('POUPAN')) return 'POUPANCA';
    if (atual.includes('PAGAMENTO')) return 'PAGAMENTO';
    if (atual.includes('SALARIO')) return 'SALARIO';
    if (atual.includes('CORRENTE')) return 'CORRENTE';
    return valor;
}

async function main() {
    const [funcionarios, fornecedores] = await Promise.all([
        prisma.funcionario.findMany(), prisma.supplier.findMany(),
    ]);
    for (const f of funcionarios) {
        await prisma.funcionario.update({
            where: { id: f.id },
            data: {
                forma_pagamento: f.forma_pagamento || (f.pix_chave ? 'PIX' : 'TED'),
                pix_tipo: pixCanonico(f.pix_tipo, 'PESSOA_FISICA'),
                tipo_conta: contaCanonica(f.tipo_conta),
            },
        });
    }
    for (const f of fornecedores) {
        await prisma.supplier.update({
            where: { id: f.id },
            data: {
                forma_pagamento: f.forma_pagamento || (f.pix ? 'PIX' : 'TED'),
                pix_tipo: pixCanonico(f.pix_tipo, f.tipo),
                tipo_conta: contaCanonica(f.tipo_conta),
            },
        });
    }
    console.log(JSON.stringify({ funcionarios: funcionarios.length, fornecedores: fornecedores.length }));
}

main()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
