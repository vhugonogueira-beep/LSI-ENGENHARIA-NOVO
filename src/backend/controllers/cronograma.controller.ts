import { Request, Response } from 'express';
import { prisma } from '../server';
import { gerarCronogramaHtml } from '../services/cronograma-doc.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

// Etapas cujo item de cronograma alimenta um registro próprio: o cronograma é a única
// tela de acompanhamento de obra, então concluir o item de LIBERACAO gera o APC liberado
// (que destrava a execução) e o item de INSTALACAO/RFI gera o RFI — que é o que decide o
// caminho da regra condicional de faturamento (energizado x sem energia).
const CATEGORIAS_APC = ['LIBERACAO', 'APC'];
const CATEGORIAS_RFI = ['INSTALACAO', 'RFI'];

// Avanço físico da atividade = média do progresso das etapas do cronograma, exatamente
// como no cronograma impresso ("AVANÇO FÍSICO — MÉDIA DAS ATIVIDADES").
async function sincronizarAvancoFisico(atividade_id: string) {
    const itens = await prisma.cronogramaItem.findMany({ where: { atividade_id } });
    if (itens.length === 0) return;

    const media = Math.round(
        itens.reduce((acc, i) => acc + (i.progresso_percentual || 0), 0) / itens.length,
    );

    const registro = await prisma.registroExecucao.findFirst({ where: { atividade_id } });
    if (registro) {
        await prisma.registroExecucao.update({ where: { id: registro.id }, data: { avanco_percentual: media } });
    } else {
        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (atividade) {
            await prisma.registroExecucao.create({
                data: { tenant_id: atividade.tenant_id, atividade_id, avanco_percentual: media },
            });
        }
    }
}

