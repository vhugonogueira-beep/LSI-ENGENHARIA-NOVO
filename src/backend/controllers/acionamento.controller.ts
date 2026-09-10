import { Request, Response } from 'express';
import { prisma } from '../server';
import { gerarMatrizDocumental, recalcularStatusDocumental } from '../services/documentacao.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

function gerarCodigo(seq: number): string {
    const ano = new Date().getFullYear();
    return `ACI-${ano}-${String(seq).padStart(3, '0')}`;
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

        const count = await prisma.acionamento.count({ where: { tenant_id } });
        const codigo = gerarCodigo(count + 1);

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

        const count = await prisma.atividade.count({ where: { tenant_id: acionamento.tenant_id } });
        const ano = new Date().getFullYear();
        const codigo = `ATV-${ano}-${String(count + 1).padStart(3, '0')}`;
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
