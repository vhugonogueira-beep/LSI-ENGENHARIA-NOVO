import { Request, Response } from 'express';
import { prisma } from '../server';
import { BudgetService } from '../services/budget.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

// Abre uma negociação a partir do valor comercial atual do orçamento (Blueprint LSI, seção 08).
export async function createNegociacao(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { budget_id, atividade_id, margem_minima_aceitavel } = req.body;

        if (!budget_id) {
            return res.status(400).json({ error: 'budget_id é obrigatório' });
        }

        const budget = await BudgetService.getBudgetById(budget_id);
        if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });

        const abertaExistente = await prisma.negociacao.findFirst({
            where: { budget_id, status: 'ABERTA' },
        });
        if (abertaExistente) {
            return res.status(400).json({ error: 'Já existe uma negociação aberta para este orçamento', negociacao_id: abertaExistente.id });
        }

        // Só o preço ao cliente do modelo escolhido (PV ou Orçamento LS) — sem o custo da Cotação LS.
        const calc = BudgetService.calcularOrcamento(BudgetService.itensPrecoCliente(budget));

        const negociacao = await prisma.negociacao.create({
            data: {
                tenant_id,
                atividade_id: atividade_id || null,
                budget_id,
                budget_versao_referencia: budget.versao_atual,
                valor_original: calc.totalGeral,
                margem_minima_aceitavel: margem_minima_aceitavel != null ? parseFloat(margem_minima_aceitavel) : null,
                created_by: (req as any).user?.email || null,
            },
            include: { contrapropostas: true },
        });

        if (atividade_id) {
            await prisma.atividade.update({
                where: { id: atividade_id },
                data: { status_comercial: 'EM_NEGOCIACAO' },
            });
        }

        res.status(201).json(negociacao);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listNegociacoes(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, budget_id, status } = req.query;

        const where: any = { tenant_id };
        if (atividade_id) where.atividade_id = atividade_id;
        if (budget_id) where.budget_id = budget_id;
        if (status) where.status = status;

        const negociacoes = await prisma.negociacao.findMany({
            where,
            include: {
                contrapropostas: { orderBy: { rodada: 'desc' }, take: 1 },
                budget: { select: { id: true, assunto: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json(negociacoes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getNegociacao(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const negociacao = await prisma.negociacao.findUnique({
            where: { id },
            include: {
                contrapropostas: { orderBy: { rodada: 'asc' } },
                budget: true,
                atividade: { select: { id: true, codigo: true, titulo: true, status_comercial: true } },
            },
        });
        if (!negociacao) return res.status(404).json({ error: 'Negociação não encontrada' });
        res.json(negociacao);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Registra uma rodada (aprovação direta, ajuste ou contraproposta) — Blueprint LSI, seção 08.
export async function registrarContraproposta(req: Request, res: Response) {
    try {
        const { id } = req.params; // negociacao_id
        const { origem, valor_proposto, custo_previsto, observacao } = req.body;

        if (!origem || valor_proposto == null) {
            return res.status(400).json({ error: 'origem e valor_proposto são obrigatórios' });
        }
        if (!['CLIENTE', 'LS_OFFICE'].includes(origem)) {
            return res.status(400).json({ error: 'origem deve ser CLIENTE ou LS_OFFICE' });
        }

        const negociacao = await prisma.negociacao.findUnique({
            where: { id },
            include: { contrapropostas: { orderBy: { rodada: 'desc' }, take: 1 } },
        });
        if (!negociacao) return res.status(404).json({ error: 'Negociação não encontrada' });
        if (negociacao.status !== 'ABERTA') {
            return res.status(400).json({ error: `Negociação já está ${negociacao.status}, não aceita novas rodadas` });
        }

        const ultimaRodada = negociacao.contrapropostas[0];
        const valorReferencia = ultimaRodada ? ultimaRodada.valor_proposto : negociacao.valor_original;
        const valorPropostoNum = parseFloat(valor_proposto);

        const diferenca = round2(valorPropostoNum - valorReferencia);
        const percentualVariacao = valorReferencia !== 0 ? round2((diferenca / valorReferencia) * 100) : 0;

        // Motor de viabilidade simplificado (Blueprint LSI, seção 09): custo informado ou, na ausência,
        // o custo orçado da atividade vinculada — recalcula a margem projetada a cada rodada.
        let custoPrevisto: number | null = custo_previsto != null ? parseFloat(custo_previsto) : null;
        if (custoPrevisto == null && negociacao.atividade_id) {
            const atividade = await prisma.atividade.findUnique({ where: { id: negociacao.atividade_id } });
            custoPrevisto = atividade?.valor_orcado ?? null;
        }
        const margemProjetadaPos = custoPrevisto != null && valorPropostoNum > 0
            ? round2(((valorPropostoNum - custoPrevisto) / valorPropostoNum) * 100)
            : null;

        const rodada = await prisma.contraproposta.create({
            data: {
                negociacao_id: id,
                rodada: (ultimaRodada?.rodada ?? 0) + 1,
                origem,
                valor_proposto: valorPropostoNum,
                valor_referencia: valorReferencia,
                diferenca,
                percentual_variacao: percentualVariacao,
                custo_previsto_snapshot: custoPrevisto,
                margem_projetada_pos: margemProjetadaPos,
                observacao: observacao || null,
                created_by: (req as any).user?.email || null,
            },
        });

        const alerta = negociacao.margem_minima_aceitavel != null && margemProjetadaPos != null && margemProjetadaPos < negociacao.margem_minima_aceitavel
            ? `Margem projetada (${margemProjetadaPos}%) abaixo do mínimo aceitável (${negociacao.margem_minima_aceitavel}%)`
            : null;

        res.status(201).json({ ...rodada, alerta });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Decisão sobre uma rodada: aceitar, recusar, escalar para análise interna (Blueprint LSI, seção 08).
export async function decidirContraproposta(req: Request, res: Response) {
    try {
        const { id, rodadaId } = req.params;
        const { decisao, observacao } = req.body;

        if (!['ACEITA', 'RECUSADA', 'NOVA_CONTRAPROPOSTA', 'ANALISE_INTERNA'].includes(decisao)) {
            return res.status(400).json({ error: 'decisao inválida' });
        }

        const rodada = await prisma.contraproposta.findUnique({ where: { id: rodadaId } });
        if (!rodada || rodada.negociacao_id !== id) return res.status(404).json({ error: 'Rodada não encontrada' });

        const rodadaAtualizada = await prisma.contraproposta.update({
            where: { id: rodadaId },
            data: {
                decisao,
                observacao: observacao ?? rodada.observacao,
                decidido_por: (req as any).user?.email || null,
                decidido_em: new Date(),
            },
        });

        if (decisao === 'ACEITA') {
            const negociacao = await prisma.negociacao.update({
                where: { id },
                data: { status: 'APROVADA', valor_final: rodada.valor_proposto },
            });

            if (negociacao.atividade_id) {
                await prisma.atividade.update({
                    where: { id: negociacao.atividade_id },
                    data: { status_comercial: 'APROVADO', valor_contrato: rodada.valor_proposto },
                });
            }
        } else if (decisao === 'RECUSADA') {
            await prisma.negociacao.update({ where: { id }, data: { status: 'REPROVADA' } });
            const negociacao = await prisma.negociacao.findUnique({ where: { id } });
            if (negociacao?.atividade_id) {
                await prisma.atividade.update({
                    where: { id: negociacao.atividade_id },
                    data: { status_comercial: 'REPROVADO' },
                });
            }
        }
        // NOVA_CONTRAPROPOSTA e ANALISE_INTERNA mantêm a negociação ABERTA para novas rodadas.

        res.json(rodadaAtualizada);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
