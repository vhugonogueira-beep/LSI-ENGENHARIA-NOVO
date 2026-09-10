// Reembolso de despesa adiantada por fornecedor, prestador ou colaborador.
//
// Não é parcela de contrato: é gasto próprio de quem executou, que a LS devolve.
// Por isso vive fora de ContratacaoFornecedor e tem suas próprias despesas.

import { Request, Response } from 'express';
import { prisma } from '../server';
import { gerarEmailCorporativo, DadosEmail } from '../services/email-corporativo.service';
import { excluirArquivoReembolso, obterArquivoReembolso, salvarArquivoReembolso } from '../services/reembolso-arquivo.service';

const CATEGORIAS = ['ALIMENTACAO', 'HOSPEDAGEM', 'COMBUSTIVEL', 'PEDAGIO', 'TRANSPORTE', 'MATERIAL', 'SERVICO', 'FRETE', 'OUTROS'];
const STATUS = ['PENDENTE', 'SOLICITADO', 'ENVIADO_FINANCEIRO', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO', 'CANCELADO'];
const FORMAS_PAGAMENTO = ['PIX', 'TED', 'BOLETO', 'DINHEIRO'];

const cent = (v: number) => Math.round(v * 100) / 100;

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
                despesas: { orderBy: { ordem: 'asc' } },
                supplier: { select: { id: true, nome: true } },
                funcionario: { select: { id: true, nome: true, cargo: true } },
                atividade: { select: { id: true, codigo: true, titulo: true } },
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
        if (!atividade_id) return res.status(400).json({ error: 'Informe a atividade' });

        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

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
                tenant_id: atividade.tenant_id,
                atividade_id,
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
                })),
            };
            dados.valor_total = somar(b.despesas);
            if (atual.natureza === 'ADIANTAMENTO') dados.status_prestacao = 'EM_PREENCHIMENTO';
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

async function sincronizarResumoPagamentos(reembolsoId: string) {
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
                data_solicitacao: status === 'SOLICITADO' ? (atual.data_solicitacao || new Date()) : undefined,
                data_pagamento: concluido ? (atual.data_pagamento || new Date()) : undefined,
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

export async function deleteReembolso(req: Request, res: Response) {
    try {
        const atual = await prisma.reembolso.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Reembolso não encontrado' });
        if (['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(atual.status)) {
            return res.status(400).json({ error: 'Reembolso já pago não pode ser excluído; cancele com justificativa' });
        }
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
                pagamentos: { orderBy: { numero: 'asc' } },
                atividade: { include: { contratante: { select: { nome: true } } } },
            },
        });
        if (!r) return res.status(404).json({ error: 'Reembolso não encontrado' });

        const empresa = await prisma.empresaConfig.findFirst();
        const a = r.atividade;
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
            valor_total: valorPagamento,
            valor_pagamento: valorPagamento,
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
            observacoes: req.body?.observacoes || null,
            anexos: [
                (pagamento?.comprovante_url || r.comprovante_url) ? 'Comprovante do pagamento anexado ao sistema' : null,
                !adiantamento && r.despesas.some(d => d.anexo_url) ? 'Comprovantes das despesas' : null,
            ].filter(Boolean) as string[],
            // Assinatura institucional, igual ao e-mail de pagamento: quem envia
            // acrescenta a propria assinatura no cliente de e-mail.
            nome_solicitante: 'LS Office',
            cargo_solicitante: 'Engenharia',
            email_solicitante: null,
            telefone_solicitante: null,
            referencia: `${adiantamento ? 'Adiantamento' : 'Reembolso'} ${r.id.slice(0, 8)}${pagamento ? ` · Depósito ${pagamento.numero}` : ''} · ${a.codigo} · gerado pelo LS Office ERP`,
        };

        const { assunto, html } = gerarEmailCorporativo(dados);
        // A previa sempre reflete os dados mestres atuais do favorecido. Impedir
        // cache evita que uma chave PIX corrigida seja substituida por uma
        // resposta antiga mantida pelo navegador ou por algum proxy local.
        (res as any).setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        (res as any).setHeader?.('Pragma', 'no-cache');
        res.json({
            assunto,
            html,
            para: empresa?.destinatarios_pagamento || empresa?.email_faturamento || 'financeiro@lsoffice.com.br',
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
            { ...req, body: { ...(req.body || {}), ...(req.query || {}) } } as Request,
            fake as unknown as Response,
        );
        if (captura.error) return res.status(captura.__status || 400).json({ error: captura.error });

        const b64 = Buffer.from(captura.html, 'utf8').toString('base64');
        const assuntoMime = `=?UTF-8?B?${Buffer.from(captura.assunto, 'utf8').toString('base64')}?=`;
        const linhas = [
            'MIME-Version: 1.0', 'X-Unsent: 1', captura.para ? `To: ${captura.para}` : 'To: ',
            `Subject: ${assuntoMime}`, 'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64', '', ...(b64.match(/.{1,76}/g) || []), '',
        ];
        const prefixo = captura.resumo?.natureza === 'ADIANTAMENTO' ? 'ADIANTAMENTO' : 'REEMBOLSO';
        const favorecido = String(captura.resumo?.favorecido || 'FAVORECIDO')
            .normalize('NFD').replace(/[^\w]+/g, '_').toUpperCase().slice(0, 40);
        res.setHeader('Content-Type', 'message/rfc822; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${prefixo}_${favorecido}.eml"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.send(linhas.join('\r\n'));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
