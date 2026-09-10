// Controle de Pagamentos — a fila única de tudo que a LS Office deve pagar.
//
// Junta duas origens que hoje moram em tabelas diferentes:
//   · ParcelaPagamento  — parcela de contrato com fornecedor
//   · Reembolso         — despesa adiantada por quem executou
//
// A tela precisa das duas na mesma lista, senão alguém acompanha metade da
// obrigação financeira e a outra metade fica invisível.

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../server';

const PASTA_COMPROVANTES = path.resolve(process.cwd(), 'storage', 'comprovantes');

const PAGOS = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];

async function sincronizarCabecalhoDepositos(reembolsoId: string) {
    const pagamentos = await prisma.reembolsoPagamento.findMany({ where: { reembolso_id: reembolsoId }, orderBy: { numero: 'asc' } });
    if (!pagamentos.length) return;
    const todosPagos = pagamentos.every(p => PAGOS.includes(p.status));
    await prisma.reembolso.update({
        where: { id: reembolsoId },
        data: {
            status: todosPagos
                ? (pagamentos.every(p => p.status === 'CONFERIDO') ? 'CONFERIDO'
                    : pagamentos.every(p => Boolean(p.comprovante_url)) ? 'COMPROVANTE_RECEBIDO' : 'PAGO')
                : pagamentos.some(p => p.status !== 'PENDENTE') ? 'AGUARDANDO_PAGAMENTO' : 'PENDENTE',
            comprovante_url: pagamentos.length === 1 ? pagamentos[0].comprovante_url : null,
            data_pagamento: todosPagos
                ? pagamentos.map(p => p.data_pagamento).filter(Boolean).sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null
                : null,
        },
    });
}

export interface LinhaPagamento {
    id: string;
    origem: 'PARCELA' | 'REEMBOLSO' | 'ADIANTAMENTO';
    favorecido: string;
    documento: string | null;
    descricao: string;
    tipo: string;
    valor: number;
    status: string;
    data_prevista: string | null;
    data_pagamento: string | null;
    comprovante_url: string | null;
    atividade: { id: string; codigo: string; titulo: string; site: string | null } | null;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    pix: string | null;
    solicitado_em: string | null;
    forma_pagamento: string | null;
    cartao: string | null;
    formalizacao_posterior: boolean;
    fatura_referencia: string | null;
    processo_id: string | null;
    deposito_numero: number | null;
}

