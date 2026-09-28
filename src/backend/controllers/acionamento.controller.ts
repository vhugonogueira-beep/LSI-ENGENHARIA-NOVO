import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoCodigo } from '../services/codigo-sequencial.service';
import { gerarMatrizDocumental, recalcularStatusDocumental } from '../services/documentacao.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}


export async function listAcionamentos(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const acionamentos = await prisma.acionamento.findMany({
            where: { tenant_id },
            include: {
                contratante: { select: { nome: true } },
                atividades: { select: { id: true, codigo: true, titulo: true, status_operacional: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(acionamentos);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getAcionamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const acionamento = await prisma.acionamento.findUnique({
            where: { id },
            include: {
                contratante: true,
                atividades: true,
            },
        });
        if (!acionamento) return res.status(404).json({ error: 'Acionamento não encontrado' });
        res.json(acionamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function createAcionamento(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const {
            titulo, canal_recebimento, descricao_bruta,
            contratante_id, id_site_sharing, id_site_operadora,
            data_recebimento, responsavel,
        } = req.body;

        if (!titulo) {
            return res.status(400).json({ error: 'titulo é obrigatório' });
        }

        const codigo = await proximoCodigo(prisma.acionamento, 'ACI');

        const acionamento = await prisma.acionamento.create({
            data: {
                tenant_id,
                codigo,
                titulo,
                canal_recebimento: canal_recebimento || null,
                descricao_bruta: descricao_bruta || null,
                contratante_id: contratante_id || null,
                id_site_sharing: id_site_sharing || null,
                id_site_operadora: id_site_operadora || null,
                data_recebimento: data_recebimento ? new Date(data_recebimento) : new Date(),
                responsavel: responsavel || null,
                created_by: (req as any).user?.email || null,
            },
            include: {
                contratante: { select: { nome: true } },
            },
        });

        res.status(201).json(acionamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function updateAcionamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const {
            titulo, canal_recebimento, descricao_bruta,
            contratante_id, id_site_sharing, id_site_operadora,
            data_recebimento, responsavel,
        } = req.body;

        const existing = await prisma.acionamento.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Acionamento não encontrado' });

        const acionamento = await prisma.acionamento.update({
            where: { id },
            data: {
                titulo: titulo ?? existing.titulo,
                canal_recebimento: canal_recebimento !== undefined ? canal_recebimento : existing.canal_recebimento,
                descricao_bruta: descricao_bruta !== undefined ? descricao_bruta : existing.descricao_bruta,
                contratante_id: contratante_id !== undefined ? contratante_id : existing.contratante_id,
                id_site_sharing: id_site_sharing !== undefined ? id_site_sharing : existing.id_site_sharing,
                id_site_operadora: id_site_operadora !== undefined ? id_site_operadora : existing.id_site_operadora,
                data_recebimento: data_recebimento ? new Date(data_recebimento) : existing.data_recebimento,
                responsavel: responsavel !== undefined ? responsavel : existing.responsavel,
            },
            include: {
                contratante: { select: { nome: true } },
            },
        });

        res.json(acionamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function deleteAcionamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const atividadesVinculadas = await prisma.atividade.count({ where: { acionamento_id: id } });
        if (atividadesVinculadas > 0) {
            return res.status(400).json({ error: 'Não é possível excluir: há atividades vinculadas a este acionamento' });
        }
        await prisma.acionamento.delete({ where: { id } });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Cria uma Atividade diretamente a partir de um Acionamento (fluxo G1 → G2 do Blueprint LSI)
export async function criarAtividadeDoAcionamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const acionamento = await prisma.acionamento.findUnique({ where: { id } });
        if (!acionamento) return res.status(404).json({ error: 'Acionamento não encontrado' });

        const {
            titulo, tipo_demanda, subtipo_demanda, tipo_obra, tipo_atividade, modelo_operacao,
            sharing, operadora, contratante_id, contrato, id_site_sharing, id_site_operadora,
            estado, municipio, responsavel, descricao,
        } = req.body;

        if (!tipo_demanda || !sharing || !id_site_sharing || !id_site_operadora) {
            return res.status(400).json({ error: 'tipo_demanda, sharing, id_site_sharing e id_site_operadora são obrigatórios' });
        }

        const codigo = await proximoCodigo(prisma.atividade, 'ATV');
        const modeloDefault = tipo_demanda === 'IMPLANTACAO' ? 'MEDIANTE_APROVACAO' : 'EXECUCAO_DIRETA';

        const atividade = await prisma.atividade.create({
            data: {
                tenant_id: acionamento.tenant_id,
                codigo,
                acionamento_id: acionamento.id,
                titulo: titulo || acionamento.titulo,
                tipo_demanda,
                subtipo_demanda: subtipo_demanda || null,
                tipo_obra: tipo_obra || null,
                tipo_atividade: tipo_atividade || null,
                modelo_operacao: modelo_operacao || modeloDefault,
                sharing,
                operadora: operadora || null,
                contratante_id: contratante_id ?? acionamento.contratante_id,
                contrato: contrato || null,
                id_site_sharing: id_site_sharing ?? acionamento.id_site_sharing,
                id_site_operadora: id_site_operadora ?? acionamento.id_site_operadora,
                estado: estado || null,
                municipio: municipio || null,
                responsavel: responsavel ?? acionamento.responsavel,
                descricao: descricao || null,
                created_by: (req as any).user?.email || null,
                statusHistorico: {
                    create: {
                        dimensao: 'OPERACIONAL',
                        status_de: null,
                        status_para: 'PLANEJAMENTO',
                        observacao: `Atividade criada a partir do acionamento ${acionamento.codigo}`,
                        criado_por: (req as any).user?.email || null,
                    },
                },
            },
        });

        if (atividade.tipo_obra) {
            await gerarMatrizDocumental(atividade.id, atividade.tipo_obra);
        }
        await recalcularStatusDocumental(atividade.id);

        res.status(201).json(atividade);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/**
 * Inclui atividades JÁ EXISTENTES no projeto, de uma vez.
 *
 * É o caso que originou tudo: as 25 vistorias de energia da Oi já estavam
 * lançadas quando se percebeu que formavam um projeto só, com um orçamento só.
 * Criar de novo não era opção — elas já têm cronograma, pagamentos e histórico.
 *
 * Passar `atividade_ids: []` desvincula tudo; passar um id já vinculado a outro
 * projeto move a atividade, o que é edição normal e não erro.
 */
export async function agruparAtividades(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const ids: string[] = Array.isArray(req.body?.atividade_ids) ? req.body.atividade_ids : [];

        const projeto = await prisma.acionamento.findUnique({ where: { id } });
        if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

        if (ids.length) {
            const encontradas = await prisma.atividade.findMany({
                where: { id: { in: ids } },
                select: { id: true, tenant_id: true },
            });
            if (encontradas.length !== ids.length) {
                return res.status(400).json({ error: 'Uma ou mais atividades não foram encontradas' });
            }
            const deOutroTenant = encontradas.filter(a => a.tenant_id !== projeto.tenant_id);
            if (deOutroTenant.length) {
                return res.status(400).json({ error: 'Atividade de outro tenant não pode entrar neste projeto' });
            }
            await prisma.atividade.updateMany({
                where: { id: { in: ids } },
                data: { acionamento_id: id },
            });
        }

        // Quem estava no projeto e não veio na lista sai dele. A atividade não é
        // apagada — só deixa de pertencer ao grupo.
        await prisma.atividade.updateMany({
            where: { acionamento_id: id, ...(ids.length ? { id: { notIn: ids } } : {}) },
            data: { acionamento_id: null },
        });

        const atualizado = await prisma.acionamento.findUnique({
            where: { id },
            include: { atividades: { select: { id: true, codigo: true, titulo: true } } },
        });
        res.json(atualizado);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/**
 * Consolidado financeiro do projeto.
 *
 * Responde o que a tela do projeto precisa mostrar de cabeça: quanto foi orçado,
 * quanto já se comprometeu com fornecedores, quanto saiu em adiantamento e —
 * o número que só existe por causa do rateio — quanto desse adiantamento já foi
 * atribuído a uma atividade concreta.
 */
export async function financeiroDoProjeto(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const projeto = await prisma.acionamento.findUnique({
            where: { id },
            include: {
                atividades: {
                    select: {
                        id: true, codigo: true, titulo: true, valor_contrato: true, valor_orcado: true,
                        status_operacional: true, id_site_sharing: true,
                        contratacoesFornecedor: { select: { valor_contratado: true, status: true } },
                        despesasRateadas: { select: { valor: true } },
                    },
                },
                reembolsos: {
                    include: {
                        pagamentos: { select: { valor: true, status: true } },
                        despesas: { select: { valor: true, atividade_id: true } },
                    },
                },
                orcamentos: { select: { id: true, assunto: true, status: true, versao_atual: true } },
            },
        });
        if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

        const soma = (ns: number[]) => Math.round(ns.reduce((s, n) => s + (Number(n) || 0), 0) * 100) / 100;

        const atividades = projeto.atividades.map(a => ({
            id: a.id,
            codigo: a.codigo,
            titulo: a.titulo,
            site: a.id_site_sharing,
            status_operacional: a.status_operacional,
            valor_contrato: a.valor_contrato,
            custo_comprometido: soma(a.contratacoesFornecedor.filter(c => c.status !== 'CANCELADA').map(c => c.valor_contratado)),
            // A fatia do adiantamento do projeto que foi atribuída a esta atividade.
            custo_rateado: soma(a.despesasRateadas.map(d => d.valor)),
        }));

        const adiantado = soma(projeto.reembolsos.flatMap(r => r.pagamentos.map(p => p.valor)));
        const rateado = soma(projeto.reembolsos.flatMap(r => r.despesas.filter(d => d.atividade_id).map(d => d.valor)));
        const semRateio = soma(projeto.reembolsos.flatMap(r => r.despesas.filter(d => !d.atividade_id).map(d => d.valor)));

        res.json({
            projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo },
            atividades,
            orcamentos: projeto.orcamentos,
            resumo: {
                atividades: atividades.length,
                receita: soma(atividades.map(a => a.valor_contrato || 0)),
                custo_comprometido: soma(atividades.map(a => a.custo_comprometido)),
                adiantado,
                rateado,
                // O que saiu do caixa e ainda não tem dono: enquanto for > 0, a
                // margem por atividade está incompleta.
                a_ratear: Math.round((adiantado - rateado - semRateio) * 100) / 100,
                despesas_sem_atividade: semRateio,
            },
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
