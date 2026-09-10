import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cent = (v: number) => Math.round(v * 100) / 100;

async function main() {
    const processos = await prisma.reembolso.findMany({
        include: { pagamentos: true, despesas: { orderBy: { ordem: 'asc' } } },
    });
    let pagamentosCriados = 0;
    let prestacoesMigradas = 0;

    for (const processo of processos) {
        if (processo.pagamentos.length) continue;
        const valor = cent(processo.natureza === 'ADIANTAMENTO'
            ? Number(processo.valor_adiantado || 0) : Number(processo.valor_total || 0));
        if (valor <= 0) continue;

        await prisma.$transaction(async tx => {
            const pagamento = await tx.reembolsoPagamento.create({
                data: {
                    reembolso_id: processo.id,
                    numero: 1,
                    valor,
                    forma_pagamento: processo.forma_pagamento || (processo.pix_chave ? 'PIX' : 'TED'),
                    status: processo.status,
                    data_solicitacao: processo.data_solicitacao,
                    data_prevista: processo.data_prevista,
                    data_pagamento: processo.data_pagamento,
                    comprovante_url: processo.comprovante_url,
                    observacoes: 'Migrado automaticamente do pagamento único legado',
                },
            });
            pagamentosCriados += 1;

            const possuiPrestacaoLegada = processo.natureza === 'ADIANTAMENTO'
                && (processo.despesas.length > 0
                    || !['PENDENTE', 'NAO_APLICAVEL'].includes(processo.status_prestacao));
            if (possuiPrestacaoLegada) {
                await tx.prestacaoContasConsolidada.create({
                    data: {
                        tenant_id: processo.tenant_id,
                        atividade_id: processo.atividade_id,
                        favorecido_nome: processo.favorecido_nome,
                        cpf_cnpj: processo.cpf_cnpj,
                        status: processo.status_prestacao === 'PENDENTE' ? 'EM_PREENCHIMENTO' : processo.status_prestacao,
                        valor_adiantado: valor,
                        valor_despesas: cent(processo.despesas.reduce((s, d) => s + d.valor, 0)),
                        parecer_financeiro: processo.parecer_financeiro,
                        enviada_em: processo.prestacao_enviada_em,
                        conferida_em: processo.prestacao_conferida_em,
                        conferida_por: processo.prestacao_conferida_por,
                        pagamentos: { create: [{ pagamento_id: pagamento.id }] },
                        despesas: {
                            create: processo.despesas.map(d => ({
                                data: d.data, descricao: d.descricao, categoria: d.categoria,
                                valor: d.valor, anexo_url: d.anexo_url, ordem: d.ordem,
                            })),
                        },
                    },
                });
                prestacoesMigradas += 1;
            }
        });
    }

    console.log(JSON.stringify({ processos: processos.length, pagamentosCriados, prestacoesMigradas }));
}

main().finally(() => prisma.$disconnect());
