import { Request, Response } from 'express';
import { prisma } from '../server';

const CATEGORIAS = ['ALIMENTACAO', 'HOSPEDAGEM', 'COMBUSTIVEL', 'PEDAGIO', 'TRANSPORTE', 'MATERIAL', 'SERVICO', 'FRETE', 'OUTROS'];
const cent = (v: number) => Math.round(v * 100) / 100;

async function detalhar(id: string) {
    return prisma.prestacaoContasConsolidada.findUnique({
        where: { id },
        include: {
            pagamentos: {
                include: {
                    pagamento: {
                        include: {
                            reembolso: { include: { atividade: { select: { id: true, codigo: true, titulo: true } } } },
                        },
                    },
                },
            },
            despesas: { orderBy: { ordem: 'asc' } },
        },
    });
}

export async function listarPrestacoesConsolidadas(req: Request, res: Response) {
    try {
        const atividadeId = req.query.atividade_id as string | undefined;
        res.json(await prisma.prestacaoContasConsolidada.findMany({
            where: atividadeId ? {
                OR: [
                    { atividade_id: atividadeId },
                    { pagamentos: { some: { pagamento: { reembolso: { atividade_id: atividadeId } } } } },
                ],
            } : {},
            include: {
                pagamentos: { include: { pagamento: { include: { reembolso: { include: { atividade: { select: { id: true, codigo: true, titulo: true } } } } } } } },
                despesas: { orderBy: { ordem: 'asc' } },
            },
            orderBy: { created_at: 'desc' },
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function criarPrestacaoConsolidada(req: Request, res: Response) {
    try {
        const ids: string[] = Array.isArray(req.body.pagamento_ids)
            ? Array.from(new Set<string>(req.body.pagamento_ids.map((id: unknown) => String(id))))
            : [];
        if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos um pagamento de adiantamento' });
        const pagamentos = await prisma.reembolsoPagamento.findMany({
            where: { id: { in: ids } },
            include: { reembolso: true, prestacoes: true },
        });
        if (pagamentos.length !== ids.length) return res.status(404).json({ error: 'Um ou mais pagamentos não foram encontrados' });
        if (pagamentos.some(p => p.reembolso.natureza !== 'ADIANTAMENTO')) {
            return res.status(400).json({ error: 'Somente pagamentos de adiantamento entram na prestação de contas' });
        }
        if (pagamentos.some(p => !['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status))) {
            return res.status(400).json({ error: 'Todos os pagamentos selecionados precisam estar pagos' });
        }
        if (pagamentos.some(p => p.prestacoes.length > 0)) {
            return res.status(400).json({ error: 'Um dos pagamentos já pertence a outra prestação de contas' });
        }
        const chavesFavorecido = new Set(pagamentos.map(p =>
            p.reembolso.funcionario_id || p.reembolso.supplier_id || p.reembolso.cpf_cnpj || p.reembolso.favorecido_nome.toLocaleLowerCase('pt-BR')));
        if (chavesFavorecido.size !== 1) return res.status(400).json({ error: 'A prestação consolidada deve reunir pagamentos do mesmo favorecido' });
        const atividades = new Set(pagamentos.map(p => p.reembolso.atividade_id));
        const base = pagamentos[0].reembolso;
        const prestacao = await prisma.prestacaoContasConsolidada.create({
            data: {
                tenant_id: base.tenant_id,
                atividade_id: atividades.size === 1 ? base.atividade_id : null,
                favorecido_nome: base.favorecido_nome,
                cpf_cnpj: base.cpf_cnpj,
                valor_adiantado: cent(pagamentos.reduce((s, p) => s + p.valor, 0)),
                pagamentos: { create: pagamentos.map(p => ({ pagamento_id: p.id })) },
            },
        });
        res.status(201).json(await detalhar(prestacao.id));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function atualizarPrestacaoConsolidada(req: Request, res: Response) {
    try {
        const atual = await prisma.prestacaoContasConsolidada.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Prestação consolidada não encontrada' });
        if (atual.status === 'APROVADA') return res.status(400).json({ error: 'Prestação já aprovada e bloqueada para edição' });
        const despesas = Array.isArray(req.body.despesas) ? req.body.despesas : [];
        for (const d of despesas) {
            const valor = Number(d.valor);
            if (!String(d.descricao || '').trim() || !Number.isFinite(valor) || valor <= 0) {
                return res.status(400).json({ error: 'Toda despesa precisa de descrição e valor maior que zero' });
            }
        }
        await prisma.$transaction(async tx => {
            await tx.prestacaoContasDespesa.deleteMany({ where: { prestacao_id: atual.id } });
            await tx.prestacaoContasConsolidada.update({
                where: { id: atual.id },
                data: {
                    valor_despesas: cent(despesas.reduce((s: number, d: any) => s + Number(d.valor), 0)),
                    status: 'EM_PREENCHIMENTO',
                    despesas: {
                        create: despesas.map((d: any, ordem: number) => ({
                            data: d.data ? new Date(d.data) : null,
                            descricao: String(d.descricao).trim(),
                            categoria: CATEGORIAS.includes(String(d.categoria || '').toUpperCase()) ? String(d.categoria).toUpperCase() : 'OUTROS',
                            valor: cent(Number(d.valor)), anexo_url: d.anexo_url || null, ordem,
                        })),
                    },
                },
            });
        });
        res.json(await detalhar(atual.id));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function enviarPrestacaoConsolidada(req: Request, res: Response) {
    try {
        const atual = await prisma.prestacaoContasConsolidada.findUnique({ where: { id: req.params.id }, include: { despesas: true } });
        if (!atual) return res.status(404).json({ error: 'Prestação consolidada não encontrada' });
        if (!atual.despesas.length || atual.valor_despesas <= 0) return res.status(400).json({ error: 'Inclua as despesas antes de enviar' });
        await prisma.prestacaoContasConsolidada.update({ where: { id: atual.id }, data: { status: 'ENVIADA', enviada_em: new Date(), parecer_financeiro: null } });
        res.json(await detalhar(atual.id));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function analisarPrestacaoConsolidada(req: Request, res: Response) {
    try {
        const status = String(req.body.status || '');
        if (!['APROVADA', 'AJUSTES_SOLICITADOS'].includes(status)) return res.status(400).json({ error: 'Use APROVADA ou AJUSTES_SOLICITADOS' });
        const atual = await prisma.prestacaoContasConsolidada.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Prestação consolidada não encontrada' });
        const parecer = String(req.body.parecer_financeiro || '').trim();
        if (status === 'AJUSTES_SOLICITADOS' && parecer.length < 5) return res.status(400).json({ error: 'Descreva os ajustes solicitados' });
        await prisma.prestacaoContasConsolidada.update({
            where: { id: atual.id }, data: {
                status, parecer_financeiro: parecer || null,
                conferida_em: status === 'APROVADA' ? new Date() : null,
                conferida_por: status === 'APROVADA' ? ((req as any).user?.email || req.body.conferida_por || 'Financeiro') : null,
            },
        });
        res.json(await detalhar(atual.id));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}

export async function excluirPrestacaoConsolidada(req: Request, res: Response) {
    try {
        const atual = await prisma.prestacaoContasConsolidada.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Prestação consolidada não encontrada' });
        if (atual.status === 'APROVADA') return res.status(400).json({ error: 'Prestação aprovada não pode ser excluída' });
        await prisma.prestacaoContasConsolidada.delete({ where: { id: atual.id } });
        res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
}