// Itens de cronograma (Blueprint LSI, seção 17) — cadastrados ao longo do planejamento
// (compras, contratação, pagamentos, logística...), independente do APC estar liberado.
export async function createCronogramaItem(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id, titulo, categoria, grupo, progresso_percentual, visivel_cliente, responsavel, data_inicio, data_fim, duracao_dias, prioridade, predecessor_id, observacoes } = req.body;
        if (!atividade_id || !titulo || !categoria) {
            return res.status(400).json({ error: 'atividade_id, titulo e categoria são obrigatórios' });
        }

        const count = await prisma.cronogramaItem.count({ where: { atividade_id } });

        const item = await prisma.cronogramaItem.create({
            data: {
                tenant_id,
                atividade_id,
                titulo,
                categoria,
                grupo: grupo || null,
                progresso_percentual: progresso_percentual != null ? parseFloat(progresso_percentual) : 0,
                visivel_cliente: visivel_cliente !== undefined ? Boolean(visivel_cliente) : true,
                responsavel: responsavel || null,
                data_inicio: data_inicio ? new Date(data_inicio) : null,
                data_fim: data_fim ? new Date(data_fim) : null,
                duracao_dias: duracao_dias != null ? parseInt(duracao_dias) : null,
                prioridade: prioridade || 'MEDIA',
                predecessor_id: predecessor_id || null,
                observacoes: observacoes || null,
                ordem: count,
            },
        });
        await sincronizarAvancoFisico(atividade_id);
        res.status(201).json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function listCronogramaItens(req: Request, res: Response) {
    try {
        const { atividade_id } = req.query;
        if (!atividade_id) return res.status(400).json({ error: 'atividade_id é obrigatório' });
        const itens = await prisma.cronogramaItem.findMany({
            where: { atividade_id: atividade_id as string },
            orderBy: { ordem: 'asc' },
        });
        res.json(itens);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function updateCronogramaItem(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma.cronogramaItem.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Item de cronograma não encontrado' });

        const novoStatus = body.status ?? existing.status;
        // Concluir a etapa leva o progresso a 100 automaticamente, salvo se vier explícito.
        const novoProgresso = body.progresso_percentual !== undefined
            ? parseFloat(body.progresso_percentual)
            : (novoStatus === 'CONCLUIDO' && existing.status !== 'CONCLUIDO' ? 100 : existing.progresso_percentual);

        const item = await prisma.cronogramaItem.update({
            where: { id },
            data: {
                titulo: body.titulo ?? existing.titulo,
                categoria: body.categoria ?? existing.categoria,
                grupo: body.grupo !== undefined ? body.grupo : existing.grupo,
                visivel_cliente: body.visivel_cliente !== undefined ? Boolean(body.visivel_cliente) : existing.visivel_cliente,
                progresso_percentual: novoProgresso,
                responsavel: body.responsavel !== undefined ? body.responsavel : existing.responsavel,
                data_inicio: body.data_inicio !== undefined ? (body.data_inicio ? new Date(body.data_inicio) : null) : existing.data_inicio,
                data_fim: body.data_fim !== undefined ? (body.data_fim ? new Date(body.data_fim) : null) : existing.data_fim,
                duracao_dias: body.duracao_dias !== undefined ? parseInt(body.duracao_dias) : existing.duracao_dias,
                status: novoStatus,
                prioridade: body.prioridade ?? existing.prioridade,
                predecessor_id: body.predecessor_id !== undefined ? body.predecessor_id : existing.predecessor_id,
                observacoes: body.observacoes !== undefined ? body.observacoes : existing.observacoes,
            },
        });

        // Concluir a etapa de liberação/instalação materializa o registro que os gates usam.
        const concluiuAgora = novoStatus === 'CONCLUIDO' && existing.status !== 'CONCLUIDO';
        if (concluiuAgora && CATEGORIAS_APC.includes(item.categoria)) {
            const jaExiste = await prisma.aPC.findFirst({ where: { atividade_id: item.atividade_id } });
            if (!jaExiste) {
                await prisma.aPC.create({
                    data: {
                        tenant_id: item.tenant_id,
                        atividade_id: item.atividade_id,
                        numero: body.apc_numero || item.titulo,
                        data: item.data_fim || new Date(),
                        status: 'APC_LIBERADO',
                        responsavel: item.responsavel,
                    },
                });
            } else if (jaExiste.status !== 'APC_LIBERADO') {
                await prisma.aPC.update({ where: { id: jaExiste.id }, data: { status: 'APC_LIBERADO' } });
            }
            await prisma.atividade.update({
                where: { id: item.atividade_id },
                data: { status_operacional: 'APC_LIBERADO' },
            });
        }
        if (concluiuAgora && CATEGORIAS_RFI.includes(item.categoria)) {
            await prisma.rFI.create({
                data: {
                    tenant_id: item.tenant_id,
                    atividade_id: item.atividade_id,
                    data_envio: item.data_fim || new Date(),
                    energizado: body.rfi_energizado === undefined ? null : body.rfi_energizado,
                    observacoes: item.observacoes,
                },
            });
        }

        await sincronizarAvancoFisico(item.atividade_id);
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Troca a etapa de lugar com a vizinha. A ordem define tanto a lista quanto a sequência
// das linhas no cronograma entregue ao cliente.
export async function moverCronogramaItem(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { direcao } = req.body;
        if (!['cima', 'baixo'].includes(direcao)) {
            return res.status(400).json({ error: 'direcao deve ser "cima" ou "baixo"' });
        }

        const item = await prisma.cronogramaItem.findUnique({ where: { id } });
        if (!item) return res.status(404).json({ error: 'Etapa não encontrada' });

        const irmaos = await prisma.cronogramaItem.findMany({
            where: { atividade_id: item.atividade_id },
            orderBy: { ordem: 'asc' },
        });
        const pos = irmaos.findIndex(i => i.id === id);
        const destino = direcao === 'cima' ? pos - 1 : pos + 1;
        if (destino < 0 || destino >= irmaos.length) {
            return res.json({ ok: true, semMudanca: true });
        }

        // Reescreve a ordem inteira: as ordens podem estar com buracos ou repetidas
        // depois de exclusões, então normalizar aqui evita trocas que não saem do lugar.
        const nova = [...irmaos];
        [nova[pos], nova[destino]] = [nova[destino], nova[pos]];
        await prisma.$transaction(
            nova.map((i, idx) => prisma.cronogramaItem.update({ where: { id: i.id }, data: { ordem: idx } })),
        );

        res.json({ ok: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function deleteCronogramaItem(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const item = await prisma.cronogramaItem.findUnique({ where: { id } });
        await prisma.cronogramaItem.delete({ where: { id } });
        if (item) await sincronizarAvancoFisico(item.atividade_id);
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ── Modelo de etapas ────────────────────────────────────────────────────────
// Sequência padrão de obra, criada na primeira vez que alguém pede o modelo. Serve para
// não recadastrar APC, compras, obra civil, energia, estrutura e RFI a cada atividade.
const MODELO_PADRAO = [
    { titulo: 'Negociação', categoria: 'OUTROS', duracao_dias: 28, visivel_cliente: false, prioridade: 'MEDIA' },
    { titulo: 'APC', categoria: 'LIBERACAO', duracao_dias: 1, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'Compras, Logística de Obra e Acesso', categoria: 'PRE_OBRA', duracao_dias: 17, visivel_cliente: true, prioridade: 'MEDIA' },
    { titulo: 'Abertura de Obra', categoria: 'CIVIL', duracao_dias: 1, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'Execução de Obra Civil', categoria: 'CIVIL', duracao_dias: 14, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'Solicitação de Energia', categoria: 'ENERGIA', duracao_dias: 1, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'Ligação de Energia Definitiva', categoria: 'ENERGIA', duracao_dias: 1, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'Montagem dos Metálicos', categoria: 'ESTRUTURA', duracao_dias: 2, visivel_cliente: true, prioridade: 'ALTA' },
    { titulo: 'RFI', categoria: 'INSTALACAO', duracao_dias: 1, visivel_cliente: true, prioridade: 'ALTA' },
];

async function garantirModelo(tenant_id: string, tipo_obra?: string | null) {
    const existentes = await prisma.cronogramaModeloItem.findMany({
        where: { tenant_id, tipo_obra: tipo_obra || null },
        orderBy: { ordem: 'asc' },
    });
    if (existentes.length > 0) return existentes;
    if (tipo_obra) return [];

    await prisma.cronogramaModeloItem.createMany({
        data: MODELO_PADRAO.map((m, i) => ({ ...m, tenant_id, tipo_obra: null, ordem: i })),
    });
    return prisma.cronogramaModeloItem.findMany({ where: { tenant_id, tipo_obra: null }, orderBy: { ordem: 'asc' } });
}

export async function listModeloCronograma(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const tipo_obra = (req.query.tipo_obra as string) || null;
        const itens = await garantirModelo(tenant_id, tipo_obra);
        res.json(itens.length ? itens : await garantirModelo(tenant_id, null));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Aplica o modelo na atividade. As datas ficam em branco de propósito: cada obra tem o
// seu calendário, e a duração padrão serve de referência ao preencher.
export async function aplicarModeloCronograma(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id } = req.params;
        const { tipo_obra, data_inicio } = req.body || {};

        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        const modelo = await garantirModelo(tenant_id, tipo_obra || null);
        if (modelo.length === 0) return res.status(400).json({ error: 'Nenhuma etapa cadastrada no modelo' });

        const jaExistentes = await prisma.cronogramaItem.findMany({
            where: { atividade_id },
            select: { titulo: true },
        });
        const titulos = new Set(jaExistentes.map(i => i.titulo.trim().toUpperCase()));
        const novos = modelo.filter(m => !titulos.has(m.titulo.trim().toUpperCase()));
        if (novos.length === 0) {
            return res.json({ criados: 0, mensagem: 'Todas as etapas do modelo já estão no cronograma' });
        }

        // Com data de início informada, as etapas são encadeadas uma após a outra usando
        // a duração padrão de cada uma; sem ela, entram sem datas para preenchimento manual.
        let cursor = data_inicio ? new Date(`${data_inicio}T00:00:00.000Z`) : null;
        const base = jaExistentes.length;

        for (const [i, m] of novos.entries()) {
            let inicio: Date | null = null;
            let fim: Date | null = null;
            if (cursor) {
                inicio = new Date(cursor);
                const dias = Math.max(1, m.duracao_dias || 1);
                fim = new Date(cursor);
                fim.setUTCDate(fim.getUTCDate() + dias - 1);
                cursor = new Date(fim);
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
            await prisma.cronogramaItem.create({
                data: {
                    tenant_id,
                    atividade_id,
                    titulo: m.titulo,
                    categoria: m.categoria,
                    duracao_dias: m.duracao_dias,
                    visivel_cliente: m.visivel_cliente,
                    prioridade: m.prioridade,
                    data_inicio: inicio,
                    data_fim: fim,
                    ordem: base + i,
                },
            });
        }

        await sincronizarAvancoFisico(atividade_id);
        res.status(201).json({ criados: novos.length });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Salva o cronograma da atividade como novo modelo (substitui o anterior).
export async function salvarComoModelo(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { atividade_id } = req.params;
        const tipo_obra = req.body?.tipo_obra || null;

        const itens = await prisma.cronogramaItem.findMany({
            where: { atividade_id },
            orderBy: { ordem: 'asc' },
        });
        if (itens.length === 0) return res.status(400).json({ error: 'Este cronograma não tem etapas para salvar' });

        await prisma.cronogramaModeloItem.deleteMany({ where: { tenant_id, tipo_obra } });
        await prisma.cronogramaModeloItem.createMany({
            data: itens.map((i, idx) => ({
                tenant_id,
                tipo_obra,
                titulo: i.titulo,
                categoria: i.categoria,
                duracao_dias: i.duracao_dias
                    ?? (i.data_inicio && i.data_fim
                        ? Math.round((i.data_fim.getTime() - i.data_inicio.getTime()) / 86400000) + 1
                        : null),
                visivel_cliente: i.visivel_cliente,
                prioridade: i.prioridade,
                ordem: idx,
            })),
        });

        res.json({ ok: true, etapas: itens.length });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// Cronograma de obra em Gantt para acompanhamento semanal — abre em HTML para
// imprimir/salvar em PDF.
export async function exportCronogramaHtml(req: Request, res: Response) {
    try {
        const { html } = await gerarCronogramaHtml(req.params.atividade_id);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

// "Start Cronograma" (Blueprint LSI, seção 17): materializa o cronograma executivo a
// partir do planejamento já cadastrado — exige o APC liberado, mas não cria dados novos.
export async function startCronograma(req: Request, res: Response) {
    try {
        const { atividade_id } = req.params;
        const atividade = await prisma.atividade.findUnique({ where: { id: atividade_id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        if (!['APC_LIBERADO', 'EM_EXECUCAO', 'CONCLUIDA'].includes(atividade.status_operacional)) {
            return res.status(400).json({ error: 'APC ainda não foi liberado para esta atividade' });
        }

        const itens = await prisma.cronogramaItem.findMany({
            where: { atividade_id },
            orderBy: { ordem: 'asc' },
        });
        res.json({ atividade_id, total_itens: itens.length, itens });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