/** Fila consolidada. Filtros: ?status=, ?atividade_id=, ?somente_pendentes=1 */
export async function listPagamentos(req: Request, res: Response) {
    try {
        const { status, atividade_id } = req.query as Record<string, string | undefined>;
        const somentePendentes = req.query.somente_pendentes === '1';

        const parcelas = await prisma.parcelaPagamento.findMany({
            where: {
                ...(status ? { status } : {}),
                ...(somentePendentes ? { status: { notIn: PAGOS } } : {}),
                contratacao: {
                    status: { not: 'CANCELADA' },
                    ...(atividade_id ? { atividade_id } : {}),
                },
            },
            include: {
                solicitacoes: { orderBy: { enviado_em: 'desc' }, take: 1 },
                contratacao: {
                    include: {
                        supplier: true,
                        funcionario: true,
                        atividade: { select: { id: true, codigo: true, titulo: true, id_site_sharing: true } },
                    },
                },
            },
            orderBy: [{ data_prevista: 'asc' }, { created_at: 'asc' }],
        });

        const reembolsos = await prisma.reembolso.findMany({
            where: {
                status: { not: 'CANCELADO' },
                ...(status ? { status } : {}),
                ...(somentePendentes ? { status: { notIn: PAGOS } } : {}),
                ...(atividade_id ? { atividade_id } : {}),
            },
            include: {
                supplier: { select: { nome: true, banco: true, agencia: true, conta: true, pix: true } },
                funcionario: { select: { nome: true, banco: true, agencia: true, conta: true, pix_chave: true } },
                atividade: { select: { id: true, codigo: true, titulo: true, id_site_sharing: true } },
                despesas: { select: { descricao: true } },
                pagamentos: { orderBy: { numero: 'asc' } },
            },
            orderBy: [{ data_prevista: 'asc' }, { created_at: 'asc' }],
        });

        const linhas: LinhaPagamento[] = [
            ...parcelas.map(p => ({
                id: p.id,
                origem: 'PARCELA' as const,
                favorecido: p.contratacao.supplier?.nome || p.contratacao.funcionario?.nome || 'Favorecido não identificado',
                documento: p.contratacao.supplier?.cnpj || p.contratacao.supplier?.cpf || p.contratacao.funcionario?.cpf || null,
                descricao: p.contratacao.finalidade,
                tipo: p.tipo,
                valor: p.valor,
                status: p.status,
                data_solicitacao: p.data_solicitacao ? p.data_solicitacao.toISOString() : null,
                data_prevista: p.data_prevista ? p.data_prevista.toISOString() : null,
                data_pagamento: p.data_pagamento ? p.data_pagamento.toISOString() : null,
                comprovante_url: p.comprovante_url,
                atividade: p.contratacao.atividade
                    ? {
                        id: p.contratacao.atividade.id,
                        codigo: p.contratacao.atividade.codigo,
                        titulo: p.contratacao.atividade.titulo,
                        site: p.contratacao.atividade.id_site_sharing,
                    }
                    : null,
                banco: p.contratacao.supplier?.banco || p.contratacao.funcionario?.banco || null,
                agencia: p.contratacao.supplier?.agencia || p.contratacao.funcionario?.agencia || null,
                conta: p.contratacao.supplier?.conta || p.contratacao.funcionario?.conta || null,
                pix: p.contratacao.supplier?.pix || p.contratacao.funcionario?.pix_chave || null,
                solicitado_em: p.solicitacoes[0] ? p.solicitacoes[0].enviado_em.toISOString() : null,
                forma_pagamento: p.forma_pagamento || p.contratacao.supplier?.forma_pagamento
                    || (p.contratacao.funcionario?.pix_chave ? 'PIX' : 'TED'),
                cartao: p.cartao_bandeira && p.cartao_final
                    ? `${p.cartao_bandeira} •••• ${p.cartao_final}${p.cartao_apelido ? ` — ${p.cartao_apelido}` : ''}` : null,
                formalizacao_posterior: p.formalizacao_posterior,
                fatura_referencia: p.fatura_referencia,
                processo_id: null,
                deposito_numero: null,
            })),
            ...reembolsos.flatMap(r => {
                const registros: any[] = r.pagamentos.length ? r.pagamentos : [{
                    id: r.id, numero: null,
                    valor: r.natureza === 'ADIANTAMENTO' ? Number(r.valor_adiantado || 0) : r.valor_total,
                    status: r.status, data_solicitacao: r.data_solicitacao, data_prevista: r.data_prevista,
                    data_pagamento: r.data_pagamento, comprovante_url: r.comprovante_url,
                    forma_pagamento: r.forma_pagamento,
                }];
                return registros.map(pg => ({
                    // Processos ainda editaveis acompanham o cadastro mestre.
                    // Depois do pagamento, o cabecalho congelado preserva a
                    // informacao efetivamente usada na epoca.
                    id: pg.id,
                    origem: (r.natureza === 'ADIANTAMENTO' ? 'ADIANTAMENTO' : 'REEMBOLSO') as 'ADIANTAMENTO' | 'REEMBOLSO',
                    favorecido: r.favorecido_nome,
                    documento: r.cpf_cnpj,
                    descricao: r.motivo || r.despesas.map(d => d.descricao).slice(0, 2).join(' · ') || (r.natureza === 'ADIANTAMENTO' ? 'Adiantamento de viagem' : 'Reembolso de despesas'),
                    tipo: r.natureza === 'ADIANTAMENTO' ? 'ADIANTAMENTO_VIAGEM' : 'REEMBOLSO',
                    valor: pg.valor,
                    status: pg.status,
                    data_solicitacao: pg.data_solicitacao ? pg.data_solicitacao.toISOString() : null,
                    data_prevista: pg.data_prevista ? pg.data_prevista.toISOString() : null,
                    data_pagamento: pg.data_pagamento ? pg.data_pagamento.toISOString() : null,
                    comprovante_url: pg.comprovante_url,
                    atividade: r.atividade
                        ? { id: r.atividade.id, codigo: r.atividade.codigo, titulo: r.atividade.titulo, site: r.atividade.id_site_sharing }
                        : null,
                    banco: ['PENDENTE', 'SOLICITADO'].includes(pg.status)
                        ? (r.supplier?.banco || r.funcionario?.banco || null)
                        : (r.banco || r.supplier?.banco || r.funcionario?.banco || null),
                    agencia: ['PENDENTE', 'SOLICITADO'].includes(pg.status)
                        ? (r.supplier?.agencia || r.funcionario?.agencia || null)
                        : (r.agencia || r.supplier?.agencia || r.funcionario?.agencia || null),
                    conta: ['PENDENTE', 'SOLICITADO'].includes(pg.status)
                        ? (r.supplier?.conta || r.funcionario?.conta || null)
                        : (r.conta || r.supplier?.conta || r.funcionario?.conta || null),
                    pix: ['PENDENTE', 'SOLICITADO'].includes(pg.status)
                        ? (r.supplier?.pix || r.funcionario?.pix_chave || null)
                        : (r.pix_chave || r.supplier?.pix || r.funcionario?.pix_chave || null),
                    solicitado_em: null,
                    forma_pagamento: pg.forma_pagamento || r.forma_pagamento || (r.pix_chave || r.supplier?.pix || r.funcionario?.pix_chave ? 'PIX' : 'TED'),
                    cartao: null,
                    formalizacao_posterior: false,
                    fatura_referencia: null,
                    processo_id: r.id,
                    deposito_numero: pg.numero,
                }));
            }),
        ].sort((a, b) => {
            const da = a.data_prevista || '9999';
            const db = b.data_prevista || '9999';
            return da.localeCompare(db);
        });

        const total = (fn: (l: LinhaPagamento) => boolean) =>
            Math.round(linhas.filter(fn).reduce((s, l) => s + l.valor, 0) * 100) / 100;

        res.json({
            linhas,
            resumo: {
                total: total(() => true),
                aPagar: total(l => !PAGOS.includes(l.status)),
                pago: total(l => PAGOS.includes(l.status)),
                semComprovante: linhas.filter(l => PAGOS.includes(l.status) && !l.comprovante_url).length,
                quantidade: linhas.length,
            },
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/**
 * Anexa o comprovante de pagamento. Aceita `arquivo_base64` (data URI ou base64
 * puro) ou uma `url` já hospedada.
 */
export async function anexarComprovante(req: Request, res: Response) {
    try {
        const { origem, id } = req.params;
        if (!['PARCELA', 'REEMBOLSO', 'ADIANTAMENTO', 'DEPOSITO'].includes(origem.toUpperCase())) {
            return res.status(400).json({ error: 'Origem inválida. Use PARCELA, REEMBOLSO, ADIANTAMENTO ou DEPOSITO' });
        }

        let url: string | null = req.body.url || null;

        if (!url && req.body.arquivo_base64) {
            const bruto = String(req.body.arquivo_base64);
            const m = bruto.match(/^data:([^;]+);base64,(.*)$/);
            const conteudo = m ? m[2] : bruto;
            const mime = m ? m[1] : 'application/pdf';
            const ext = mime.includes('pdf') ? 'pdf'
                : mime.includes('png') ? 'png'
                    : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'bin';

            const buffer = Buffer.from(conteudo, 'base64');
            if (buffer.length === 0) return res.status(400).json({ error: 'Arquivo vazio' });
            if (buffer.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo acima de 15 MB' });

            fs.mkdirSync(PASTA_COMPROVANTES, { recursive: true });
            const nome = `${origem.toLowerCase()}-${id}-${Date.now()}.${ext}`;
            fs.writeFileSync(path.join(PASTA_COMPROVANTES, nome), buffer);
            // Servido pela rota de download, como o PDF da PO — a pasta não fica
            // exposta como estático.
            url = `/api/pagamentos/comprovantes/${nome}`;
        }

        if (!url) return res.status(400).json({ error: 'Envie o arquivo ou uma URL do comprovante' });

        // Anexar comprovante fecha o ciclo: quem já estava pago passa a
        // "comprovante recebido"; quem não estava, passa a pago.
        if (origem.toUpperCase() === 'PARCELA') {
            const atual = await prisma.parcelaPagamento.findUnique({ where: { id } });
            if (!atual) return res.status(404).json({ error: 'Parcela não encontrada' });
            const parcela = await prisma.parcelaPagamento.update({
                where: { id },
                data: {
                    comprovante_url: url,
                    status: atual.status === 'CONFERIDO' ? 'CONFERIDO' : 'COMPROVANTE_RECEBIDO',
                    data_pagamento: atual.data_pagamento || new Date(),
                },
            });
            return res.json(parcela);
        }

        if (origem.toUpperCase() === 'DEPOSITO') {
            const atual = await prisma.reembolsoPagamento.findUnique({ where: { id } });
            if (!atual) return res.status(404).json({ error: 'Depósito não encontrado' });
            const pagamento = await prisma.reembolsoPagamento.update({
                where: { id }, data: {
                    comprovante_url: url,
                    status: atual.status === 'CONFERIDO' ? 'CONFERIDO' : 'COMPROVANTE_RECEBIDO',
                    data_pagamento: atual.data_pagamento || new Date(),
                },
            });
            await sincronizarCabecalhoDepositos(atual.reembolso_id);
            return res.json(pagamento);
        }

        const atual = await prisma.reembolso.findUnique({ where: { id } });
        if (!atual) return res.status(404).json({ error: 'Reembolso não encontrado' });
        const reembolso = await prisma.reembolso.update({
            where: { id },
            data: {
                comprovante_url: url,
                status: atual.status === 'CONFERIDO' ? 'CONFERIDO' : 'COMPROVANTE_RECEBIDO',
                data_pagamento: atual.data_pagamento || new Date(),
            },
        });
        res.json(reembolso);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Remove o comprovante anexado (troca de arquivo errado). */
export async function removerComprovante(req: Request, res: Response) {
    try {
        const { origem, id } = req.params;
        if (!['PARCELA', 'REEMBOLSO', 'ADIANTAMENTO', 'DEPOSITO'].includes(origem.toUpperCase())) {
            return res.status(400).json({ error: 'Origem inválida. Use PARCELA, REEMBOLSO, ADIANTAMENTO ou DEPOSITO' });
        }
        const alvo = origem.toUpperCase() === 'PARCELA'
            ? await prisma.parcelaPagamento.findUnique({ where: { id } })
            : origem.toUpperCase() === 'DEPOSITO'
                ? await prisma.reembolsoPagamento.findUnique({ where: { id } })
                : await prisma.reembolso.findUnique({ where: { id } });
        if (!alvo) return res.status(404).json({ error: 'Registro não encontrado' });

        // Só apaga o arquivo que o próprio sistema guardou.
        if (alvo.comprovante_url?.startsWith('/api/pagamentos/comprovantes/')) {
            const caminho = path.join(PASTA_COMPROVANTES, path.basename(alvo.comprovante_url));
            if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        }

        if (origem.toUpperCase() === 'PARCELA') {
            return res.json(await prisma.parcelaPagamento.update({
                where: { id }, data: { comprovante_url: null, status: 'PAGO' },
            }));
        }
        if (origem.toUpperCase() === 'DEPOSITO') {
            const deposito = await prisma.reembolsoPagamento.update({ where: { id }, data: { comprovante_url: null, status: 'PAGO' } });
            await sincronizarCabecalhoDepositos(deposito.reembolso_id);
            return res.json(deposito);
        }
        res.json(await prisma.reembolso.update({ where: { id }, data: { comprovante_url: null } }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Entrega o arquivo do comprovante. Só serve o que está na pasta do sistema. */
export async function baixarComprovante(req: Request, res: Response) {
    try {
        const nome = path.basename(String(req.params.nome || ''));
        const caminho = path.join(PASTA_COMPROVANTES, nome);
        if (!caminho.startsWith(PASTA_COMPROVANTES) || !fs.existsSync(caminho)) {
            return res.status(404).json({ error: 'Comprovante não encontrado' });
        }
        res.sendFile(caminho);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
