import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoCodigo } from '../services/codigo-sequencial.service';
import { avaliarMarcosFaturamento, gerarPlanilhaFaturamento } from '../services/faturamento.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

// ─── Motor de Regras de Faturamento (Blueprint LSI, seção 30) ─────────────────

export async function createRegraFaturamento(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { nome, contratante_id, contrato, tipo_obra, vigencia_inicio, vigencia_fim, marcos } = req.body;
        if (!nome || !Array.isArray(marcos) || marcos.length === 0) {
            return res.status(400).json({ error: 'nome e marcos (lista) são obrigatórios' });
        }

        const somaPorCaminho: Record<string, number> = {};
        for (const m of marcos) {
            if (!m.caminho || !m.marco || m.percentual == null) {
                return res.status(400).json({ error: 'cada marco precisa de caminho, marco e percentual' });
            }
            somaPorCaminho[m.caminho] = (somaPorCaminho[m.caminho] || 0) + parseFloat(m.percentual);
        }
        // PADRAO é somado a cada caminho condicional; valida que cada trilha completa fecha em 100%.
        const caminhosCondicionais = Object.keys(somaPorCaminho).filter(c => c !== 'PADRAO');
        const base = somaPorCaminho['PADRAO'] || 0;
        const trilhas = caminhosCondicionais.length > 0 ? caminhosCondicionais : ['PADRAO'];
        for (const caminho of trilhas) {
            const total = caminho === 'PADRAO' ? base : base + somaPorCaminho[caminho];
            if (Math.round(total) !== 100) {
                return res.status(400).json({ error: `O caminho "${caminho}" soma ${total}%, mas precisa somar 100%` });
            }
        }

        const regra = await prisma.regraFaturamento.create({
            data: {
                tenant_id,
                nome,
                contratante_id: contratante_id || null,
                contrato: contrato || null,
                tipo_obra: tipo_obra || null,
                vigencia_inicio: vigencia_inicio ? new Date(vigencia_inicio) : null,
                vigencia_fim: vigencia_fim ? new Date(vigencia_fim) : null,
                marcos: {
                    create: marcos.map((m: any, i: number) => ({
                        caminho: m.caminho,
                        marco: m.marco,
                        percentual: parseFloat(m.percentual),
                        ordem: i,
                    })),
                },
            },
            include: { marcos: true },
        });
        res.status(201).json(regra);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listRegrasFaturamento(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        res.json(await prisma.regraFaturamento.findMany({
            where: { tenant_id },
            include: { marcos: { orderBy: { ordem: 'asc' } }, contratante: { select: { nome: true } } },
            orderBy: { created_at: 'desc' },
        }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getAvaliacaoFaturamento(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;
        res.json(await avaliarMarcosFaturamento(atividade_id));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ─── Aceite (Blueprint LSI, seção 3/30) ───────────────────────────────────────

export async function createAceite(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, data, responsavel, documento_url, observacoes } = req.body;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });

        const aceite = await prisma.aceite.create({
            data: {
                tenant_id,
                atividade_id,
                data: data ? new Date(data) : new Date(),
                responsavel: responsavel || null,
                documento_url: documento_url || null,
                observacoes: observacoes || null,
                created_by: (req as any).user?.email || null,
            },
        });
        res.status(201).json(aceite);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ─── Fila de Faturamento / Start Faturamento (Blueprint LSI, seção 28-29) ─────


// Botão "Start Faturamento LS": consolida atividades liberadas, calcula o valor a
// incluir via motor de regras (quando configurado) e abre o lote no financeiro.
export async function startFaturamento(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_ids } = req.body;
        if (!Array.isArray(atividade_ids) || atividade_ids.length === 0) {
            return res.status(400).json({ error: 'atividade_ids (lista) é obrigatório' });
        }

        const atividades = await prisma.atividade.findMany({ where: { id: { in: atividade_ids } } });
        const naoProntas = atividades.filter(a => a.status_faturamento !== 'PRONTO_PARA_FATURAR');
        if (naoProntas.length > 0) {
            return res.status(400).json({
                error: 'Algumas atividades não estão prontas para faturar',
                atividades_bloqueadas: naoProntas.map(a => ({ id: a.id, codigo: a.codigo, status_faturamento: a.status_faturamento })),
            });
        }

        const itens: { atividade_id: string; valor_incluido: number; percentual_marco: number | null }[] = [];
        for (const atividade of atividades) {
            const avaliacao = await avaliarMarcosFaturamento(atividade.id);
            const valor = avaliacao.regra_aplicada
                ? avaliacao.valor_liberado
                : (atividade.valor_contrato || 0);
            itens.push({
                atividade_id: atividade.id,
                valor_incluido: valor,
                percentual_marco: avaliacao.regra_aplicada ? avaliacao.percentual_liberado : null,
            });
        }
        const valorTotal = itens.reduce((s, i) => s + i.valor_incluido, 0);

        const faturamento = await prisma.faturamento.create({
            data: {
                tenant_id,
                codigo: await proximoCodigo(prisma.faturamento, 'FAT'),
                valor_total: Math.round(valorTotal * 100) / 100,
                planilha_gerada: true,
                enviado_por: (req as any).user?.email || null,
                atividades: { create: itens },
            },
            include: { atividades: { include: { atividade: { select: { codigo: true, titulo: true } } } } },
        });

        await prisma.atividade.updateMany({
            where: { id: { in: atividade_ids } },
            data: { status_faturamento: 'ENVIADO_FINANCEIRO' },
        });

        res.status(201).json(faturamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listFaturamentos(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        res.json(await prisma.faturamento.findMany({
            where: { tenant_id },
            include: {
                atividades: { include: { atividade: { select: { codigo: true, titulo: true, sharing: true, id_site_sharing: true } } } },
                recebimentos: true,
            },
            orderBy: { enviado_em: 'desc' },
        }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getFaturamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const faturamento = await prisma.faturamento.findUnique({
            where: { id },
            include: {
                atividades: { include: { atividade: true } },
                recebimentos: true,
            },
        });
        if (!faturamento) return res.status(404).json({ error: 'Faturamento não encontrado' });
        res.json(faturamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

const FATURAMENTO_STATUS_ORDEM = ['ENVIADO_FINANCEIRO', 'EM_FATURAMENTO', 'NF_EMITIDA', 'FATURADO', 'RECEBIDO'];

export async function updateStatusFaturamento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { status, nf_numero } = req.body;
        if (!FATURAMENTO_STATUS_ORDEM.includes(status)) {
            return res.status(400).json({ error: `status inválido. Use um de: ${FATURAMENTO_STATUS_ORDEM.join(', ')}` });
        }

        const faturamento = await prisma.faturamento.update({
            where: { id },
            data: {
                status,
                nf_numero: nf_numero !== undefined ? nf_numero : undefined,
                data_faturamento: status === 'FATURADO' ? new Date() : undefined,
            },
            include: { atividades: true },
        });

        if (status === 'FATURADO') {
            await prisma.atividade.updateMany({
                where: { id: { in: faturamento.atividades.map(a => a.atividade_id) } },
                data: { status_faturamento: 'FATURADO' },
            });
        }

        res.json(faturamento);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function registrarRecebimento(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { valor_recebido, observacoes } = req.body;
        if (valor_recebido == null) return res.status(400).json({ error: 'valor_recebido é obrigatório' });

        const faturamento = await prisma.faturamento.findUnique({ where: { id }, include: { atividades: true, recebimentos: true } });
        if (!faturamento) return res.status(404).json({ error: 'Faturamento não encontrado' });

        const recebimento = await prisma.recebimento.create({
            data: { faturamento_id: id, valor_recebido: parseFloat(valor_recebido), observacoes: observacoes || null },
        });

        const totalRecebido = faturamento.recebimentos.reduce((s, r) => s + r.valor_recebido, 0) + recebimento.valor_recebido;
        if (Math.round(totalRecebido) >= Math.round(faturamento.valor_total)) {
            await prisma.faturamento.update({ where: { id }, data: { status: 'RECEBIDO' } });
            await prisma.atividade.updateMany({
                where: { id: { in: faturamento.atividades.map(a => a.atividade_id) } },
                data: { status_faturamento: 'RECEBIDO' },
            });
        }

        res.status(201).json({ recebimento, total_recebido: totalRecebido, valor_total: faturamento.valor_total });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function exportPlanilhaFaturamento(req: Request, res: Response) {
    try {
        const buffer = await gerarPlanilhaFaturamento(req.params.id);
        const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Faturamento_Winity_${today}.xlsx`);
        res.send(buffer);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
