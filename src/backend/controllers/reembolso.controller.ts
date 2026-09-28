// Reembolso de despesa adiantada por fornecedor, prestador ou colaborador.
//
// Não é parcela de contrato: é gasto próprio de quem executou, que a LS devolve.
// Por isso vive fora de ContratacaoFornecedor e tem suas próprias despesas.

import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximaReferencia } from '../services/referencia-reembolso.service';
import { gerarEmailCorporativo, DadosEmail } from '../services/email-corporativo.service';
import { buildOutlookEml, composeEmailForUser } from '../services/email-signature.service';
import { excluirArquivoReembolso, obterArquivoReembolso, salvarArquivoReembolso } from '../services/reembolso-arquivo.service';
import { resolveEmailRouting } from '../services/email-routing.service';
import { loadPaymentAttachment } from '../services/payment-attachment.service';
import { nomearAnexo } from '../services/nomear-anexo.service';
import fs from 'fs/promises';

const CATEGORIAS = ['ALIMENTACAO', 'HOSPEDAGEM', 'COMBUSTIVEL', 'PEDAGIO', 'TRANSPORTE', 'MATERIAL', 'SERVICO', 'FRETE', 'OUTROS'];
const STATUS = ['PENDENTE', 'SOLICITADO', 'ENVIADO_FINANCEIRO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO', 'CANCELADO'];
const FORMAS_PAGAMENTO = ['PIX', 'TED', 'BOLETO', 'DINHEIRO'];

const cent = (v: number) => Math.round(v * 100) / 100;

/**
 * Campos de rateio de uma linha de despesa: onde foi gasto e quem recebeu.
 *
 * É por aqui que o dinheiro do adiantamento de projeto desce para a obra. Sem a
 * atividade, o custo fica parado no projeto e a margem da vistoria sai sem mão
 * de obra. O prestador pode ser funcionário da LS ou fornecedor externo — no
 * máximo um dos dois, como no resto do sistema.
 */
function camposDeRateio(d: any) {
    const funcionario_id = d.funcionario_id || null;
    const supplier_id = d.supplier_id || null;
    if (funcionario_id && supplier_id) {
        throw new Error(`A despesa "${d.descricao}" aponta para funcionário e fornecedor ao mesmo tempo`);
    }
    return { atividade_id: d.atividade_id || null, funcionario_id, supplier_id };
}

function somar(despesas: { valor: number }[]): number {
    return cent(despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0));
}

function comTotais(r: any) {
    const total = cent(Number(r.valor_total) || 0);
    const pagamentos = Array.isArray(r.pagamentos) ? r.pagamentos : [];
    const adiantado = r.natureza === 'ADIANTAMENTO' && pagamentos.length
        ? cent(pagamentos.reduce((s: number, p: any) => s + Number(p.valor || 0), 0))
        : cent(Number(r.valor_adiantado) || 0);
    const valorPago = pagamentos.length
        ? cent(pagamentos.filter((p: any) => ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status))
            .reduce((s: number, p: any) => s + Number(p.valor || 0), 0))
        : (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(r.status)
            ? cent(r.natureza === 'ADIANTAMENTO' ? adiantado : total) : 0);
    const saldo = r.natureza === 'ADIANTAMENTO' ? cent(adiantado - total) : 0;
    return {
        ...r,
        forma_pagamento: r.forma_pagamento || (r.pix_chave ? 'PIX' : 'TED'),
        valor_adiantado: r.natureza === 'ADIANTAMENTO' ? adiantado : r.valor_adiantado,
        valor_pago_total: valorPago,
        total_despesas: total,
        saldo_adiantamento: saldo,
        resultado_prestacao: r.natureza !== 'ADIANTAMENTO' ? null : saldo > 0 ? 'DEVOLVER' : saldo < 0 ? 'REEMBOLSAR' : 'QUITADO',
    };
}

