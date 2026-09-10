import { prisma } from '../server';
import { gerarContrato } from './contrato.service';

const STATUS_EDITAVEIS = ['PENDENTE', 'SOLICITADO'];
const STATUS_CONCLUIDOS = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];

type TipoFavorecido = 'supplier' | 'funcionario';

function dadosFavorecido(tipo: TipoFavorecido, pessoa: any) {
    const funcionario = tipo === 'funcionario';
    const pix = funcionario ? pessoa.pix_chave : pessoa.pix;
    return {
        nome: pessoa.nome,
        documento: funcionario ? pessoa.cpf : (pessoa.tipo === 'PESSOA_FISICA' ? pessoa.cpf : (pessoa.cnpj || pessoa.cpf)),
        banco: pessoa.banco,
        agencia: pessoa.agencia,
        conta: pessoa.conta,
        tipo_conta: pessoa.tipo_conta,
        pix_tipo: pessoa.pix_tipo,
        pix,
        forma_pagamento: pessoa.forma_pagamento || (pix ? 'PIX' : 'TED'),
    };
}

async function regenerarContratosGerados(whereContratacao: any) {
    const contratos = await prisma.contrato.findMany({
        where: { status: 'GERADO', contratacao: whereContratacao },
        select: { contratacao_id: true },
    });
    for (const contrato of contratos) await gerarContrato(contrato.contratacao_id);
    return contratos.length;
}

/**
 * Propaga alteracoes do cadastro mestre somente para obrigacoes que ainda podem
 * ser corrigidas. Pagamentos concluidos e documentos enviados/assinados ficam
 * congelados como trilha historica.
 */
export async function sincronizarPendenciasFavorecido(
    tipo: TipoFavorecido,
    id: string,
    anterior: any,
    atual: any,
) {
    const antes = dadosFavorecido(tipo, anterior);
    const agora = dadosFavorecido(tipo, atual);
    const vinculo = tipo === 'supplier' ? { supplier_id: id } : { funcionario_id: id };

    const [reembolsos, reembolsosForma, depositosForma, parcelasForma, solicitacoes, solicitacoesForma] = await prisma.$transaction([
        // O cabecalho e o snapshot legado dos dados bancarios. So o alteramos
        // quando nenhum deposito desse processo ja foi concluido.
        prisma.reembolso.updateMany({
            where: {
                ...vinculo,
                status: { in: STATUS_EDITAVEIS },
                pagamentos: { none: { status: { in: STATUS_CONCLUIDOS } } },
            },
            data: {
                favorecido_nome: agora.nome,
                cpf_cnpj: agora.documento,
                banco: agora.banco,
                agencia: agora.agencia,
                conta: agora.conta,
                tipo_conta: agora.tipo_conta,
                pix_tipo: agora.pix_tipo,
                pix_chave: agora.pix,
            },
        }),
        prisma.reembolso.updateMany({
            where: {
                ...vinculo,
                status: { in: STATUS_EDITAVEIS },
                forma_pagamento: antes.forma_pagamento,
                pagamentos: { none: { status: { in: STATUS_CONCLUIDOS } } },
            },
            data: { forma_pagamento: agora.forma_pagamento },
        }),
        prisma.reembolsoPagamento.updateMany({
            where: {
                status: { in: STATUS_EDITAVEIS },
                forma_pagamento: antes.forma_pagamento,
                reembolso: vinculo,
            },
            data: { forma_pagamento: agora.forma_pagamento },
        }),
        prisma.parcelaPagamento.updateMany({
            where: {
                status: { in: STATUS_EDITAVEIS },
                forma_pagamento: antes.forma_pagamento,
                formalizacao_posterior: false,
                contratacao: vinculo,
            },
            data: { forma_pagamento: agora.forma_pagamento },
        }),
        // A solicitacao ATIVA ainda e um rascunho operacional. Atualizamos os
        // snapshots enquanto a parcela nao foi enviada/concluida.
        prisma.solicitacaoPagamento.updateMany({
            where: {
                status: 'ATIVA',
                parcela: {
                    status: { in: STATUS_EDITAVEIS },
                    contratacao: vinculo,
                },
            },
            data: {
                banco_snapshot: agora.banco,
                agencia_snapshot: agora.agencia,
                conta_snapshot: agora.conta,
                pix_snapshot: agora.pix,
                atualizada_em: new Date(),
            },
        }),
        prisma.solicitacaoPagamento.updateMany({
            where: {
                status: 'ATIVA',
                forma_pagamento_snapshot: antes.forma_pagamento,
                parcela: {
                    status: { in: STATUS_EDITAVEIS },
                    contratacao: vinculo,
                },
            },
            data: {
                forma_pagamento_snapshot: agora.forma_pagamento,
                atualizada_em: new Date(),
            },
        }),
    ]);

    const contratos = await regenerarContratosGerados(vinculo);
    return {
        reembolsos: reembolsos.count,
        reembolsos_forma: reembolsosForma.count,
        depositos: depositosForma.count,
        parcelas: parcelasForma.count,
        solicitacoes: solicitacoes.count,
        solicitacoes_forma: solicitacoesForma.count,
        contratos,
    };
}

/** Contratos apenas gerados acompanham a atividade; enviados/assinados nao. */
export async function sincronizarPendenciasAtividade(atividadeId: string) {
    return { contratos: await regenerarContratosGerados({ atividade_id: atividadeId }) };
}
