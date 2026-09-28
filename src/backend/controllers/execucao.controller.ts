import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoStatusAutomatico } from '../services/status-atividade.service';
import { avaliarProntoParaFaturar } from '../services/gates.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

// Registro de execução (Blueprint LSI, seção 19) — avanço físico, checklist, ocorrências.
// Quando o avanço chega a 100% com data real de conclusão, fecha o status operacional (G7).
export async function upsertRegistroExecucao(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id } = req.params;
        const {
            data_inicio, data_prevista_conclusao, data_real_conclusao, avanco_percentual,
            equipe, prestadores, materiais_utilizados, checklist_json, ocorrencias,
            nao_conformidades, evidencias_json, observacoes,
        } = req.body;

        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        let registro = await prisma.registroExecucao.findFirst({ where: { atividade_id } });

        // Blueprint LSI, seção 18: em atividades "Mediante Aprovação" (Implantação), o APC
        // libera a execução — diferente de "Execução Direta" (Operação), que nunca exige APC.
        const novoAvanco = avanco_percentual != null ? parseFloat(avanco_percentual) : (registro?.avanco_percentual ?? 0);
        if (atividade.modelo_operacao === 'MEDIANTE_APROVACAO' && novoAvanco > 0) {
            const apcLiberado = await prisma.aPC.findFirst({ where: { atividade_id, status: 'APC_LIBERADO' } });
            if (!apcLiberado) {
                return res.status(400).json({ error: 'Esta atividade é "Mediante Aprovação" — libere o APC antes de registrar avanço de execução' });
            }
        }

        const data: any = {
            data_inicio: data_inicio !== undefined ? (data_inicio ? new Date(data_inicio) : null) : registro?.data_inicio,
            data_prevista_conclusao: data_prevista_conclusao !== undefined ? (data_prevista_conclusao ? new Date(data_prevista_conclusao) : null) : registro?.data_prevista_conclusao,
            data_real_conclusao: data_real_conclusao !== undefined ? (data_real_conclusao ? new Date(data_real_conclusao) : null) : registro?.data_real_conclusao,
            avanco_percentual: avanco_percentual != null ? parseFloat(avanco_percentual) : (registro?.avanco_percentual ?? 0),
            equipe: equipe !== undefined ? equipe : registro?.equipe,
            prestadores: prestadores !== undefined ? prestadores : registro?.prestadores,
            materiais_utilizados: materiais_utilizados !== undefined ? materiais_utilizados : registro?.materiais_utilizados,
            checklist_json: checklist_json !== undefined ? checklist_json : registro?.checklist_json,
            ocorrencias: ocorrencias !== undefined ? ocorrencias : registro?.ocorrencias,
            nao_conformidades: nao_conformidades !== undefined ? nao_conformidades : registro?.nao_conformidades,
            evidencias_json: evidencias_json !== undefined ? evidencias_json : registro?.evidencias_json,
            observacoes: observacoes !== undefined ? observacoes : registro?.observacoes,
        };

        if (registro) {
            registro = await prisma.registroExecucao.update({ where: { id: registro.id }, data });
        } else {
            registro = await prisma.registroExecucao.create({
                data: { tenant_id, atividade_id, ...data, created_by: (req as any).user?.email || null },
            });
        }

        // G7: execução concluída — atualiza o status operacional e reavalia a fila de faturamento.
        if (registro.avanco_percentual >= 100 && registro.data_real_conclusao) {
            const novo = proximoStatusAutomatico(atividade.status_operacional, 'CONCLUIDA');
            if (novo) {
                await prisma.atividade.update({
                    where: { id: atividade_id },
                    data: { status_operacional: novo, data_conclusao: registro.data_real_conclusao },
                });
            }
            await avaliarProntoParaFaturar(atividade_id);
        } else if (registro.avanco_percentual > 0) {
            const novo = proximoStatusAutomatico(atividade.status_operacional, 'EM_EXECUCAO');
            if (novo) await prisma.atividade.update({ where: { id: atividade_id }, data: { status_operacional: novo } });
        }

        res.json(registro);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getRegistroExecucao(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;
        const registro = await prisma.registroExecucao.findFirst({ where: { atividade_id } });
        res.json(registro || null);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// RFI (Blueprint LSI, seção 20): exige execução concluída; NÃO encerra a atividade —
// apenas inicia a etapa de fechamento/validação documental.
export async function createRFI(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, data_conclusao, responsavel, relatorio_url, destinatario, protocolo, evidencias_json, observacoes, energizado } = req.body;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });

        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });
        if (atividade.status_operacional !== 'CONCLUIDA') {
            return res.status(400).json({ error: 'RFI só pode ser enviado com a execução concluída (G7)' });
        }

        const rfi = await prisma.rFI.create({
            data: {
                tenant_id,
                atividade_id,
                data_conclusao: data_conclusao ? new Date(data_conclusao) : atividade.data_conclusao,
                responsavel: responsavel || null,
                relatorio_url: relatorio_url || null,
                destinatario: destinatario || null,
                protocolo: protocolo || null,
                evidencias_json: evidencias_json || null,
                observacoes: observacoes || null,
                energizado: energizado !== undefined ? !!energizado : null,
                created_by: (req as any).user?.email || null,
            },
        });

        if (atividade.status_documental === 'NAO_INICIADO') {
            await prisma.atividade.update({ where: { id: atividade_id }, data: { status_documental: 'EM_ELABORACAO' } });
        }

        res.status(201).json(rfi);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listRFIs(req: Request, res: Response) {
    try {
        const { atividade_id } = req.query;
        const where: any = {};
        if (atividade_id) where.atividade_id = atividade_id;
        res.json(await prisma.rFI.findMany({ where, orderBy: { created_at: 'desc' } }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