export async function listReembolsos(req: Request, res: Response) {
    try {
        const atividade_id = req.query.atividade_id as string | undefined;
        const itens = await prisma.reembolso.findMany({
            where: atividade_id ? { atividade_id } : {},
            include: {
                despesas: {
                    orderBy: { ordem: 'asc' },
                    include: {
                        atividade: { select: { id: true, codigo: true, id_site_sharing: true } },
                        funcionario: { select: { id: true, nome: true } },
                        supplier: { select: { id: true, nome: true } },
                    },
                },
                supplier: { select: { id: true, nome: true } },
                funcionario: { select: { id: true, nome: true, cargo: true } },
                atividade: { select: { id: true, codigo: true, titulo: true } },
                acionamento: { select: { id: true, codigo: true, titulo: true } },
                pagamentos: {
                    include: { prestacoes: { select: { prestacao_id: true } } },
                    orderBy: { numero: 'asc' },
                },
                arquivos: { orderBy: { created_at: 'desc' } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(itens.map(comTotais));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function createReembolso(req: Request, res: Response) {
    try {
        const {
            atividade_id, supplier_id, funcionario_id, favorecido_nome, cpf_cnpj,
            motivo, data_despesa, despesas, natureza: naturezaInformada,
            valor_adiantado, destino, data_inicio_viagem, data_fim_viagem,
            data_solicitacao, data_prevista, forma_pagamento: formaInformada,
        } = req.body;
        // O processo nasce numa atividade OU num projeto (acionamento), nunca nos
        // dois. O adiantamento de projeto existe para o dinheiro que cobre várias
        // atividades — 25 vistorias pagas de uma vez — e só a prestação de contas
        // dirá quanto coube a cada uma.
        const acionamento_id = req.body.acionamento_id || null;
        if (!atividade_id && !acionamento_id) {
            return res.status(400).json({ error: 'Informe a atividade ou o projeto' });
        }
        if (atividade_id && acionamento_id) {
            return res.status(400).json({ error: 'Informe a atividade ou o projeto, não os dois' });
        }

        const atividade = atividade_id
            ? await prisma.atividade.findUnique({ where: { id: atividade_id } })
            : null;
        if (atividade_id && !atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        const projeto = acionamento_id
            ? await prisma.acionamento.findUnique({ where: { id: acionamento_id } })
            : null;
        if (acionamento_id && !projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

        // O tenant sai de quem existir dos dois.
        const donoTenantId = atividade?.tenant_id || projeto!.tenant_id;

        // O favorecido pode ser um fornecedor cadastrado ou uma pessoa avulsa.
        let nome = String(favorecido_nome || '').trim();
        let doc = cpf_cnpj || null;
        let dadosBanco: any = {};
        let formaPadrao: string | null = null;
        if (supplier_id) {
            const f = await prisma.supplier.findUnique({ where: { id: supplier_id } });
            if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado' });
            nome = nome || f.nome;
            doc = doc || f.cnpj || f.cpf;
            dadosBanco = { banco: f.banco, agencia: f.agencia, conta: f.conta, tipo_conta: f.tipo_conta, pix_tipo: f.pix_tipo, pix_chave: f.pix };
            formaPadrao = f.forma_pagamento || (f.pix ? 'PIX' : 'TED');
        }
        if (funcionario_id) {
            const f = await prisma.funcionario.findUnique({ where: { id: funcionario_id } });
            if (!f) return res.status(404).json({ error: 'Funcionário não encontrado' });
            nome = nome || f.nome;
            doc = doc || f.cpf;
            dadosBanco = { banco: f.banco, agencia: f.agencia, conta: f.conta, tipo_conta: f.tipo_conta, pix_tipo: f.pix_tipo, pix_chave: f.pix_chave };
            formaPadrao = f.forma_pagamento || (f.pix_chave ? 'PIX' : 'TED');
        }
        if (!nome) return res.status(400).json({ error: 'Informe o favorecido do reembolso' });
        const formaPagamento = String(formaInformada || formaPadrao || '').toUpperCase();
        if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
            return res.status(400).json({ error: 'Informe a forma de pagamento (PIX, TED, boleto ou dinheiro)' });
        }

        const natureza = naturezaInformada === 'ADIANTAMENTO' ? 'ADIANTAMENTO' : 'REEMBOLSO';
        const valorAdiantado = valor_adiantado == null ? null : cent(Number(valor_adiantado));
        if (natureza === 'ADIANTAMENTO' && (!valorAdiantado || valorAdiantado <= 0)) {
            return res.status(400).json({ error: 'Informe um valor de adiantamento maior que zero' });
        }
        if (data_inicio_viagem && data_fim_viagem && new Date(data_fim_viagem) < new Date(data_inicio_viagem)) {
            return res.status(400).json({ error: 'O fim da viagem não pode ser anterior ao início' });
        }

        const linhas = Array.isArray(despesas) ? despesas : [];
        for (const d of linhas) {
            if (!d.descricao) return res.status(400).json({ error: 'Toda despesa precisa de descrição' });
            const v = Number(d.valor);
            if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: `Valor inválido na despesa "${d.descricao}"` });
        }

        const reembolso = await prisma.reembolso.create({
            data: {
                codigo: await proximaReferencia(prisma, natureza),
                tenant_id: donoTenantId,
                atividade_id: atividade_id || null,
                acionamento_id,
                supplier_id: supplier_id || null,
                funcionario_id: funcionario_id || null,
                natureza,
                favorecido_nome: nome,
                cpf_cnpj: doc,
                motivo: motivo || null,
                data_despesa: data_despesa ? new Date(data_despesa) : null,
                valor_total: somar(linhas),
                valor_adiantado: natureza === 'ADIANTAMENTO' ? valorAdiantado : null,
                destino: natureza === 'ADIANTAMENTO' ? (destino || null) : null,
                data_inicio_viagem: natureza === 'ADIANTAMENTO' && data_inicio_viagem ? new Date(data_inicio_viagem) : null,
                data_fim_viagem: natureza === 'ADIANTAMENTO' && data_fim_viagem ? new Date(data_fim_viagem) : null,
                status_prestacao: natureza === 'ADIANTAMENTO' ? 'PENDENTE' : 'NAO_APLICAVEL',
                status: data_solicitacao ? 'SOLICITADO' : 'PENDENTE',
                data_solicitacao: data_solicitacao ? new Date(data_solicitacao) : null,
                data_prevista: data_prevista ? new Date(data_prevista) : null,
                forma_pagamento: formaPagamento,
                ...dadosBanco,
                pagamentos: {
                    create: [{
                        numero: 1,
                        valor: natureza === 'ADIANTAMENTO' ? Number(valorAdiantado) : somar(linhas),
                        forma_pagamento: formaPagamento,
                        status: data_solicitacao ? 'SOLICITADO' : 'PENDENTE',
                        data_solicitacao: data_solicitacao ? new Date(data_solicitacao) : null,
                        data_prevista: data_prevista ? new Date(data_prevista) : null,
                    }],
                },
                despesas: {
                    create: linhas.map((d: any, i: number) => ({
                        data: d.data ? new Date(d.data) : null,
                        descricao: String(d.descricao),
                        categoria: CATEGORIAS.includes(String(d.categoria || '').toUpperCase())
                            ? String(d.categoria).toUpperCase() : 'OUTROS',
                        valor: cent(Number(d.valor)),
                        anexo_url: d.anexo_url || null,
                        ordem: i,
                        ...camposDeRateio(d),
                    })),
                },
            },
            include: { despesas: { orderBy: { ordem: 'asc' } } },
        });

        res.status(201).json(comTotais(reembolso));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Edita cabeçalho, dados bancários e/ou substitui a lista de despesas. */
export async function updateReembolso(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolso.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Reembolso não encontrado' });
        if (atual.natureza !== 'ADIANTAMENTO' && ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(atual.status)) {
            const alteraConteudoFinanceiro = ['favorecido_nome', 'cpf_cnpj', 'motivo', 'data_despesa', 'despesas']
                .some(campo => req.body[campo] !== undefined);
            if (alteraConteudoFinanceiro) {
                return res.status(400).json({ error: `Reembolso já está ${atual.status}; favorecido, motivo, data e despesas não podem mais ser alterados` });
            }
        }
        if (atual.natureza === 'ADIANTAMENTO' && atual.status_prestacao === 'APROVADA') {
            return res.status(400).json({ error: 'Prestação já aprovada pelo financeiro; não pode ser alterada' });
        }

        const b = req.body;
        const dados: any = {};
        for (const campo of ['favorecido_nome', 'cpf_cnpj', 'motivo', 'banco', 'agencia', 'conta', 'tipo_conta', 'pix_tipo', 'pix_chave', 'comprovante_url']) {
            if (b[campo] !== undefined) dados[campo] = b[campo];
        }
        if (b.data_despesa !== undefined) dados.data_despesa = b.data_despesa ? new Date(b.data_despesa) : null;
        if (b.data_prevista !== undefined) dados.data_prevista = b.data_prevista ? new Date(b.data_prevista) : null;
        if (b.data_solicitacao !== undefined) {
            dados.data_solicitacao = b.data_solicitacao ? new Date(b.data_solicitacao) : null;
            if (b.data_solicitacao && atual.status === 'PENDENTE') dados.status = 'SOLICITADO';
        }
        if (b.forma_pagamento !== undefined) {
            const forma = String(b.forma_pagamento || '').toUpperCase();
            if (!FORMAS_PAGAMENTO.includes(forma)) return res.status(400).json({ error: 'Forma de pagamento inválida' });
            dados.forma_pagamento = forma;
        }
        if (b.destino !== undefined) dados.destino = b.destino || null;
        if (b.data_inicio_viagem !== undefined) dados.data_inicio_viagem = b.data_inicio_viagem ? new Date(b.data_inicio_viagem) : null;
        if (b.data_fim_viagem !== undefined) dados.data_fim_viagem = b.data_fim_viagem ? new Date(b.data_fim_viagem) : null;

        if (Array.isArray(b.despesas)) {
            for (const d of b.despesas) {
                const v = Number(d.valor);
                if (!d.descricao) return res.status(400).json({ error: 'Toda despesa precisa de descrição' });
                if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: `Valor inválido na despesa "${d.descricao}"` });
            }
            // A linha de rateio só pode apontar para uma atividade DO PRÓPRIO
            // processo: num adiantamento de projeto, para uma das atividades
            // agrupadas nele; num reembolso de atividade, para ela mesma.
            // Sem isto, o custo de uma vistoria da Oi poderia cair numa obra da
            // Claro, e a margem das duas sairia errada sem ninguém notar.
            const alvos = [...new Set(b.despesas.map((d: any) => d.atividade_id).filter(Boolean))] as string[];
            if (alvos.length) {
                const permitidas = atual.acionamento_id
                    ? (await prisma.atividade.findMany({
                        where: { acionamento_id: atual.acionamento_id }, select: { id: true },
                    })).map(a => a.id)
                    : (atual.atividade_id ? [atual.atividade_id] : []);
                const forA = alvos.filter(id => !permitidas.includes(id));
                if (forA.length) {
                    return res.status(400).json({
                        error: atual.acionamento_id
                            ? 'Há despesa apontando para atividade que não pertence a este projeto'
                            : 'Há despesa apontando para outra atividade; este processo é de uma atividade só',
                    });
                }
            }

            await prisma.reembolsoDespesa.deleteMany({ where: { reembolso_id: atual.id } });
            dados.despesas = {
                create: b.despesas.map((d: any, i: number) => ({
                    data: d.data ? new Date(d.data) : null,
                    descricao: String(d.descricao),
                    categoria: CATEGORIAS.includes(String(d.categoria || '').toUpperCase())
                        ? String(d.categoria).toUpperCase() : 'OUTROS',
                    valor: cent(Number(d.valor)),
                    anexo_url: d.anexo_url || null,
                    ordem: i,
                    ...camposDeRateio(d),
                })),
            };
            dados.valor_total = somar(b.despesas);
            if (atual.natureza === 'ADIANTAMENTO') {
                // Prestar contas de mais do que se recebeu é erro de digitação,
                // não um reembolso extra: o saldo a reembolsar tem caminho
                // próprio, e aceitar aqui esconderia o engano.
                const recebido = cent(Number(atual.valor_adiantado) || 0);
                const prestado = somar(b.despesas);
                if (recebido > 0 && prestado > recebido) {
                    return res.status(400).json({
                        error: `As despesas somam ${moedaBR(prestado)} e o adiantamento foi de ${moedaBR(recebido)}. Confira os valores.`,
                    });
                }
                dados.status_prestacao = 'EM_PREENCHIMENTO';
            }
        }

        const atualizado = await prisma.reembolso.update({
            where: { id: atual.id },
            data: dados,
            include: { despesas: { orderBy: { ordem: 'asc' } } },
        });
        res.json(comTotais(atualizado));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Estados em que o dinheiro já saiu do caixa. */
export const PAGAMENTO_CONCLUIDO = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];

/** Para mensagens de erro: o valor precisa aparecer do jeito que o usuário lê. */
function moedaBR(v: number): string {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function sincronizarResumoPagamentos(reembolsoId: string) {
    const r = await prisma.reembolso.findUnique({
        where: { id: reembolsoId },
        include: { pagamentos: { orderBy: { numero: 'asc' } } },
    });
    if (!r) return;
    if (!r.pagamentos.length) {
        await prisma.reembolso.update({
            where: { id: reembolsoId },
            data: {
                status: 'PENDENTE',
                valor_adiantado: r.natureza === 'ADIANTAMENTO' ? 0 : undefined,
                data_solicitacao: null,
                data_prevista: null,
                data_pagamento: null,
                comprovante_url: null,
            },
        });
        return;
    }
    const pagos = r.pagamentos.filter(p => ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status));
    const todosPagos = pagos.length === r.pagamentos.length;
    const primeiro = r.pagamentos[0];
    const ultimoPagamento = [...pagos].sort((a, b) => (b.data_pagamento?.getTime() || 0) - (a.data_pagamento?.getTime() || 0))[0];
    const status = todosPagos
        ? (r.pagamentos.every(p => p.status === 'CONFERIDO') ? 'CONFERIDO'
            : r.pagamentos.every(p => Boolean(p.comprovante_url)) ? 'COMPROVANTE_RECEBIDO' : 'PAGO')
        : r.pagamentos.some(p => p.status !== 'PENDENTE') ? 'AGUARDANDO_PAGAMENTO' : 'PENDENTE';
    await prisma.reembolso.update({
        where: { id: reembolsoId },
        data: {
            status,
            valor_adiantado: r.natureza === 'ADIANTAMENTO'
                ? cent(r.pagamentos.reduce((s, p) => s + p.valor, 0)) : undefined,
            forma_pagamento: primeiro.forma_pagamento,
            data_solicitacao: primeiro.data_solicitacao,
            data_prevista: r.pagamentos.map(p => p.data_prevista).filter(Boolean).sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null,
            data_pagamento: todosPagos ? (ultimoPagamento?.data_pagamento || null) : null,
            comprovante_url: r.pagamentos.length === 1 ? primeiro.comprovante_url : null,
        },
    });
}

export async function criarPagamentoReembolso(req: Request, res: Response) {
    try {
        const reembolso = await prisma.reembolso.findUnique({
            where: { id: req.params.id }, include: { pagamentos: true },
        });
        if (!reembolso) return res.status(404).json({ error: 'Reembolso ou adiantamento não encontrado' });
        const valor = cent(Number(req.body.valor));
        if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe um valor maior que zero' });
        const forma = String(req.body.forma_pagamento || reembolso.forma_pagamento || '').toUpperCase();
        if (!FORMAS_PAGAMENTO.includes(forma)) return res.status(400).json({ error: 'Forma de pagamento inválida' });
        if (reembolso.natureza === 'REEMBOLSO') {
            const programado = cent(reembolso.pagamentos.reduce((s, p) => s + p.valor, 0));
            if (cent(programado + valor) > cent(reembolso.valor_total)) {
                return res.status(400).json({ error: `Os depósitos não podem ultrapassar o valor do reembolso (${reembolso.valor_total.toFixed(2)})` });
            }
        }
        const numero = Math.max(0, ...reembolso.pagamentos.map(p => p.numero)) + 1;
        const pagamento = await prisma.reembolsoPagamento.create({
            data: {
                reembolso_id: reembolso.id, numero, valor, forma_pagamento: forma,
                status: req.body.data_solicitacao ? 'SOLICITADO' : 'PENDENTE',
                data_solicitacao: req.body.data_solicitacao ? new Date(req.body.data_solicitacao) : null,
                data_prevista: req.body.data_prevista ? new Date(req.body.data_prevista) : null,
                observacoes: req.body.observacoes || null,
            },
        });
        await sincronizarResumoPagamentos(reembolso.id);
        res.status(201).json(pagamento);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function atualizarPagamentoReembolso(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolsoPagamento.findUnique({
            where: { id: req.params.pagamentoId },
            include: { reembolso: { include: { pagamentos: true, despesas: true } }, prestacoes: true },
        });
        if (!atual) return res.status(404).json({ error: 'Depósito não encontrado' });
        const dados: any = {};
        let novoTotalReembolso: number | null = null;
        let despesaUnicaParaAjustar: string | null = null;
        if (req.body.valor !== undefined) {
            if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(atual.status) || atual.prestacoes.length) {
                return res.status(400).json({ error: 'O valor de um depósito pago ou já incluído em prestação não pode ser alterado' });
            }
            const valor = cent(Number(req.body.valor));
            if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe um valor maior que zero' });
            if (atual.reembolso.natureza === 'REEMBOLSO') {
                const outros = atual.reembolso.pagamentos.filter(p => p.id !== atual.id).reduce((s, p) => s + p.valor, 0);
                const novoProgramado = cent(outros + valor);
                if (novoProgramado > cent(atual.reembolso.valor_total)) {
                    const despesaUnica = atual.reembolso.despesas.length === 1
                        && cent(atual.reembolso.despesas[0].valor) === cent(atual.reembolso.valor_total);
                    const depositoUnico = atual.reembolso.pagamentos.length === 1;
                    if (!depositoUnico || !despesaUnica) {
                        return res.status(400).json({
                            error: 'O novo valor supera o total detalhado do reembolso. Ajuste primeiro as despesas/memória de cálculo do processo.',
                        });
                    }
                    // No reembolso simples, a única despesa, o total do processo e o
                    // único depósito representam o mesmo valor. A correção deve manter
                    // os três sincronizados, em vez de bloquear a edição solicitada.
                    novoTotalReembolso = novoProgramado;
                    despesaUnicaParaAjustar = atual.reembolso.despesas[0].id;
                }
            }
            dados.valor = valor;
        }
        if (req.body.forma_pagamento !== undefined) {
            const forma = String(req.body.forma_pagamento || '').toUpperCase();
            if (!FORMAS_PAGAMENTO.includes(forma)) return res.status(400).json({ error: 'Forma de pagamento inválida' });
            dados.forma_pagamento = forma;
        }
        for (const campo of ['data_solicitacao', 'data_prevista', 'data_pagamento']) {
            if (req.body[campo] !== undefined) dados[campo] = req.body[campo] ? new Date(req.body[campo]) : null;
        }
        if (req.body.observacoes !== undefined) dados.observacoes = req.body.observacoes || null;
        if (atual.status === 'PENDENTE' && dados.data_solicitacao) dados.status = 'SOLICITADO';
        const pagamento = await prisma.$transaction(async tx => {
            if (novoTotalReembolso !== null) {
                await tx.reembolso.update({
                    where: { id: atual.reembolso_id },
                    data: { valor_total: novoTotalReembolso },
                });
                if (despesaUnicaParaAjustar) {
                    await tx.reembolsoDespesa.update({
                        where: { id: despesaUnicaParaAjustar },
                        data: { valor: novoTotalReembolso },
                    });
                }
            }
            return tx.reembolsoPagamento.update({ where: { id: atual.id }, data: dados });
        });
        await sincronizarResumoPagamentos(atual.reembolso_id);
        res.json(pagamento);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function atualizarStatusPagamentoReembolso(req: Request, res: Response) {
    try {
        const status = String(req.body.status || '');
        if (!STATUS.includes(status) || status === 'CANCELADO') return res.status(400).json({ error: 'Status de depósito inválido' });
        const atual = await prisma.reembolsoPagamento.findUnique({ where: { id: req.params.pagamentoId } });
        if (!atual) return res.status(404).json({ error: 'Depósito não encontrado' });
        const concluido = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(status);
        const pagamento = await prisma.reembolsoPagamento.update({
            where: { id: atual.id }, data: {
                status,
                // Voltar para PENDENTE desfaz a solicitação: as datas do ciclo
                // anterior têm de sair junto, senão o depósito fica "pendente"
                // exibindo uma data de solicitação que não vale mais — que é
                // como a parcela de contratação já se comporta ao cancelar.
                data_solicitacao: status === 'PENDENTE' ? null
                    : status === 'SOLICITADO' ? (atual.data_solicitacao || new Date()) : undefined,
                data_pagamento: status === 'PENDENTE' ? null
                    : concluido ? (atual.data_pagamento || new Date()) : undefined,
            },
        });
        await sincronizarResumoPagamentos(atual.reembolso_id);
        res.json(pagamento);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function excluirPagamentoReembolso(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolsoPagamento.findUnique({ where: { id: req.params.pagamentoId }, include: { prestacoes: true } });
        if (!atual) return res.status(404).json({ error: 'Depósito não encontrado' });
        if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(atual.status) || atual.prestacoes.length) {
            return res.status(400).json({ error: 'Depósito pago ou incluído em prestação não pode ser excluído' });
        }
        await prisma.reembolsoPagamento.delete({ where: { id: atual.id } });
        await sincronizarResumoPagamentos(atual.reembolso_id);
        res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function anexarMemoriaCalculo(req: Request, res: Response) {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo para anexar' });
        res.status(201).json(await salvarArquivoReembolso(req.params.id, req.file, (req as any).user?.email));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function baixarArquivoReembolso(req: Request, res: Response) {
    try {
        const { arquivo, caminho } = await obterArquivoReembolso(req.params.arquivoId);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.download(caminho, arquivo.nome_original);
    } catch (e: any) { res.status(404).json({ error: e.message }); }
}

export async function removerArquivoReembolso(req: Request, res: Response) {
    try {
        await excluirArquivoReembolso(req.params.arquivoId);
        res.status(204).send();
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function atualizarStatusReembolso(req: Request, res: Response) {
    try {
        const { status } = req.body;
        if (!STATUS.includes(status)) {
            return res.status(400).json({ error: `Status inválido. Use: ${STATUS.join(', ')}` });
        }
        const atual = await prisma.reembolso.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Reembolso não encontrado' });
        const pagamentoConcluido = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(status);
        res.json(await prisma.reembolso.update({
            where: { id: req.params.id },
            data: {
                status,
                data_pagamento: pagamentoConcluido ? (atual.data_pagamento || new Date()) : undefined,
                data_solicitacao: status === 'SOLICITADO' ? new Date() : undefined,
                status_prestacao: pagamentoConcluido && atual.natureza === 'ADIANTAMENTO' && atual.status_prestacao === 'NAO_APLICAVEL'
                    ? 'PENDENTE' : undefined,
            },
            include: { despesas: { orderBy: { ordem: 'asc' } } },
        }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function enviarPrestacaoContas(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolso.findUnique({
            where: { id: req.params.id },
            include: {
                despesas: { orderBy: { ordem: 'asc' } },
                pagamentos: { include: { prestacoes: true }, orderBy: { numero: 'asc' } },
                arquivos: true,
            },
        });
        if (!atual) return res.status(404).json({ error: 'Adiantamento não encontrado' });
        if (atual.natureza !== 'ADIANTAMENTO') return res.status(400).json({ error: 'Este lançamento não é um adiantamento de viagem' });
        if (!['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(atual.status)) {
            return res.status(400).json({ error: 'A prestação só pode ser enviada depois que o adiantamento for pago' });
        }
        if (atual.despesas.length === 0 || atual.valor_total <= 0) {
            return res.status(400).json({ error: 'Inclua ao menos uma despesa antes de enviar a prestação' });
        }
        const atualizado = await prisma.reembolso.update({
            where: { id: atual.id },
            data: { status_prestacao: 'ENVIADA', prestacao_enviada_em: new Date(), parecer_financeiro: null },
            include: { despesas: { orderBy: { ordem: 'asc' } } },
        });
        res.json(comTotais(atualizado));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function analisarPrestacaoContas(req: Request, res: Response) {
    try {
        const status = String(req.body.status || '');
        if (!['APROVADA', 'AJUSTES_SOLICITADOS'].includes(status)) {
            return res.status(400).json({ error: 'Use APROVADA ou AJUSTES_SOLICITADOS' });
        }
        const atual = await prisma.reembolso.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Adiantamento não encontrado' });
        if (atual.natureza !== 'ADIANTAMENTO' || !['ENVIADA', 'EM_ANALISE', 'AJUSTES_SOLICITADOS'].includes(atual.status_prestacao)) {
            return res.status(400).json({ error: 'A prestação ainda não foi enviada para análise financeira' });
        }
        const parecer = String(req.body.parecer_financeiro || '').trim();
        if (status === 'AJUSTES_SOLICITADOS' && parecer.length < 5) {
            return res.status(400).json({ error: 'Descreva os ajustes solicitados pelo financeiro' });
        }
        const atualizado = await prisma.reembolso.update({
            where: { id: atual.id },
            data: {
                status_prestacao: status,
                parecer_financeiro: parecer || null,
                prestacao_conferida_em: status === 'APROVADA' ? new Date() : null,
                prestacao_conferida_por: status === 'APROVADA'
                    ? ((req as any).user?.email || req.body.conferida_por || 'Financeiro')
                    : null,
            },
            include: { despesas: { orderBy: { ordem: 'asc' } } },
        });
        res.json(comTotais(atualizado));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Exclui o reembolso/adiantamento inteiro.
 *
 * O status do cabeçalho não bastava como guarda. Ele é derivado dos depósitos,
 * e fica `AGUARDANDO_PAGAMENTO` enquanto um depósito já está `PAGO` — ou seja,
 * dinheiro que saiu do caixa passava pela verificação. A conferência agora olha
 * os depósitos, que é onde o pagamento de fato acontece.
 *
 * O vínculo com prestação de contas também precisa de guarda própria:
 * `PrestacaoContasPagamento` aponta para o depósito sem `onDelete: Cascade`, e
 * sem esta checagem o banco recusava com erro cru de chave estrangeira, sem
 * dizer ao usuário o que estava errado.
 */
export async function deleteReembolso(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolso.findUnique({
            where: { id: req.params.id },
            include: { pagamentos: { include: { prestacoes: true } } },
        });
        if (!atual) return res.status(404).json({ error: 'Reembolso não encontrado' });

        const rotulo = atual.natureza === 'ADIANTAMENTO' ? 'adiantamento' : 'reembolso';
        const pagos = atual.pagamentos.filter(p => PAGAMENTO_CONCLUIDO.includes(p.status));
        if (pagos.length > 0) {
            const total = pagos.reduce((soma, p) => soma + Number(p.valor || 0), 0);
            return res.status(400).json({
                error: `Este ${rotulo} já tem ${pagos.length} depósito(s) efetuados, somando ${moedaBR(total)}. Cancele em vez de excluir — apagar esconderia dinheiro que saiu do caixa.`,
            });
        }
        if (PAGAMENTO_CONCLUIDO.includes(atual.status)) {
            return res.status(400).json({ error: `Este ${rotulo} já está ${atual.status} e não pode ser excluído; cancele com justificativa` });
        }
        const emPrestacao = atual.pagamentos.filter(p => p.prestacoes.length > 0);
        if (emPrestacao.length > 0) {
            return res.status(400).json({
                error: `${emPrestacao.length} depósito(s) deste ${rotulo} estão vinculados a uma prestação de contas consolidada. Desvincule a prestação antes de excluir.`,
            });
        }

        // Despesas, depósitos e arquivos saem por cascata do schema; as despesas
        // continuam explícitas porque o registro é antigo e pode ter linha órfã.
        await prisma.reembolsoDespesa.deleteMany({ where: { reembolso_id: atual.id } });
        await prisma.reembolso.delete({ where: { id: atual.id } });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Monta o e-mail corporativo do reembolso, sem enviar. */
export async function gerarEmailReembolso(req: Request, res: Response) {
    try {
        const r = await prisma.reembolso.findUnique({
            where: { id: req.params.id },
            include: {
                despesas: { orderBy: { ordem: 'asc' } },
                supplier: true,
                funcionario: true,
                pagamentos: { orderBy: { numero: 'asc' }, include: { anexos: true } },
                arquivos: { orderBy: { created_at: 'asc' } },
                atividade: { include: { contratante: { select: { nome: true } } } },
                acionamento: { include: { contratante: { select: { nome: true } } } },
            },
        });
        if (!r) return res.status(404).json({ error: 'Reembolso não encontrado' });
        const usuario = (req as any).user;
        if (!usuario || r.tenant_id !== usuario.tenantId) return res.status(404).json({ error: 'Reembolso não encontrado' });

        const empresa = await prisma.empresaConfig.findUnique({ where: { tenant_id: usuario.tenantId } });
        // O processo pode pertencer a uma atividade ou a um projeto. Os dois
        // respondem às mesmas perguntas do e-mail — site, cliente, contratante,
        // código —, então uma origem só alimenta o template.
        const projeto = r.acionamento;
        const a = r.atividade ?? {
            codigo: projeto?.codigo ?? '',
            titulo: projeto?.titulo ?? '',
            id_site_sharing: projeto?.id_site_sharing ?? null,
            id_site_operadora: projeto?.id_site_operadora ?? null,
            // Um projeto agrupa vistorias de operadoras possivelmente diferentes;
            // não se inventa uma.
            operadora: null,
            sharing: projeto?.contratante?.nome ?? '',
            contratante: projeto?.contratante ?? null,
            // O projeto não tem modelo de operação próprio: quem paga precisa
            // saber que é OPERAÇÃO, que é o caso de todo lote de vistoria.
            tipo_demanda: 'OPERACAO',
            diretorio_url: null,
        } as any;
        const adiantamento = r.natureza === 'ADIANTAMENTO';
        const pagamentoId = req.body?.pagamento_id || req.query?.pagamento_id;
        const pagamento = pagamentoId ? r.pagamentos.find(p => p.id === pagamentoId) : null;
        if (pagamentoId && !pagamento) return res.status(404).json({ error: 'Depósito não encontrado neste processo' });
        const valorPagamento = pagamento?.valor ?? (adiantamento ? Number(r.valor_adiantado || 0) : r.valor_total);
        // O registro financeiro preserva o snapshot historico, mas toda nova
        // geracao de e-mail deve consultar o cadastro mestre atual. Assim uma
        // correcao de PIX aparece mesmo quando o comprovante ja foi recebido.
        const mestre: any = r.funcionario || r.supplier;
        const nomeMestre = mestre?.nome || r.favorecido_nome;
        const documentoMestre = r.funcionario
            ? r.funcionario.cpf
            : (r.supplier ? (r.supplier.tipo === 'PESSOA_FISICA' ? r.supplier.cpf : (r.supplier.cnpj || r.supplier.cpf)) : null);
        const pixMestre = r.funcionario?.pix_chave || r.supplier?.pix || null;
        const nomePagamento = mestre ? nomeMestre : r.favorecido_nome;
        const documentoPagamento = mestre ? (documentoMestre || r.cpf_cnpj) : r.cpf_cnpj;
        const bancoPagamento = mestre ? (mestre.banco || null) : r.banco;
        const agenciaPagamento = mestre ? (mestre.agencia || null) : r.agencia;
        const contaPagamento = mestre ? (mestre.conta || null) : r.conta;
        const tipoContaPagamento = mestre ? (mestre.tipo_conta || null) : r.tipo_conta;
        const tipoPixPagamento = mestre ? (mestre.pix_tipo || null) : r.pix_tipo;
        const pixPagamento = mestre ? pixMestre : r.pix_chave;

        const dados: DadosEmail = {
            tipo: adiantamento ? 'ADIANTAMENTO' : 'REEMBOLSO',
            logo_url: empresa?.logo_url || null,
            site: a.id_site_sharing || a.codigo,
            nome_site: a.id_site_operadora || null,
            cliente: a.operadora || null,
            sharing: a.contratante?.nome || a.sharing,
            tipo_demanda: a.tipo_demanda,
            area: null,
            responsavel_solicitacao: null,
            nome_colaborador: nomePagamento,
            cpf_colaborador: documentoPagamento,
            descricao: r.motivo,
            motivo_reembolso: r.motivo,
            data_despesa: r.data_despesa,
            itens_reembolso: adiantamento ? [] : r.despesas.map(d => ({
                data: d.data, descricao: d.descricao, categoria: d.categoria, valor: d.valor,
            })),
            // `valor_total` é o total do processo, e não o deste depósito — o
            // template rotula esse campo como "Valor total contratado". Passar o
            // valor do depósito aqui fazia um reembolso de R$ 325 sobre um
            // serviço de R$ 650 sair como se o contratado fosse R$ 325, com
            // saldo zerado: quem lê fecha o serviço como quitado.
            valor_total: adiantamento ? Number(r.valor_adiantado || 0) : r.valor_total,
            valor_pagamento: valorPagamento,
            // Já pago = depósitos anteriores a este; o saldo sai da subtração.
            valor_pago: r.pagamentos
                .filter(p => p.numero < (pagamento?.numero ?? Number.MAX_SAFE_INTEGER))
                .reduce((soma, p) => soma + Number(p.valor || 0), 0),
            data_pagamento: pagamento?.data_prevista || r.data_prevista,
            favorecido: nomePagamento,
            cpf_cnpj_pagamento: documentoPagamento,
            banco: bancoPagamento,
            agencia: agenciaPagamento,
            conta: contaPagamento,
            tipo_conta: tipoContaPagamento,
            pix: pixPagamento,
            tipo_pix: tipoPixPagamento,
            forma_pagamento: pagamento?.forma_pagamento || r.forma_pagamento || (pixPagamento ? 'PIX' : 'TED'),
            // O diretório pertence à atividade e indica ao financeiro onde os
            // comprovantes, memória de cálculo e demais arquivos serão salvos.
            // O override mantém a prévia/EML utilizável enquanto o cadastro da
            // atividade ainda estiver sendo completado.
            link_diretorio: req.body?.link_diretorio ?? a.diretorio_url ?? null,
            observacoes: req.body?.observacoes || null,
            anexos: [
                (pagamento?.comprovante_url || r.comprovante_url) ? 'Comprovante do pagamento anexado ao sistema' : null,
                !adiantamento && r.despesas.some(d => d.anexo_url) ? 'Comprovantes das despesas' : null,
                ...r.arquivos.map(a => a.nome_original),
                ...(pagamento?.anexos || []).map(a => a.nome_original),
            ].filter(Boolean) as string[],
            // Fallback institucional; o compositor global aplica a assinatura
            // pessoal do usuario autenticado quando houver uma ativa.
            nome_solicitante: 'LS Office',
            cargo_solicitante: 'Engenharia',
            email_solicitante: null,
            telefone_solicitante: null,
            // Lancamentos antigos ainda nao tem codigo; ate o backfill rodar eles
            // caem no fragmento de UUID, que era o comportamento anterior.
            referencia: `${r.codigo || `${adiantamento ? 'Adiantamento' : 'Reembolso'} ${r.id.slice(0, 8)}`}${pagamento ? ` · Depósito ${pagamento.numero}` : ''} · ${a.codigo} · gerado pelo LS Office ERP`,
        };

        const { assunto, html: htmlBase } = gerarEmailCorporativo(dados);
        const { html } = await composeEmailForUser(htmlBase, usuario, 'preview');
        const routing = await resolveEmailRouting(usuario.tenantId, 'PAYMENT_REQUEST', {
            para: req.body?.para ?? req.body?.destinatario,
            cc: req.body?.cc,
        });
        // A previa sempre reflete os dados mestres atuais do favorecido. Impedir
        // cache evita que uma chave PIX corrigida seja substituida por uma
        // resposta antiga mantida pelo navegador ou por algum proxy local.
        (res as any).setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        (res as any).setHeader?.('Pragma', 'no-cache');
        res.json({
            assunto,
            html,
            para: routing.para.join('; '),
            cc: routing.cc.join('; '),
            routing_pendente: routing.pendente,
            responsavel: { nome: usuario.nome || usuario.email, email: usuario.email },
            anexos: [
                ...r.arquivos.map(a => ({ origem: 'REEMBOLSO', id: a.id, nome: a.nome_original, tipo: a.tipo })),
                ...(pagamento?.anexos || []).map(a => ({ origem: 'PAGAMENTO', id: a.id, nome: a.nome_original, tipo: a.tipo })),
            ],
            valor_total: valorPagamento,
            resumo: {
                natureza: r.natureza,
                favorecido: nomePagamento,
                forma_pagamento: dados.forma_pagamento,
                comprovante_anexado: Boolean(pagamento?.comprovante_url || r.comprovante_url),
                pagamento_id: pagamento?.id || null,
                deposito_numero: pagamento?.numero || null,
            },
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Baixa a solicitação como rascunho .eml para revisão e envio no Outlook. */
export async function baixarEmailReembolsoEml(req: Request, res: Response) {
    try {
        const captura: any = {};
        const fake = {
            json: (corpo: any) => { Object.assign(captura, corpo); return fake; },
            status: (codigo: number) => { captura.__status = codigo; return fake; },
        };
        await gerarEmailReembolso(
            { ...req, user: (req as any).user, body: { ...(req.body || {}), ...(req.query || {}) } } as unknown as Request,
            fake as unknown as Response,
        );
        if (captura.error) return res.status(captura.__status || 400).json({ error: captura.error });

        const usuario = (req as any).user;
        const composto = await composeEmailForUser(captura.html, usuario, 'cid');
        // O arquivo chega com o nome que o celular deu e é assim que ele cai na
        // pasta do financeiro. Renomear na saída entrega algo já arquivável.
        const contexto = {
            site: captura.resumo?.site || null,
            favorecido: captura.resumo?.favorecido || null,
        };
        const anexos = await Promise.all((captura.anexos || []).map(async (a: any) => {
            if (a.origem === 'PAGAMENTO') {
                const loaded = await loadPaymentAttachment(usuario.tenantId, a.id);
                return {
                    filename: nomearAnexo({ ...contexto, tipo: loaded.record.tipo, nomeOriginal: loaded.record.nome_original }),
                    mimeType: loaded.record.mime_type,
                    buffer: loaded.buffer,
                };
            }
            const loaded = await obterArquivoReembolso(a.id);
            return {
                filename: nomearAnexo({ ...contexto, tipo: 'MEMORIA_CALCULO', nomeOriginal: loaded.arquivo.nome_original }),
                mimeType: loaded.arquivo.mime_type,
                buffer: await fs.readFile(loaded.caminho),
            };
        }));
        const eml = buildOutlookEml({ assunto: captura.assunto, para: captura.para, cc: captura.cc, html: composto.html, signature: composto.signature, attachments: anexos });
        const prefixo = captura.resumo?.natureza === 'ADIANTAMENTO' ? 'ADIANTAMENTO' : 'REEMBOLSO';
        const favorecido = String(captura.resumo?.favorecido || 'FAVORECIDO')
            .normalize('NFD').replace(/[^\w]+/g, '_').toUpperCase().slice(0, 40);
        res.setHeader('Content-Type', 'message/rfc822; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${prefixo}_${favorecido}.eml"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.send(eml);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
