import { Request, Response } from 'express';
import { prisma } from '../server';
import { gerarEmailCorporativo, type DadosEmail } from '../services/email-corporativo.service';
import { buildOutlookEml, composeEmailForUser } from '../services/email-signature.service';
import { resolveEmailRouting } from '../services/email-routing.service';
import { getPaymentPurpose, isDesembolsoPendente, normalizePaymentProcessType, validateFormalizationDocuments } from '../services/payment-domain.service';
import { loadPaymentAttachment } from '../services/payment-attachment.service';
import { nomearAnexo } from '../services/nomear-anexo.service';
import { lerAlteracoes, registrarAlteracao } from '../services/registro-alteracao.service';
import { autorizarSolicitacao } from '../services/aprovacao-pagamento.service';
import { temPermissao } from '../services/permissoes.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

/** Para mensagens de erro: o valor precisa aparecer do jeito que o usuário lê. */
function moedaBR(v: number): string {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Confere se quem está logado pode tirar esta parcela de PENDENTE agora —
 * autonomia pelo valor ou aprovação já concedida (aprovacao-pagamento.service).
 */
async function autorizarParcela(req: Request, parcela: { id: string; tipo: string; valor: number }, contratacao: any) {
    const favorecido = contratacao.supplier?.nome || contratacao.funcionario?.nome || 'favorecido';
    const codigo = contratacao.atividade?.codigo ? `${contratacao.atividade.codigo} · ` : '';
    return autorizarSolicitacao((req as any).user, {
        origem: 'PARCELA', registro_id: parcela.id, valor: parcela.valor, atividade_id: contratacao.atividade_id,
        descricao: `${codigo}${favorecido.trim()} · parcela ${parcela.tipo.toLowerCase()} (${String(contratacao.finalidade || '').replace(/_/g, ' ').toLowerCase()})`,
    });
}

function favorecidoDa(c: any) {
    const p = c.supplier || c.funcionario;
    if (!p) throw new Error('Contratação sem favorecido vinculado');
    const funcionario = Boolean(c.funcionario);
    return {
        ...p,
        nome_exibicao: p.nome_fantasia || p.nome,
        documento: funcionario ? p.cpf : (p.tipo === 'PESSOA_FISICA' ? p.cpf : p.cnpj),
        pix_pagamento: funcionario ? p.pix_chave : p.pix,
        forma_pagamento: funcionario ? (p.forma_pagamento || (p.pix_chave ? 'PIX' : 'TED')) : p.forma_pagamento,
    };
}

const FORMAS_PAGAMENTO = ['PIX', 'TED', 'CARTAO_CREDITO', 'BOLETO', 'DINHEIRO'];

function formaPagamentoValida(valor: unknown): string | null {
    const forma = String(valor || '').trim().toUpperCase();
    return FORMAS_PAGAMENTO.includes(forma) ? forma : null;
}

async function resolverCartao(tenantId: string, formaPagamento: string, cartaoId?: string | null) {
    if (formaPagamento !== 'CARTAO_CREDITO') return null;
    const empresa = await prisma.empresaConfig.findFirst({
        where: { tenant_id: tenantId },
        include: { cartoes: { where: { ativo: true }, orderBy: { created_at: 'asc' } } },
    });
    const cartao = cartaoId
        ? empresa?.cartoes.find(c => c.id === cartaoId)
        : empresa?.cartoes[0];
    if (!cartao) throw new Error('Cadastre e selecione um cartao corporativo ativo para este pagamento');
    return cartao;
}

// Após contratar um fornecedor, marca a atividade como tendo custo comprometido
// (Blueprint LSI, seção 09/14 — comprometido ≠ pago é rastreado nas Parcelas, não aqui).
async function marcarCustoComprometido(atividade_id: string) {
    await prisma.atividade.update({
        where: { id: atividade_id },
        data: { status_financeiro: 'CUSTO_COMPROMETIDO' },
    }).catch(() => { /* atividade pode já estar em CUSTO_PAGO; não regride */ });
}

// Contrata um fornecedor para uma finalidade dentro da atividade e gera as parcelas
// automaticamente a partir da condição de pagamento (Blueprint LSI, seções 13-14).
export async function createContratacao(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const {
            atividade_id, supplier_id, funcionario_id, finalidade, valor_contratado,
            condicao_id, percentual_entrada, percentual_saldo, gatilho_saldo,
            observacoes, forma_pagamento: formaInformada, cartao_id,
            processo_tipo, formalizacao_posterior, data_compra_cartao, data_pagamento, fatura_referencia,
        } = req.body;

        if (!atividade_id || (!supplier_id && !funcionario_id) || (supplier_id && funcionario_id) || !finalidade || valor_contratado == null) {
            return res.status(400).json({ error: 'atividade_id, supplier_id, finalidade e valor_contratado são obrigatórios' });
        }

        const favorecido = supplier_id
            ? await prisma.supplier.findUnique({ where: { id: supplier_id } })
            : await prisma.funcionario.findUnique({ where: { id: funcionario_id } });
        if (!favorecido) return res.status(404).json({ error: 'Favorecido nao encontrado' });

        const formaPadrao = supplier_id
            ? (favorecido as any).forma_pagamento
            : ((favorecido as any).forma_pagamento || ((favorecido as any).pix_chave ? 'PIX' : 'TED'));
        const formaPagamento = formaPagamentoValida(formaInformada || formaPadrao);
        if (!formaPagamento) {
            return res.status(400).json({ error: 'Informe uma forma de pagamento valida' });
        }
        const processoTipo = normalizePaymentProcessType(processo_tipo, Boolean(formalizacao_posterior));
        const formalizacao = processoTipo === 'PAYMENT_FORMALIZATION';
        const dataEfetiva = data_pagamento || data_compra_cartao;
        if (formalizacao && !dataEfetiva) {
            return res.status(400).json({ error: 'Informe a data em que o pagamento foi realizado' });
        }
        const cartao = await resolverCartao(tenant_id, formaPagamento, cartao_id);

        const valorNum = parseFloat(valor_contratado);
        let entrada: number;
        let saldo: number;
        let gatilho: string;

        if (condicao_id) {
            const condicao = await prisma.condicaoPagamentoFornecedor.findUnique({ where: { id: condicao_id } });
            if (!condicao) return res.status(404).json({ error: 'Condição de pagamento não encontrada' });
            entrada = condicao.percentual_entrada;
            saldo = condicao.percentual_saldo;
            gatilho = condicao.gatilho_saldo;
        } else if (percentual_entrada != null && percentual_saldo != null) {
            entrada = parseFloat(percentual_entrada);
            saldo = parseFloat(percentual_saldo);
            gatilho = gatilho_saldo || 'CONCLUSAO';
            if (Math.round(entrada + saldo) !== 100) {
                return res.status(400).json({ error: 'percentual_entrada + percentual_saldo deve somar 100' });
            }
        } else {
            entrada = 0;
            saldo = 100;
            gatilho = gatilho_saldo || 'CONCLUSAO';
        }

        if (formalizacao && (entrada !== 0 || saldo !== 100)) {
            return res.status(400).json({ error: 'Compra ja realizada no cartao deve ser registrada como pagamento unico (0% entrada / 100% saldo)' });
        }

        const valorEntrada = round2(valorNum * entrada / 100);
        const valorSaldo = round2(valorNum - valorEntrada);

        // Só nasce parcela que tem valor. Entrada de 100% (ou de 0%) é pagamento
        // único — gerar um saldo de R$ 0,00 ao lado só cria uma linha que alguém
        // vai tentar solicitar.
        const dadosPagamento = {
            forma_pagamento: formaPagamento,
            cartao_id: cartao?.id || null,
            cartao_bandeira: cartao?.bandeira || null,
            cartao_final: cartao?.final || null,
            cartao_apelido: cartao?.apelido || null,
            formalizacao_posterior: formalizacao,
            processo_tipo: processoTipo,
            data_compra_cartao: formalizacao && formaPagamento === 'CARTAO_CREDITO' ? new Date(dataEfetiva) : null,
            fatura_referencia: fatura_referencia || null,
            // Uma formalização nasce pendente de documentos. Ela somente pode
            // ser concluída depois do comprovante e, para material, documento fiscal.
            status: 'PENDENTE',
            data_pagamento: formalizacao ? new Date(dataEfetiva) : null,
        };
        const parcelasCreate = (entrada > 0 && saldo > 0)
            ? [
                { tipo: 'ENTRADA', percentual: entrada, valor: valorEntrada, ...dadosPagamento },
                { tipo: 'SALDO', percentual: saldo, valor: valorSaldo, ...dadosPagamento },
            ]
            : [
                { tipo: 'UNICA', percentual: 100, valor: valorNum, ...dadosPagamento },
            ];

        const contratacao = await prisma.contratacaoFornecedor.create({
            data: {
                tenant_id,
                atividade_id,
                supplier_id,
                funcionario_id: funcionario_id || null,
                finalidade,
                valor_contratado: valorNum,
                condicao_id: condicao_id || null,
                percentual_entrada_override: condicao_id ? null : entrada,
                percentual_saldo_override: condicao_id ? null : saldo,
                gatilho_saldo_override: condicao_id ? null : gatilho,
                observacoes: observacoes || null,
                created_by: (req as any).user?.email || null,
                parcelas: { create: parcelasCreate },
            },
            include: { parcelas: true, supplier: { select: { nome: true, categoria: true } }, funcionario: { select: { nome: true, cargo: true } } },
        });

        await marcarCustoComprometido(atividade_id);

        res.status(201).json(contratacao);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listContratacoes(req: Request, res: Response) {
    try {
        const { atividade_id, supplier_id } = req.query;
        const where: any = {};
        if (atividade_id) where.atividade_id = atividade_id;
        if (supplier_id) where.supplier_id = supplier_id;

        const contratacoes = await prisma.contratacaoFornecedor.findMany({
            where,
            include: {
                supplier: { select: { nome: true, categoria: true, forma_pagamento: true, pix: true } },
                funcionario: { select: { nome: true, cargo: true, pix_chave: true, forma_pagamento: true } },
                parcelas: true,
                contrato: { include: { arquivos: { orderBy: { created_at: 'desc' } } } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(contratacoes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getContratacao(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const contratacao = await prisma.contratacaoFornecedor.findUnique({
            where: { id },
            include: {
                supplier: true,
                funcionario: true,
                condicao: true,
                parcelas: { include: { solicitacoes: true }, orderBy: { created_at: 'asc' } },
                atividade: { select: { codigo: true, titulo: true } },
            },
        });
        if (!contratacao) return res.status(404).json({ error: 'Contratação não encontrada' });
        res.json(contratacao);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Botão "Solicitar Pagamento" (Blueprint LSI, seção 15): monta a solicitação com os
// dados bancários do fornecedor e gera o corpo do e-mail para o financeiro.
export async function solicitarPagamento(req: Request, res: Response) {
    try {
        const { parcelaId } = req.params;
        const { motivo, destinatario_financeiro, data_prevista, data_solicitacao } = req.body;
        if (!data_prevista) return res.status(400).json({ error: 'Informe a data prevista para o pagamento' });
        const dataSolicitacao = data_solicitacao ? new Date(data_solicitacao) : new Date();
        const dataPrevista = new Date(data_prevista);
        if (Number.isNaN(dataSolicitacao.getTime()) || Number.isNaN(dataPrevista.getTime())) {
            return res.status(400).json({ error: 'Informe datas válidas para a programação' });
        }

        const parcela = await prisma.parcelaPagamento.findUnique({
            where: { id: parcelaId },
            include: {
                contratacao: {
                    include: {
                        supplier: true,
                        funcionario: true,
                        atividade: { select: { codigo: true, titulo: true, id_site_sharing: true, sharing: true } },
                    },
                },
            },
        });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
        if (!['PENDENTE'].includes(parcela.status)) {
            return res.status(400).json({ error: `Parcela já está em status ${parcela.status}; use a atualização de status para avançar` });
        }
        const autorizacao = await autorizarParcela(req, parcela, parcela.contratacao);
        if (!autorizacao.liberado) return res.status(autorizacao.status).json(autorizacao);

        const { atividade } = parcela.contratacao;
        const supplier = favorecidoDa(parcela.contratacao);
        const formaPagamento = parcela.forma_pagamento || supplier.forma_pagamento;
        const cartaoSnapshot = parcela.cartao_bandeira && parcela.cartao_final
            ? `${parcela.cartao_bandeira} **** ${parcela.cartao_final}${parcela.cartao_apelido ? ` - ${parcela.cartao_apelido}` : ''}`
            : null;

        const solicitacao = await prisma.solicitacaoPagamento.create({
            data: {
                parcela_id: parcelaId,
                motivo: motivo || `Pagamento de ${parcela.tipo.toLowerCase()} — ${parcela.contratacao.finalidade}`,
                destinatario_financeiro: destinatario_financeiro || 'financeiro@lsoffice.com.br',
                banco_snapshot: supplier.banco,
                agencia_snapshot: supplier.agencia,
                conta_snapshot: supplier.conta,
                pix_snapshot: supplier.pix_pagamento,
                forma_pagamento_snapshot: formaPagamento,
                cartao_snapshot: cartaoSnapshot,
                valor_snapshot: parcela.valor,
                data_prevista: dataPrevista,
                enviado_por: (req as any).user?.email || null,
            },
        });

        await prisma.parcelaPagamento.update({
            where: { id: parcelaId },
            data: {
                status: 'SOLICITADO',
                // Dia em que o e-mail foi para o financeiro. Fica no registro para
                // dar prazo de resposta, nao so "previsto x pago".
                data_solicitacao: dataSolicitacao,
                data_prevista: dataPrevista,
            },
        });

        // A prévia duplicada em texto foi removida. A interface chama em seguida
        // o gerador corporativo autenticado, que é a fonte única do HTML e aplica
        // a assinatura do usuário atual pelo compositor compartilhado.
        res.status(201).json({ solicitacao });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/**
 * Cancela uma solicitacao enviada ao financeiro sem apagar a obrigacao do
 * contrato. A parcela volta a PENDENTE e o registro enviado permanece como
 * trilha de auditoria.
 */
export async function cancelarSolicitacaoPagamento(req: Request, res: Response) {
    try {
        const { parcelaId } = req.params;
        const parcela = await prisma.parcelaPagamento.findUnique({
            where: { id: parcelaId },
            include: { solicitacoes: { where: { status: 'ATIVA' } } },
        });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
        if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(parcela.status)) {
            return res.status(400).json({ error: 'Pagamento já realizado; a solicitação não pode ser cancelada' });
        }
        if (parcela.status === 'PENDENTE' && !parcela.solicitacoes.length) {
            return res.status(400).json({ error: 'Esta parcela não possui solicitação ativa' });
        }

        const agora = new Date();
        await prisma.$transaction([
            prisma.solicitacaoPagamento.updateMany({
                where: { parcela_id: parcelaId, status: 'ATIVA' },
                data: {
                    status: 'CANCELADA',
                    cancelada_em: agora,
                    cancelada_por: (req as any).user?.email || req.body.cancelada_por || 'Usuário do sistema',
                    motivo_cancelamento: req.body.motivo_cancelamento || 'Solicitação excluída antes do pagamento',
                },
            }),
            prisma.parcelaPagamento.update({
                where: { id: parcelaId },
                data: { status: 'PENDENTE', data_solicitacao: null, data_prevista: null },
            }),
        ]);

        res.json(await prisma.parcelaPagamento.findUnique({
            where: { id: parcelaId },
            include: { solicitacoes: { orderBy: { enviado_em: 'desc' } } },
        }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

const PARCELA_STATUS_ORDEM = ['PENDENTE', 'SOLICITADO', 'ENVIADO_FINANCEIRO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];

export async function atualizarStatusParcela(req: Request, res: Response) {
    try {
        const { parcelaId } = req.params;
        const { status, comprovante_url } = req.body;

        if (!PARCELA_STATUS_ORDEM.includes(status)) {
            return res.status(400).json({ error: `status inválido. Use um de: ${PARCELA_STATUS_ORDEM.join(', ')}` });
        }

        const atual = await prisma.parcelaPagamento.findUnique({ where: { id: parcelaId }, include: { contratacao: { include: { supplier: true, funcionario: true, atividade: { select: { codigo: true } } } }, anexos: true } });
        if (!atual) return res.status(404).json({ error: 'Pagamento não encontrado' });
        const processo = normalizePaymentProcessType(atual.processo_tipo, atual.formalizacao_posterior);
        // Dar baixa (pago, comprovante, conferido) é permissão própria, separada de solicitar.
        if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(status) && !temPermissao((req as any).user, 'pagamentos.baixar')) {
            return res.status(403).json({ error: 'Sem permissão para registrar pagamentos (Registrar pagamentos). Fale com o administrador.' });
        }
        if (processo === 'PAYMENT_REQUEST' && atual.status === 'PENDENTE' && status !== 'PENDENTE') {
            const autorizacao = await autorizarParcela(req, atual, atual.contratacao);
            if (!autorizacao.liberado) return res.status(autorizacao.status).json(autorizacao);
        }
        if (processo === 'PAYMENT_FORMALIZATION' && ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(status)) {
            const validacao = validateFormalizationDocuments(atual.contratacao.finalidade, atual.anexos.map(a => a.tipo));
            if (!validacao.complete) return res.status(400).json({ error: `Formalização incompleta. Anexe: ${validacao.missing.join(', ')}` });
        }
        const parcela = await prisma.parcelaPagamento.update({
            where: { id: parcelaId },
            data: {
                status,
                comprovante_url: comprovante_url !== undefined ? comprovante_url : undefined,
                // Numa formalização a data real do pagamento já foi informada no
                // cadastro — concluir os documentos não pode carimbar a data de hoje
                // por cima do histórico. Só marca agora quem ainda não tinha data.
                data_pagamento: status === 'PAGO' ? (atual.data_pagamento ?? new Date()) : undefined,
                data_solicitacao: status === 'SOLICITADO' ? new Date() : undefined,
            },
            include: { contratacao: true, anexos: true },
        });

        // Recalcula status_financeiro da atividade: CUSTO_PAGO somente quando todas as
        // parcelas de todas as contratações ativas estiverem pagas/conferidas.
        const todasParcelas = await prisma.parcelaPagamento.findMany({
            where: { contratacao: { atividade_id: parcela.contratacao.atividade_id, status: 'ATIVA' } },
        });
        // Formalização não segura o CUSTO_PAGO: o dinheiro já saiu, o que falta
        // é anexar documento. Só desembolso de verdade mantém a atividade em
        // CUSTO_COMPROMETIDO.
        const todasPagas = todasParcelas.length > 0 && !todasParcelas.some(p => isDesembolsoPendente(p));
        await prisma.atividade.update({
            where: { id: parcela.contratacao.atividade_id },
            data: { status_financeiro: todasPagas ? 'CUSTO_PAGO' : 'CUSTO_COMPROMETIDO' },
        });

        res.json(parcela);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Controladoria financeira da atividade (Blueprint LSI, seção 09/14):
// comprometido ≠ pago, calculado a partir das contratações e parcelas reais.
export async function getFinanceiroAtividade(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;

        const contratacoes = await prisma.contratacaoFornecedor.findMany({
            where: { atividade_id, status: 'ATIVA' },
            include: { parcelas: true, supplier: { select: { nome: true, categoria: true } }, funcionario: { select: { nome: true, cargo: true } } },
        });

        let custoComprometido = 0;
        let custoPago = 0;
        for (const c of contratacoes) {
            custoComprometido += c.valor_contratado;
            for (const p of c.parcelas) {
                if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status)) {
                    custoPago += p.valor;
                }
            }
        }
        const custoAPagar = round2(custoComprometido - custoPago);

        res.json({
            atividade_id,
            custo_comprometido: round2(custoComprometido),
            custo_pago: round2(custoPago),
            custo_a_pagar: custoAPagar,
            contratacoes,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/**
 * Edita o valor a pagar de uma parcela, independente da condição de pagamento.
 * A condição é um ponto de partida, não uma amarra: negociação, adiantamento
 * parcial e retenção mudam o valor sem mudar o contrato.
 * O percentual é recalculado sobre o valor contratado para não mentir na tela.
 */
export async function editarParcela(req: Request, res: Response) {
    try {
        const parcela = await prisma.parcelaPagamento.findUnique({
            where: { id: req.params.parcelaId },
            include: { contratacao: { include: { parcelas: true } } },
        });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
        if (req.body.valor !== undefined && ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(parcela.status)) {
            return res.status(400).json({ error: `Parcela já está ${parcela.status}; o valor não pode mais ser alterado` });
        }

        const dados: any = {};

        if (req.body.valor !== undefined) {
            const valor = Number(req.body.valor);
            if (!Number.isFinite(valor) || valor <= 0) {
                return res.status(400).json({ error: 'Informe um valor maior que zero' });
            }
            const contratado = parcela.contratacao.valor_contratado;
            const outras = parcela.contratacao.parcelas
                .filter(p => p.id !== parcela.id)
                .reduce((s, p) => s + p.valor, 0);
            if (round2(outras + valor) > round2(contratado)) {
                return res.status(400).json({
                    error: `A soma das parcelas (${round2(outras + valor)}) passaria do valor contratado (${contratado}). `
                        + 'Ajuste as outras parcelas ou o valor do contrato.',
                });
            }
            dados.valor = round2(valor);
            dados.percentual = contratado > 0 ? round2((valor / contratado) * 100) : 0;
            // Valor financeiro que muda sem rastro é problema de auditoria:
            // meses depois ninguém sabe se foi correção, negociação ou erro de
            // digitação. O motivo é opcional; o registro, não.
            await registrarAlteracao({
                tenant_id: parcela.contratacao.tenant_id,
                entidade: 'ParcelaPagamento',
                entidade_id: parcela.id,
                acao: 'VALOR_ALTERADO',
                antes: { valor: parcela.valor, percentual: parcela.percentual },
                depois: { valor: dados.valor, percentual: dados.percentual },
                motivo: req.body.motivo || null,
                user_id: (req as any).user?.email || null,
            });
        }

        for (const campo of ['data_prevista', 'data_solicitacao', 'data_pagamento']) {
            if (req.body[campo] !== undefined) {
                dados[campo] = req.body[campo] ? new Date(req.body[campo]) : null;
            }
        }
        if (req.body.tipo !== undefined && ['ENTRADA', 'SALDO', 'UNICA', 'PARCELA'].includes(req.body.tipo)) {
            dados.tipo = req.body.tipo;
        }
        if (req.body.forma_pagamento !== undefined) {
            const formaPagamento = formaPagamentoValida(req.body.forma_pagamento);
            if (!formaPagamento) return res.status(400).json({ error: 'Forma de pagamento invalida' });
            const cartao = await resolverCartao(parcela.contratacao.tenant_id, formaPagamento, req.body.cartao_id);
            dados.forma_pagamento = formaPagamento;
            dados.cartao_id = cartao?.id || null;
            dados.cartao_bandeira = cartao?.bandeira || null;
            dados.cartao_final = cartao?.final || null;
            dados.cartao_apelido = cartao?.apelido || null;
        }
        if (req.body.fatura_referencia !== undefined) dados.fatura_referencia = req.body.fatura_referencia || null;
        if (Object.keys(dados).length === 0) {
            return res.status(400).json({ error: 'Nada para alterar' });
        }

        await prisma.parcelaPagamento.update({ where: { id: parcela.id }, data: dados });
        if (req.body.valor !== undefined || req.body.data_prevista !== undefined) {
            await prisma.solicitacaoPagamento.updateMany({
                where: { parcela_id: parcela.id, status: 'ATIVA' },
                data: {
                    valor_snapshot: req.body.valor !== undefined ? dados.valor : parcela.valor,
                    data_prevista: req.body.data_prevista !== undefined ? dados.data_prevista : undefined,
                    atualizada_em: new Date(),
                },
            });
        }

        // O valor contratado e o que foi negociado com o fornecedor e nao muda por
        // causa de um adiantamento. Se as parcelas passarem a somar menos que ele,
        // a diferenca volta como SALDO pendente — senao os 40% restantes
        // desapareceriam da tela e ninguem cobraria.
        await reconciliarSaldo(parcela.contratacao_id);

        res.json(await prisma.contratacaoFornecedor.findUnique({
            where: { id: parcela.contratacao_id },
            include: { parcelas: { orderBy: { valor: 'desc' } } },
        }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Garante que a soma das parcelas feche com o valor contratado. Sobra vira (ou
 * engorda) uma parcela SALDO pendente; falta nao e corrigida automaticamente,
 * porque tirar valor de parcela ja programada e decisao de quem negociou.
 */
async function reconciliarSaldo(contratacaoId: string) {
    const c = await prisma.contratacaoFornecedor.findUnique({
        where: { id: contratacaoId },
        include: { parcelas: true },
    });
    if (!c) return;

    const alocado = round2(c.parcelas.reduce((soma, p) => soma + p.valor, 0));
    const restante = round2(c.valor_contratado - alocado);
    const saldoAberto = c.parcelas.find(p => p.tipo === 'SALDO' && p.status === 'PENDENTE');
    const pagamentoReferencia = c.parcelas.find(p => p.forma_pagamento);

    // Contrato ENCOLHEU: sobra alocação. Antes esta função só tratava aumento e
    // saía aqui, deixando as parcelas somando mais do que o contrato — um
    // contrato de 1.200 com 3.500 em parcelas. O excedente é absorvido pelo
    // saldo em aberto, que é a parcela que ainda não foi prometida a ninguém.
    if (restante < -0.01) {
        if (!saldoAberto) return;
        const novoValor = round2(saldoAberto.valor + restante);
        if (novoValor <= 0.01) {
            await prisma.solicitacaoPagamento.deleteMany({ where: { parcela_id: saldoAberto.id } });
            await prisma.parcelaPagamento.delete({ where: { id: saldoAberto.id } });
            return;
        }
        await prisma.parcelaPagamento.update({
            where: { id: saldoAberto.id },
            data: {
                valor: novoValor,
                percentual: c.valor_contratado > 0 ? round2((novoValor / c.valor_contratado) * 100) : 0,
            },
        });
        return;
    }
    if (restante <= 0.01) return;

    const percentual = c.valor_contratado > 0 ? round2((restante / c.valor_contratado) * 100) : 0;

    if (saldoAberto) {
        await prisma.parcelaPagamento.update({
            where: { id: saldoAberto.id },
            data: { valor: round2(saldoAberto.valor + restante),
                percentual: round2(((saldoAberto.valor + restante) / c.valor_contratado) * 100) },
        });
    } else {
        await prisma.parcelaPagamento.create({
            data: {
                contratacao_id: c.id, tipo: 'SALDO', valor: restante, percentual, status: 'PENDENTE',
                forma_pagamento: pagamentoReferencia?.forma_pagamento || null,
                cartao_id: pagamentoReferencia?.cartao_id || null,
                cartao_bandeira: pagamentoReferencia?.cartao_bandeira || null,
                cartao_final: pagamentoReferencia?.cartao_final || null,
                cartao_apelido: pagamentoReferencia?.cartao_apelido || null,
            },
        });
    }
}

/** Acrescenta uma parcela avulsa a uma contratação já existente. */
export async function adicionarParcela(req: Request, res: Response) {
    try {
        const contratacao = await prisma.contratacaoFornecedor.findUnique({
            where: { id: req.params.id },
            include: { parcelas: true },
        });
        if (!contratacao) return res.status(404).json({ error: 'Contratação não encontrada' });

        const valor = Number(req.body.valor);
        if (!Number.isFinite(valor) || valor <= 0) {
            return res.status(400).json({ error: 'Informe um valor maior que zero' });
        }
        const jaAlocado = contratacao.parcelas.reduce((s, p) => s + p.valor, 0);
        if (round2(jaAlocado + valor) > round2(contratacao.valor_contratado)) {
            return res.status(400).json({
                error: `Restam ${round2(contratacao.valor_contratado - jaAlocado)} do valor contratado; `
                    + 'a parcela não cabe.',
            });
        }

        const formaPagamento = formaPagamentoValida(req.body.forma_pagamento)
            || contratacao.parcelas.find(p => p.forma_pagamento)?.forma_pagamento
            || null;
        const cartao = formaPagamento === 'CARTAO_CREDITO'
            ? await resolverCartao(contratacao.tenant_id, formaPagamento, req.body.cartao_id)
            : null;

        res.status(201).json(await prisma.parcelaPagamento.create({
            data: {
                contratacao_id: contratacao.id,
                tipo: req.body.tipo && ['ENTRADA', 'SALDO', 'UNICA', 'PARCELA'].includes(req.body.tipo) ? req.body.tipo : 'PARCELA',
                percentual: contratacao.valor_contratado > 0 ? round2((valor / contratacao.valor_contratado) * 100) : 0,
                valor: round2(valor),
                data_prevista: req.body.data_prevista ? new Date(req.body.data_prevista) : null,
                forma_pagamento: formaPagamento,
                cartao_id: cartao?.id || null,
                cartao_bandeira: cartao?.bandeira || null,
                cartao_final: cartao?.final || null,
                cartao_apelido: cartao?.apelido || null,
            },
        }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Remove uma parcela ainda não paga. */
export async function removerParcela(req: Request, res: Response) {
    try {
        const parcela = await prisma.parcelaPagamento.findUnique({ where: { id: req.params.parcelaId } });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
        if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(parcela.status)) {
            return res.status(400).json({ error: `Parcela já está ${parcela.status} e não pode ser removida` });
        }
        await prisma.solicitacaoPagamento.deleteMany({ where: { parcela_id: parcela.id } });
        await prisma.parcelaPagamento.delete({ where: { id: parcela.id } });
        // Desfazer um adiantamento devolve o valor ao SALDO — o contrato com o
        // fornecedor continua o mesmo.
        await reconciliarSaldo(parcela.contratacao_id);
        res.json({ ok: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

const ROTULO_PARCELA: Record<string, string> = {
    ENTRADA: 'entrada', SALDO: 'saldo', UNICA: 'pagamento único', PARCELA: 'parcela',
};

const PARCELA_PAGA = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];

/**
 * E-mail de programação de pagamento ao fornecedor, no template corporativo da
 * LS Office (o mesmo do reembolso e da compra de material).
 *
 * Só monta e devolve — quem envia é a pessoa, colando no cliente de e-mail. Um
 * disparo automático de pagamento sem revisão humana não é algo que este
 * sistema deva fazer.
 */
export async function gerarEmailPagamento(req: Request, res: Response) {
    try {
        const parcela = await prisma.parcelaPagamento.findUnique({
            where: { id: req.params.parcelaId },
            include: {
                anexos: true,
                contratacao: {
                    include: {
                        supplier: true,
                        funcionario: true,
                        condicao: true,
                        parcelas: true,
                        atividade: {
                            select: {
                                codigo: true, titulo: true, sharing: true, operadora: true,
                                tipo_demanda: true,
                                id_site_sharing: true, id_site_operadora: true, municipio: true,
                                estado: true, responsavel: true, gestor: true, diretorio_url: true,
                                contratante: { select: { nome: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });

        const { contratacao } = parcela;
        const usuario = (req as any).user;
        if (!usuario || contratacao.tenant_id !== usuario.tenantId) return res.status(404).json({ error: 'Parcela não encontrada' });
        const { atividade } = contratacao;
        const processoTipo = normalizePaymentProcessType(parcela.processo_tipo, parcela.formalizacao_posterior);
        const formalizacao = processoTipo === 'PAYMENT_FORMALIZATION';
        // O e-mail É a solicitação ao financeiro: sem autonomia, não sai antes da aprovação.
        if (!formalizacao && parcela.status === 'PENDENTE') {
            const autorizacao = await autorizarParcela(req, parcela, contratacao);
            if (!autorizacao.liberado) return res.status(autorizacao.status).json(autorizacao);
        }
        const supplier = favorecidoDa(contratacao);
        const empresa = await prisma.empresaConfig.findUnique({ where: { tenant_id: usuario.tenantId }, include: { cartoes: { where: { ativo: true } } } });
        const formaPagamento = parcela.forma_pagamento || supplier.forma_pagamento;
        // Primeiro respeita o snapshot da obrigacao; somente registros antigos
        // sem snapshot usam o cartao ativo informado/agora padrao.
        const cartaoEscolhido = formaPagamento === 'CARTAO_CREDITO'
            ? (parcela.cartao_bandeira && parcela.cartao_final
                ? { bandeira: parcela.cartao_bandeira, final: parcela.cartao_final, apelido: parcela.cartao_apelido }
                : empresa?.cartoes.find(c => c.id === req.body?.cartao_id) || empresa?.cartoes[0] || null)
            : null;

        // Pago é o que já saiu do caixa; saldo é o que resta do contrato depois
        // desta programação. Comprometido ≠ pago (Blueprint, seção 14).
        const jaPago = round2(contratacao.parcelas
            .filter(p => p.id !== parcela.id && PARCELA_PAGA.includes(p.status))
            .reduce((soma, p) => soma + p.valor, 0));
        const saldo = round2(contratacao.valor_contratado - jaPago - parcela.valor);

        const condicao = contratacao.condicao
            ? `${contratacao.condicao.nome} — ${contratacao.condicao.percentual_entrada}% entrada / ${contratacao.condicao.percentual_saldo}% saldo`
            : `${parcela.percentual}% do contrato (${ROTULO_PARCELA[parcela.tipo] || parcela.tipo.toLowerCase()})`;

        const dados: DadosEmail = {
            tipo: formalizacao ? 'FORMALIZACAO_PAGAMENTO' : 'PROGRAMACAO_PAGAMENTO',
            logo_url: empresa?.logo_url ?? null,

            site: atividade.id_site_sharing || atividade.id_site_operadora || atividade.codigo,
            nome_site: [atividade.municipio, atividade.estado].filter(Boolean).join(' — ') || null,
            cliente: atividade.operadora || null,
            sharing: atividade.contratante?.nome || atividade.sharing,
            tipo_demanda: atividade.tipo_demanda,
            area: contratacao.finalidade,
            // Sem "responsavel pela solicitacao" da atividade: o gestor ali e da
            // contratante (Highline), e programar pagamento e responsabilidade da
            // LS Office. Quem solicita aparece na assinatura, no fim do e-mail.
            responsavel_solicitacao: req.body?.responsavel_solicitacao || null,
            // Fornecedor pelo nome comercial, que e como a LS se refere a ele; a
            // razao social vem completa em "Dados para pagamento", que e onde o
            // banco precisa dela.
            fornecedor: supplier.nome_exibicao,
            cpf_cnpj: supplier.documento,
            // `finalidade` e codigo de catalogo (OUTROS, MAO_DE_OBRA, CABO) e
            // entrava cru na frase: "referente a OUTROS — Implantacao Collo".
            // Usa o rotulo legivel, e quando a finalidade e generica nao repete.
            descricao: (() => {
                const alvo = getPaymentPurpose(contratacao.finalidade);
                const rotulo = alvo?.label || null;
                const titulo = atividade.titulo || '';
                if (!rotulo || alvo?.value === 'OUTROS') return titulo || rotulo || '';
                return titulo ? `${rotulo} — ${titulo}` : rotulo;
            })(),

            // O texto que quem contratou escreveu sobre ESTA contratação. A
            // descrição acima vem do catálogo e serve para qualquer mão de obra
            // da obra inteira; aqui é onde se lê que o prestador era o
            // serralheiro e o que ele fez.
            detalhamento: contratacao.observacoes || null,

            valor_total: contratacao.valor_contratado,
            valor_pago: jaPago > 0 ? jaPago : null,
            valor_pagamento: parcela.valor,
            saldo: saldo > 0 ? saldo : null,
            condicao_pagamento: condicao,
            condicao_liberacao_saldo: req.body?.condicao_liberacao_saldo
                || (saldo > 0 ? 'Conclusão da etapa contratada e aceite da fiscalização LS Office' : null),
            data_pagamento: req.body?.data_pagamento || parcela.data_prevista,

            // Dados bancários do fornecedor — é para ele que o dinheiro vai.
            favorecido: supplier.nome_exibicao,
            razao_social: supplier.nome,
            cpf_cnpj_pagamento: supplier.documento,
            forma_pagamento: formaPagamento,
            cartao: cartaoEscolhido
                ? { bandeira: cartaoEscolhido.bandeira, final: cartaoEscolhido.final, apelido: cartaoEscolhido.apelido }
                : null,
            banco: supplier.banco,
            agencia: supplier.agencia,
            conta: supplier.conta,
            tipo_conta: supplier.tipo_conta,
            pix: supplier.pix_pagamento,
            tipo_pix: supplier.pix_tipo,

            // Link da pasta da obra. Vem da atividade e pode ser ajustado no envio.
            link_diretorio: req.body?.link_diretorio ?? atividade.diretorio_url ?? null,
            observacoes: [
                formalizacao
                    ? `Pagamento realizado em ${parcela.data_pagamento?.toLocaleDateString('pt-BR') || parcela.data_compra_cartao?.toLocaleDateString('pt-BR') || 'data nao informada'}. Esta formalização não representa uma nova transferência ao fornecedor.`
                    : null,
                parcela.fatura_referencia ? `Referencia da fatura: ${parcela.fatura_referencia}.` : null,
                req.body?.observacoes || null,
            ].filter(Boolean).join('\n') || null,
            anexos: [...parcela.anexos.map(a => a.nome_original), ...(Array.isArray(req.body?.anexos) ? req.body.anexos : [])],

            // Fallback institucional. A assinatura pessoal do usuario autenticado
            // e aplicada depois, pelo compositor global.
            nome_solicitante: 'LS Office',
            cargo_solicitante: 'Engenharia',
            email_solicitante: null,
            telefone_solicitante: null,

            referencia: `${atividade.codigo} · ${contratacao.finalidade} · ${parcela.tipo}`,
        };

        const { assunto, html: htmlBase } = gerarEmailCorporativo(dados);
        const { html } = await composeEmailForUser(htmlBase, usuario, 'preview');
        const routing = await resolveEmailRouting(usuario.tenantId, processoTipo, {
            para: req.body?.para ?? req.body?.destinatario,
            cc: req.body?.cc,
        }, usuario.userId);
        const documentos = validateFormalizationDocuments(contratacao.finalidade, parcela.anexos.map(a => a.tipo));
        res.json({
            assunto,
            html,
            para: routing.para.join('; '),
            cc: routing.cc.join('; '),
            routing_pendente: routing.pendente,
            responsavel: { nome: usuario.nome || usuario.email, email: usuario.email },
            anexos: parcela.anexos.map(a => ({ id: a.id, nome: a.nome_original, tipo: a.tipo })),
            resumo: {
                fornecedor: supplier.nome_exibicao,
                razao_social: supplier.nome,
                valor_pagamento: parcela.valor,
                valor_total: contratacao.valor_contratado,
                valor_pago: jaPago,
                saldo: saldo > 0 ? saldo : 0,
                forma_pagamento: formaPagamento || null,
                cartao: cartaoEscolhido ? `${cartaoEscolhido.bandeira} •••• ${cartaoEscolhido.final}` : null,
                // No cartao nao faz falta conta do fornecedor.
                sem_dados_bancarios: formaPagamento !== 'CARTAO_CREDITO' && !supplier.banco && !supplier.pix_pagamento,
                processo_tipo: processoTipo,
                formalizacao_posterior: formalizacao,
                documentos_completos: !formalizacao || documentos.complete,
                documentos_pendentes: formalizacao ? documentos.missing : [],
                fatura_referencia: parcela.fatura_referencia,
                link_diretorio: req.body?.link_diretorio ?? atividade.diretorio_url ?? null,
            },
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Mesmo e-mail, empacotado como .eml. Abrir o arquivo no Outlook cria uma
 * mensagem NOVA, pronta para enviar — e o cabecalho X-Unsent e o que faz o
 * Outlook mostrar o botao Enviar em vez de tratar como mensagem recebida.
 */
export async function baixarEmailPagamentoEml(req: Request, res: Response) {
    try {
        const captura: any = {};
        const fake = {
            json: (corpo: any) => { Object.assign(captura, corpo); return fake; },
            status: (c: number) => { captura.__status = c; return fake; },
        };
        await gerarEmailPagamento(
            { ...req, user: (req as any).user, body: { ...(req.body || {}), ...(req.query || {}) } } as unknown as Request,
            fake as unknown as Response,
        );
        if (captura.error) return res.status(captura.__status || 400).json({ error: captura.error });

        const usuario = (req as any).user;
        const composto = await composeEmailForUser(captura.html, usuario, 'cid');
        const attachments = await Promise.all((captura.anexos || []).map((a: any) => loadPaymentAttachment(usuario.tenantId, a.id)));
        const eml = buildOutlookEml({ assunto: captura.assunto, para: captura.para, cc: captura.cc, html: composto.html, signature: composto.signature, attachments: attachments.map(a => ({
            filename: nomearAnexo({
                tipo: a.record.tipo,
                site: captura.resumo?.site || null,
                favorecido: captura.resumo?.fornecedor || null,
                nomeOriginal: a.record.nome_original,
            }),
            mimeType: a.record.mime_type,
            buffer: a.buffer,
        })) });

        const prefixo = captura.resumo?.formalizacao_posterior ? 'FORMALIZACAO_PAGAMENTO' : 'SOLICITACAO_PAGAMENTO';
        const nome = `${prefixo}_${String(captura.resumo?.fornecedor || 'FORNECEDOR')
            .normalize('NFD').replace(/[^\w]+/g, '_').toUpperCase().slice(0, 40)}.eml`;
        res.setHeader('Content-Type', 'message/rfc822; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
        res.send(eml);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Edita a contratação: valor, finalidade e detalhamento.
 *
 * Não mexe em parcela nenhuma. Reduzir o valor contratado abaixo do que já foi
 * pago deixaria o processo devendo a si mesmo, então isso é recusado com o
 * número na mão — quem decide o que fazer é quem está olhando o contrato.
 */
export async function editarContratacao(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const atual = await prisma.contratacaoFornecedor.findUnique({
            where: { id },
            include: { parcelas: true },
        });
        if (!atual) return res.status(404).json({ error: 'Contratação não encontrada' });

        const data: any = {};

        if (req.body.valor_contratado !== undefined) {
            const novo = Number(req.body.valor_contratado);
            if (!Number.isFinite(novo) || novo <= 0) {
                return res.status(400).json({ error: 'Valor contratado precisa ser maior que zero' });
            }
            const pago = atual.parcelas
                .filter(p => PARCELA_PAGA.includes(p.status))
                .reduce((s, p) => s + Number(p.valor || 0), 0);
            if (novo < pago) {
                return res.status(400).json({
                    error: `Já foram pagos ${moedaBR(pago)} nesta contratação. O valor contratado não pode ficar abaixo disso.`,
                });
            }
            // Baixar o contrato é absorvido pelo saldo em aberto. Abaixo do que
            // já está comprometido nas outras parcelas, não há o que encolher —
            // e aceitar deixaria a soma das parcelas maior que o contrato.
            const comprometido = round2(atual.parcelas
                .filter(p => !(p.tipo === 'SALDO' && p.status === 'PENDENTE'))
                .reduce((s, p) => s + Number(p.valor || 0), 0));
            if (round2(novo) < comprometido) {
                return res.status(400).json({
                    error: `As parcelas já lançadas somam ${moedaBR(comprometido)} fora do saldo em aberto. `
                        + `Reduza ou exclua essas parcelas antes de baixar o contrato para ${moedaBR(novo)}.`,
                });
            }
            data.valor_contratado = Math.round(novo * 100) / 100;
        }

        if (req.body.finalidade !== undefined) data.finalidade = String(req.body.finalidade);
        if (req.body.observacoes !== undefined) data.observacoes = req.body.observacoes || null;

        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada a alterar' });

        const contratacao = await prisma.contratacaoFornecedor.update({ where: { id }, data });
        await registrarAlteracao({
            tenant_id: atual.tenant_id,
            entidade: 'ContratacaoFornecedor',
            entidade_id: id,
            acao: data.valor_contratado !== undefined ? 'VALOR_ALTERADO' : 'DADOS_ALTERADOS',
            antes: { valor_contratado: atual.valor_contratado, finalidade: atual.finalidade, observacoes: atual.observacoes },
            depois: data,
            motivo: req.body.motivo || null,
            user_id: (req as any).user?.email || null,
        });
        // Mudou o valor: o saldo das parcelas precisa refletir o novo contrato.
        if (data.valor_contratado !== undefined) await reconciliarSaldo(id);
        res.json(contratacao);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Exclui a contratação inteira, com as parcelas e o contrato gerado.
 *
 * Recusa quando qualquer parcela já foi paga: pagamento efetuado é fato
 * financeiro, e apagá-lo esconderia dinheiro que saiu do caixa. Nesse caso o
 * caminho é cancelar a contratação, não excluir.
 */
export async function removerContratacao(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const atual = await prisma.contratacaoFornecedor.findUnique({
            where: { id },
            include: { parcelas: true, contrato: true },
        });
        if (!atual) return res.status(404).json({ error: 'Contratação não encontrada' });

        const pagas = atual.parcelas.filter(p => PARCELA_PAGA.includes(p.status));
        if (pagas.length > 0) {
            const total = pagas.reduce((s, p) => s + Number(p.valor || 0), 0);
            return res.status(400).json({
                error: `Esta contratação já tem ${pagas.length} pagamento(s) efetuados, somando ${moedaBR(total)}. Cancele a contratação em vez de excluí-la — apagar esconderia dinheiro que saiu do caixa.`,
            });
        }

        const idsParcelas = atual.parcelas.map(p => p.id);
        await prisma.$transaction(async tx => {
            if (idsParcelas.length) {
                await tx.paymentAttachment.deleteMany({ where: { parcela_id: { in: idsParcelas } } });
                await tx.solicitacaoPagamento.deleteMany({ where: { parcela_id: { in: idsParcelas } } });
                await tx.parcelaPagamento.deleteMany({ where: { id: { in: idsParcelas } } });
            }
            if (atual.contrato) {
                await tx.contratoArquivo.deleteMany({ where: { contrato_id: atual.contrato.id } });
                await tx.contrato.delete({ where: { id: atual.contrato.id } });
            }
            await tx.contratacaoFornecedor.delete({ where: { id } });
        });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}


/**
 * Histórico de alterações da contratação e das suas parcelas.
 *
 * Responde à pergunta que não tinha resposta: "onde ficou o comentário que eu
 * escrevi quando mudei o valor?".
 */
export async function historicoContratacao(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const c = await prisma.contratacaoFornecedor.findUnique({
            where: { id },
            include: { parcelas: { select: { id: true, tipo: true } } },
        });
        if (!c) return res.status(404).json({ error: 'Contratação não encontrada' });

        const alteracoes = await lerAlteracoes([id, ...c.parcelas.map(p => p.id)]);
        const tipoPorParcela = new Map(c.parcelas.map(p => [p.id, p.tipo]));
        res.json(alteracoes.map(a => ({
            ...a,
            // O histórico é lido por humano: dizer "ParcelaPagamento abc-123"
            // não ajuda ninguém a entender o que mudou.
            alvo: a.entidade === 'ContratacaoFornecedor' ? 'Contratação' : (tipoPorParcela.get(a.entidade_id) || 'Parcela'),
        })));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
