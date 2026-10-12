import { Request, Response } from 'express';
import { prisma } from '../server';

// Tipos de gasto (12/10/2026): Vistoria, Combustível e Outros. Os antigos
// continuam aceitos para não perder o que já foi lançado.
const CATEGORIAS = ['VISTORIA', 'COMBUSTIVEL', 'OUTROS', 'ALIMENTACAO', 'HOSPEDAGEM', 'PEDAGIO', 'TRANSPORTE', 'MATERIAL', 'SERVICO', 'FRETE'];
const cent = (v: number) => Math.round(v * 100) / 100;

/**
 * Para onde o dinheiro destes depósitos pode ir (12/10/2026):
 *   - adiantamento de projeto -> as atividades do projeto;
 *   - adiantamento de atividade que está num projeto -> ela e as outras do projeto;
 *   - adiantamento de atividade sem projeto -> só ela.
 * Nunca para fora do projeto: é o que impede o custo de uma vistoria da Oi cair
 * numa obra da Claro. Devolve também os projetos envolvidos, para recusar uma
 * prestação que misture projetos diferentes.
 */
async function escopoDosReembolsos(reembolsoIds: string[]) {
    const reembolsos = await prisma.reembolso.findMany({
        where: { id: { in: reembolsoIds } },
        select: { acionamento_id: true, atividade_id: true, atividade: { select: { acionamento_id: true } } },
    });
    const projetos = new Set<string>();
    const avulsas = new Set<string>();
    for (const r of reembolsos) {
        const projeto = r.acionamento_id || r.atividade?.acionamento_id;
        if (projeto) projetos.add(projeto);
        else if (r.atividade_id) avulsas.add(r.atividade_id);
    }
    const daProjeto = projetos.size
        ? await prisma.atividade.findMany({ where: { acionamento_id: { in: [...projetos] } }, select: { id: true } })
        : [];
    const ids = [...new Set([...daProjeto.map(a => a.id), ...avulsas])];
    const atividades = await prisma.atividade.findMany({
        where: { id: { in: ids } },
        select: { id: true, codigo: true, titulo: true, id_site_sharing: true },
        orderBy: { codigo: 'asc' },
    });
    return { projetos: [...projetos], avulsas: [...avulsas], atividades };
}

const destinos = (atividades: { id: string; codigo: string; titulo: string; id_site_sharing: string | null }[]) =>
    atividades.map(a => ({ id: a.id, codigo: a.codigo, titulo: a.titulo, site: a.id_site_sharing }));

async function idsDosReembolsosDaPrestacao(prestacaoId: string) {
    const v = await prisma.prestacaoContasPagamento.findMany({ where: { prestacao_id: prestacaoId }, select: { pagamento: { select: { reembolso_id: true } } } });
    return [...new Set(v.map(x => x.pagamento.reembolso_id))];
}

async function detalhar(id: string) {
    const p = await carregar(id);
    if (!p) return null;
    const escopo = await escopoDosReembolsos(await idsDosReembolsosDaPrestacao(id));
    return { ...p, atividades_destino: destinos(escopo.atividades) };
}

async function carregar(id: string) {
    return prisma.prestacaoContasConsolidada.findUnique({
        where: { id },
        include: {
            pagamentos: {
                include: {
                    pagamento: {
                        include: {
                            reembolso: { include: { atividade: { select: { id: true, codigo: true, titulo: true } }, acionamento: { select: { id: true, codigo: true, titulo: true } } } },
                        },
                    },
                },
            },
            despesas: { orderBy: { ordem: 'asc' }, include: { atividade: { select: { id: true, codigo: true, id_site_sharing: true } } } },
        },
    });
}

export async function listarPrestacoesConsolidadas(req: Request, res: Response) {
    try {
        const atividadeId = req.query.atividade_id as string | undefined;
        const projetoId = req.query.acionamento_id as string | undefined;
        const where: any = atividadeId ? {
            OR: [
                { atividade_id: atividadeId },
                { pagamentos: { some: { pagamento: { reembolso: { atividade_id: atividadeId } } } } },
                { despesas: { some: { atividade_id: atividadeId } } },
            ],
        } : projetoId ? {
            pagamentos: { some: { pagamento: { reembolso: { OR: [{ acionamento_id: projetoId }, { atividade: { acionamento_id: projetoId } }] } } } },
        } : {};
        const lista = await prisma.prestacaoContasConsolidada.findMany({
            where,
            include: {
                pagamentos: { include: { pagamento: { include: { reembolso: { include: { atividade: { select: { id: true, codigo: true, titulo: true } }, acionamento: { select: { id: true, codigo: true, titulo: true } } } } } } } },
                despesas: { orderBy: { ordem: 'asc' }, include: { atividade: { select: { id: true, codigo: true, id_site_sharing: true } } } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(await Promise.all(lista.map(async p => {
            const escopo = await escopoDosReembolsos([...new Set(p.pagamentos.map(v => v.pagamento.reembolso_id))]);
            return { ...p, atividades_destino: destinos(escopo.atividades) };
        })));
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
        // Depósitos de projetos diferentes não se misturam: cada gasto só pode ir
        // para atividades do mesmo projeto do dinheiro (12/10/2026).
        const escopo = await escopoDosReembolsos([...new Set(pagamentos.map(p => p.reembolso_id))]);
        if (escopo.projetos.length > 1 || (escopo.projetos.length === 1 && escopo.avulsas.length > 0)) {
            return res.status(400).json({ error: 'Os depósitos são de projetos diferentes. Faça uma prestação de contas para cada projeto.' });
        }
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
        const escopo = await escopoDosReembolsos(await idsDosReembolsosDaPrestacao(atual.id));
        const permitidas = new Set(escopo.atividades.map(a => a.id));
        // Com um destino só possível, ele vem preenchido; com vários, cada gasto diz o seu.
        const unica = escopo.atividades.length === 1 ? escopo.atividades[0].id : null;
        for (const d of despesas) {
            const valor = Number(d.valor);
            const descricao = String(d.descricao || '').trim();
            if (!descricao || !Number.isFinite(valor) || valor <= 0) {
                return res.status(400).json({ error: 'Toda despesa precisa de descrição e valor maior que zero' });
            }
            const destino = d.atividade_id || unica;
            if (!destino) return res.status(400).json({ error: `Informe o site/atividade de destino da despesa "${descricao}"` });
            if (!permitidas.has(destino)) {
                return res.status(400).json({ error: `A despesa "${descricao}" aponta para uma atividade fora do projeto deste adiantamento` });
            }
            d.atividade_id = destino;
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
                            atividade_id: d.atividade_id,
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
