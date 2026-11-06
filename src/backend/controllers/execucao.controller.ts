import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../server';
import { nomeArquivoUtf8 } from '../utils/nome-arquivo';
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

        const dataDe = (v: any, atual: Date | null | undefined) => v !== undefined ? (v ? new Date(v) : null) : (atual ?? null);
        const data: any = {
            data_mobilizacao_prevista: dataDe(req.body.data_mobilizacao_prevista, registro?.data_mobilizacao_prevista),
            data_mobilizacao_real: dataDe(req.body.data_mobilizacao_real, registro?.data_mobilizacao_real),
            data_execucao_prevista: dataDe(req.body.data_execucao_prevista, registro?.data_execucao_prevista),
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

        // Operação (04/11/2026): a data real de conclusão finaliza a atividade — o avanço
        // vai a 100% junto, sem exigir o controle deslizante.
        const operacao = atividade.modelo_operacao !== 'MEDIANTE_APROVACAO';
        if (operacao && data.data_real_conclusao) data.avanco_percentual = 100;

        if (registro) {
            registro = await prisma.registroExecucao.update({ where: { id: registro.id }, data });
        } else {
            registro = await prisma.registroExecucao.create({
                data: { tenant_id, atividade_id, ...data, created_by: (req as any).user?.email || null },
            });
        }

        // Prazo previsto da atividade sai do Planejamento/Execução (05/11/2026): início =
        // mobilização prevista (ou execução prevista); término = conclusão prevista.
        const inicioPrev = registro.data_mobilizacao_prevista || registro.data_execucao_prevista || null;
        const fimPrev = registro.data_prevista_conclusao || null;
        if (inicioPrev?.getTime() !== atividade.data_inicio_planejada?.getTime() || fimPrev?.getTime() !== atividade.data_fim_planejada?.getTime()) {
            await prisma.atividade.update({ where: { id: atividade_id }, data: { data_inicio_planejada: inicioPrev, data_fim_planejada: fimPrev } });
        }

        // Operação: com data de conclusão a atividade está finalizada; apagar a data reabre.
        if (operacao) {
            let novo: string | null = null;
            if (registro.data_real_conclusao) novo = 'CONCLUIDA';
            else if (atividade.status_operacional === 'CONCLUIDA') {
                novo = registro.data_mobilizacao_real || registro.data_inicio || registro.avanco_percentual > 0 ? 'EM_EXECUCAO' : 'PLANEJAMENTO';
            } else if (registro.data_mobilizacao_real || registro.data_inicio || registro.avanco_percentual > 0) {
                novo = proximoStatusAutomatico(atividade.status_operacional, 'EM_EXECUCAO');
            }
            if (novo && novo !== atividade.status_operacional) {
                await prisma.atividade.update({
                    where: { id: atividade_id },
                    data: { status_operacional: novo, data_conclusao: novo === 'CONCLUIDA' ? registro.data_real_conclusao : null },
                });
                await prisma.atividadeStatusHistorico.create({
                    data: {
                        atividade_id, dimensao: 'OPERACIONAL', status_de: atividade.status_operacional, status_para: novo,
                        observacao: novo === 'CONCLUIDA' ? 'Data de conclusão informada no Planejamento/Execução'
                            : atividade.status_operacional === 'CONCLUIDA' ? 'Data de conclusão removida no Planejamento/Execução' : 'Mobilização/execução iniciada',
                        criado_por: (req as any).user?.email || null,
                    },
                }).catch(() => undefined);
            } else if (novo === 'CONCLUIDA' && atividade.data_conclusao?.getTime() !== registro.data_real_conclusao?.getTime()) {
                await prisma.atividade.update({ where: { id: atividade_id }, data: { data_conclusao: registro.data_real_conclusao } });
            }
            if (registro.data_real_conclusao) await avaliarProntoParaFaturar(atividade_id);
            return res.json(registro);
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
        // Prazo lançado antes na Identificação aparece aqui até o planejamento ser salvo.
        const a = await prisma.atividade.findUnique({ where: { id: atividade_id }, select: { data_inicio_planejada: true, data_fim_planejada: true } });
        if (!registro) return res.json(a?.data_inicio_planejada || a?.data_fim_planejada
            ? { data_mobilizacao_prevista: a.data_inicio_planejada, data_prevista_conclusao: a.data_fim_planejada, avanco_percentual: 0 } : null);
        res.json({
            ...registro,
            data_mobilizacao_prevista: registro.data_mobilizacao_prevista || (registro.data_execucao_prevista ? null : a?.data_inicio_planejada) || null,
            data_prevista_conclusao: registro.data_prevista_conclusao || a?.data_fim_planejada || null,
        });
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

// Arquivo do relatório enviado ao cliente (18/10/2026): o relatório fotográfico
// da operação (ou o RFI) guarda o Excel/PDF que de fato foi para o cliente.
const PASTA_RELATORIOS = path.resolve(process.cwd(), 'storage', 'relatorios');
const EXTENSOES_RELATORIO = ['.pdf', '.xlsx', '.xls', '.xlsm', '.csv'];

export async function anexarArquivoRFI(req: Request, res: Response) {
    try {
        const arquivo = (req as any).file as Express.Multer.File | undefined;
        if (!arquivo) return res.status(400).json({ error: 'Envie o arquivo do relatório' });
        const nome = path.basename(nomeArquivoUtf8(arquivo.originalname)).replace(/[<>:"/\|?*\x00-\x1f]/g, '_');
        const ext = path.extname(nome).toLowerCase();
        if (!EXTENSOES_RELATORIO.includes(ext)) return res.status(400).json({ error: 'O relatório deve ser PDF ou Excel (.pdf, .xlsx, .xls, .xlsm, .csv)' });
        const rfi = await prisma.rFI.findUnique({ where: { id: req.params.id } });
        if (!rfi) return res.status(404).json({ error: 'Relatório não encontrado' });
        const pasta = path.join(PASTA_RELATORIOS, rfi.id);
        fs.rmSync(pasta, { recursive: true, force: true });
        fs.mkdirSync(pasta, { recursive: true });
        fs.writeFileSync(path.join(pasta, nome), arquivo.buffer);
        res.json(await prisma.rFI.update({ where: { id: rfi.id }, data: { relatorio_url: `relatorios/${rfi.id}/${nome}` } }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Remove só o arquivo anexado ao envio, mantendo o registro (05/11/2026). */
export async function removerArquivoRFI(req: Request, res: Response) {
    try {
        const rfi = await prisma.rFI.findUnique({ where: { id: req.params.id } });
        if (!rfi) return res.status(404).json({ error: 'Relatório não encontrado' });
        fs.rmSync(path.join(PASTA_RELATORIOS, rfi.id), { recursive: true, force: true });
        res.json(await prisma.rFI.update({ where: { id: rfi.id }, data: { relatorio_url: null } }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

/** Exclui um relatório/RFI enviado e o arquivo anexado a ele (05/11/2026). */
export async function excluirRFI(req: Request, res: Response) {
    try {
        const rfi = await prisma.rFI.findUnique({ where: { id: req.params.id } });
        if (!rfi) return res.status(404).json({ error: 'Relatório não encontrado' });
        await prisma.rFI.delete({ where: { id: rfi.id } });
        fs.rmSync(path.join(PASTA_RELATORIOS, rfi.id), { recursive: true, force: true });
        await prisma.auditLog.create({
            data: {
                tenant_id: rfi.tenant_id, entidade: 'RFI', entidade_id: rfi.id, acao: 'RELATORIO_EXCLUIDO',
                antes_json: JSON.stringify(rfi), user_id: (req as any).user?.userId || null,
            },
        }).catch(() => undefined);
        res.status(204).end();
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function baixarArquivoRFI(req: Request, res: Response) {
    try {
        const rfi = await prisma.rFI.findUnique({ where: { id: req.params.id } });
        const rel = rfi?.relatorio_url || '';
        if (!rfi || !rel.startsWith(`relatorios/${rfi.id}/`)) return res.status(404).json({ error: 'Este relatório não tem arquivo anexado' });
        const arquivo = path.join(PASTA_RELATORIOS, rfi.id, path.basename(rel));
        if (!fs.existsSync(arquivo)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(rel))}`);
        res.sendFile(arquivo);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}
