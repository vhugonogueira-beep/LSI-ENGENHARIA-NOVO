import { Request, Response } from 'express';
import { prisma } from '../server';
import { avaliarProntoParaFaturar } from '../services/gates.service';
import { storePOArquivo, getStoredPOArquivo, deleteStoredPOArquivo, relerPOArquivo, removerArquivoDoDisco } from '../services/po-arquivo.service';
import {
    linhasDaPOComSaldo, solicitarFaturamentoLinhas, cancelarFaturamentoLinha,
    atualizarStatusFaturamentoLinha, gerarEmailFaturamento, definirAutorizacaoLinha, gerarPlanilhaFaturamento,
} from '../services/faturamento-linha.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

// PO / RC — lastro comercial para faturamento (Blueprint LSI, seção 25).
export async function createPO(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, numero, valor, data, parcela, portal_status } = req.body;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });

        const po = await prisma.purchaseOrder.create({
            data: {
                tenant_id,
                atividade_id,
                numero: numero || null,
                valor: valor != null ? parseFloat(valor) : null,
                data: data ? new Date(data) : null,
                parcela: parcela || null,
                portal_status: portal_status || null,
                status: 'AGUARDANDO',
                created_by: (req as any).user?.email || null,
            },
        });
        res.status(201).json(po);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listPOs(req: Request, res: Response) {
    try {
        const { atividade_id } = req.query;
        const where: any = {};
        if (atividade_id) where.atividade_id = atividade_id;
        res.json(await prisma.purchaseOrder.findMany({
            where,
            include: { arquivos: { orderBy: { created_at: 'desc' } } },
            orderBy: { created_at: 'desc' },
        }));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Correção manual do que a leitura do PDF não acertou (número, valor, data).
export async function updatePO(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'PO não encontrada' });

        const po = await prisma.purchaseOrder.update({
            where: { id },
            data: {
                numero: body.numero !== undefined ? body.numero : existing.numero,
                valor: body.valor !== undefined ? (body.valor != null ? parseFloat(body.valor) : null) : existing.valor,
                data: body.data !== undefined ? (body.data ? new Date(body.data) : null) : existing.data,
                parcela: body.parcela !== undefined ? body.parcela : existing.parcela,
                observacoes: body.observacoes !== undefined ? body.observacoes : existing.observacoes,
            },
        });
        res.json(po);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Exclui a PO inteira (linhas, anexos e arquivos em disco). Bloqueia quando já existe
// faturamento solicitado nas linhas — apagar apagaria o histórico com o cliente.
export async function deletePO(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { arquivos: true, linhas: { include: { faturamentos: true } } },
        });
        if (!po) return res.status(404).json({ error: 'PO não encontrada' });

        const autor = req.body?.autor || (req as any).user;
        if (autor?.role && autor.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Apenas administradores podem excluir uma PO' });
        }

        const comFaturamento = po.linhas.some(l => l.faturamentos.some(f => f.status !== 'CANCELADO'));
        if (comFaturamento) {
            return res.status(400).json({
                error: 'Esta PO já tem faturamento solicitado em alguma linha. Cancele os faturamentos na tela de Faturamento antes de excluí-la.',
            });
        }

        for (const arq of po.arquivos) {
            await removerArquivoDoDisco(arq.storage_key).catch(() => undefined);
        }
        for (const linha of po.linhas) {
            await prisma.faturamentoLinha.deleteMany({ where: { linha_id: linha.id } });
        }
        await prisma.purchaseOrderLinha.deleteMany({ where: { po_id: id } });
        await prisma.purchaseOrderArquivo.deleteMany({ where: { po_id: id } });
        await prisma.purchaseOrder.delete({ where: { id } });

        await avaliarProntoParaFaturar(po.atividade_id);
        res.json({ ok: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function uploadPOArquivo(req: Request, res: Response) {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecione o PDF da PO para anexar' });
        const { attachment, leitura } = await storePOArquivo(req.params.id, req.file, (req as any).user?.email);
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: req.params.id },
            include: { arquivos: { orderBy: { created_at: 'desc' } } },
        });
        res.status(201).json({ attachment, leitura, po });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Fluxo principal da PO: recebe só o PDF e cria a PO já com o que foi lido do documento —
// quem recebe a PO não digita nada, apenas confere depois.
export async function criarPODoPdf(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id } = req.body;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });
        if (!req.file) return res.status(400).json({ error: 'Selecione o PDF da PO' });

        const po = await prisma.purchaseOrder.create({
            data: { tenant_id, atividade_id, status: 'AGUARDANDO', created_by: (req as any).user?.email || null },
        });

        const { leitura } = await storePOArquivo(po.id, req.file, (req as any).user?.email);
        const completa = await prisma.purchaseOrder.findUnique({
            where: { id: po.id },
            include: { arquivos: { orderBy: { created_at: 'desc' } } },
        });
        res.status(201).json({ po: completa, leitura });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// POs de todas as atividades — alimenta a tela de Faturamento na barra lateral, que é
// onde se decide a liberação para faturamento e o percentual a faturar.
export async function listPOsGeral(req: Request, res: Response) {
    try {
        const { status } = req.query;
        const where: any = {};
        if (status) where.status = status as string;

        const pos = await prisma.purchaseOrder.findMany({
            where,
            include: {
                arquivos: { orderBy: { created_at: 'desc' } },
                atividade: {
                    select: {
                        id: true, codigo: true, titulo: true, sharing: true, operadora: true,
                        id_site_sharing: true, id_site_operadora: true, valor_contrato: true,
                        status_operacional: true, status_faturamento: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(pos);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listLinhasDaPO(req: Request, res: Response) {
    try {
        res.json(await linhasDaPOComSaldo(req.params.id));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function solicitarFaturamentoDeLinhas(req: Request, res: Response) {
    try {
        const { itens, gestor } = req.body;
        const criados = await solicitarFaturamentoLinhas(itens, gestor);
        res.status(201).json(criados);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function atualizarFaturamentoLinha(req: Request, res: Response) {
    try {
        const { status, nf_numero } = req.body;
        res.json(await atualizarStatusFaturamentoLinha(req.params.id, status, nf_numero));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function cancelarLinhaFaturamento(req: Request, res: Response) {
    try {
        const { motivo, autor } = req.body || {};
        // Sem autenticação ligada nas rotas, o autor vem informado pela interface — ver
        // a ressalva no topo de po.routes.ts.
        res.json(await cancelarFaturamentoLinha(req.params.id, motivo, autor || (req as any).user));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function gerarEmailDeFaturamento(req: Request, res: Response) {
    try {
        const { ids, cliente, competencia } = req.body;
        res.json(await gerarEmailFaturamento(ids, { cliente, competencia }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Marca a linha como autorizada (ou não) para faturamento — equivale à coluna
// "Liberação Microsiga" da planilha usada com o cliente.
export async function autorizarLinha(req: Request, res: Response) {
    try {
        const { autorizado, observacao } = req.body;
        res.json(await definirAutorizacaoLinha(req.params.id, !!autorizado, observacao));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Planilha .xlsx no mesmo formato da que a LS Office envia ao cliente.
export async function baixarPlanilhaFaturamento(req: Request, res: Response) {
    try {
        const ids = String(req.query.ids || '').split(',').filter(Boolean);
        const { buffer, filename } = await gerarPlanilhaFaturamento(ids, {
            cliente: req.query.cliente as string | undefined,
            competencia: req.query.competencia as string | undefined,
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function relerPO(req: Request, res: Response) {
    try {
        const leitura = await relerPOArquivo(req.params.id);
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: req.params.id },
            include: { arquivos: { orderBy: { created_at: 'desc' } } },
        });
        res.json({ po, leitura });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function downloadPOArquivo(req: Request, res: Response) {
    try {
        const { attachment, absolutePath } = await getStoredPOArquivo(req.params.arquivoId);
        res.download(absolutePath, attachment.nome_original);
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

export async function deletePOArquivo(req: Request, res: Response) {
    try {
        await deleteStoredPOArquivo(req.params.arquivoId);
        res.status(204).send();
    } catch (e: any) {
        res.status(404).json({ error: e.message });
    }
}

// Validação da PO (Blueprint LSI, seção 26): confere PDF, valor e portal antes de liberar.
// Gera alerta explícito quando o valor diverge do orçamento aprovado da atividade.
export async function validarPO(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { arquivos: true } });
        if (!po) return res.status(404).json({ error: 'PO não encontrada' });
        if (po.arquivos.length === 0) return res.status(400).json({ error: 'PDF da PO não anexado' });
        if (po.valor == null) return res.status(400).json({ error: 'Valor da PO não informado' });

        const atividade = await prisma.atividade.findUnique({ where: { id: po.atividade_id } });

        let alerta: string | null = null;
        if (atividade?.valor_contrato != null && Math.round(po.valor) !== Math.round(atividade.valor_contrato)) {
            alerta = `Divergência de valor: PO = R$ ${po.valor.toFixed(2)} vs. orçamento aprovado = R$ ${atividade.valor_contrato.toFixed(2)}`;
        }

        const poAtualizada = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'VALIDADA' } });
        res.json({ ...poAtualizada, alerta });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Libera a PO para faturamento — reavalia o gate G10/G11 (Blueprint LSI, seção 27).
export async function liberarPO(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { percentual_liberado, valor_liberado } = req.body;

        const po = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!po) return res.status(404).json({ error: 'PO não encontrada' });
        if (po.status !== 'VALIDADA') return res.status(400).json({ error: 'PO precisa estar validada antes de ser liberada' });

        const poAtualizada = await prisma.purchaseOrder.update({
            where: { id },
            data: {
                status: 'LIBERADA',
                percentual_liberado: percentual_liberado != null ? parseFloat(percentual_liberado) : 100,
                valor_liberado: valor_liberado != null ? parseFloat(valor_liberado) : po.valor,
                data_liberacao: new Date(),
            },
        });

        const pronto = await avaliarProntoParaFaturar(po.atividade_id);

        res.json({ ...poAtualizada, atividade_pronta_para_faturar: pronto });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
