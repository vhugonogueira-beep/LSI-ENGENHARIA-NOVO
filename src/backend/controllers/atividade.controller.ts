import { Request, Response } from 'express';
import { prisma } from '../server';
import { proximoCodigo } from '../services/codigo-sequencial.service';
import { STATUS_ATIVIDADE } from '../services/status-atividade.service';
import { gerarMatrizDocumental, recalcularStatusDocumental } from '../services/documentacao.service';
import { normalizarUf } from '../utils/uf';
import { removerArquivoDoDisco } from '../services/po-arquivo.service';
import { sincronizarPendenciasAtividade } from '../services/sincronizacao-pendencias.service';

async function getTenantId(req: Request): Promise<string> {
    const fromQuery = (req.query.tenantId as string) || ((req as any).tenantId as string);
    if (fromQuery) return fromQuery;
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}


const DIMENSOES = ['status_operacional', 'status_comercial', 'status_documental', 'status_financeiro', 'status_faturamento'] as const;
type Dimensao = typeof DIMENSOES[number];

const DIMENSAO_LABEL: Record<Dimensao, string> = {
    status_operacional: 'OPERACIONAL',
    status_comercial: 'COMERCIAL',
    status_documental: 'DOCUMENTAL',
    status_financeiro: 'FINANCEIRO',
    status_faturamento: 'FATURAMENTO',
};

export async function listAtividades(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { tipo_demanda, sharing, status_operacional, acionamento_id } = req.query;

        const where: any = { tenant_id };
        if (tipo_demanda) where.tipo_demanda = tipo_demanda;
        if (sharing) where.sharing = sharing;
        if (status_operacional) where.status_operacional = status_operacional;
        if (acionamento_id) where.acionamento_id = acionamento_id;

        const atividades = await prisma.atividade.findMany({
            where,
            include: {
                acionamento: { select: { codigo: true, titulo: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 1 },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json(atividades);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Carteira central de Atividades: fornecedor principal, PO, custo pago e avanço,
// calculados em lote (evita N+1) e devolvidos junto com cada atividade.
export async function listAtividadesCarteira(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const { tipo_demanda, sharing, status_operacional } = req.query;

        const where: any = { tenant_id };
        if (tipo_demanda) where.tipo_demanda = tipo_demanda;
        if (sharing) where.sharing = sharing;
        if (status_operacional) where.status_operacional = status_operacional;

        const atividades = await prisma.atividade.findMany({
            where,
            orderBy: { created_at: 'desc' },
        });
        const ids = atividades.map(a => a.id);
        if (ids.length === 0) return res.json([]);

        const [contratacoes, pos, execucoes, parcelasPagas, documentos] = await Promise.all([
            prisma.contratacaoFornecedor.findMany({
                where: { atividade_id: { in: ids }, status: 'ATIVA' },
                include: { supplier: { select: { nome: true } }, funcionario: { select: { nome: true } } },
                orderBy: { created_at: 'asc' },
            }),
            prisma.purchaseOrder.findMany({
                where: { atividade_id: { in: ids } },
                orderBy: { created_at: 'desc' },
            }),
            prisma.registroExecucao.findMany({ where: { atividade_id: { in: ids } } }),
            prisma.parcelaPagamento.findMany({
                where: {
                    status: { in: ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'] },
                    contratacao: { atividade_id: { in: ids } },
                },
                include: { contratacao: { select: { atividade_id: true } } },
            }),
            prisma.documentoAtividade.findMany({
                where: {
                    atividade_id: { in: ids },
                    aplicavel: true,
                    requisito: { obrigatorio: true },
                },
                select: {
                    atividade_id: true,
                    status: true,
                    justificativa_na: true,
                },
            }),
        ]);

        const fornecedorPorAtividade = new Map<string, string>();
        for (const c of contratacoes) if (!fornecedorPorAtividade.has(c.atividade_id)) fornecedorPorAtividade.set(c.atividade_id, c.supplier?.nome || c.funcionario?.nome || '');

        const poPorAtividade = new Map<string, typeof pos[number]>();
        for (const po of pos) if (!poPorAtividade.has(po.atividade_id)) poPorAtividade.set(po.atividade_id, po);

        const execucaoPorAtividade = new Map(execucoes.map(e => [e.atividade_id, e]));

        const custoPagoPorAtividade = new Map<string, number>();
        for (const p2 of parcelasPagas) {
            const atvId = p2.contratacao.atividade_id;
            custoPagoPorAtividade.set(atvId, (custoPagoPorAtividade.get(atvId) || 0) + p2.valor);
        }

        const documentosPorAtividade = new Map<string, typeof documentos>();
        for (const documento of documentos) {
            documentosPorAtividade.set(documento.atividade_id, [
                ...(documentosPorAtividade.get(documento.atividade_id) || []),
                documento,
            ]);
        }

        const carteira = atividades.map(a => {
            const custoPago = custoPagoPorAtividade.get(a.id) || 0;
            const budget = a.valor_contrato ?? 0;
            const docs = documentosPorAtividade.get(a.id) || [];
            const docsOk = docs.filter(documento => documento.status === 'APROVADO'
                || (documento.status === 'NAO_APLICAVEL' && Boolean(documento.justificativa_na))).length;
            const docsCorrecao = docs.filter(documento =>
                ['REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO'].includes(documento.status)
            ).length;
            return {
                ...a,
                fornecedor_principal: fornecedorPorAtividade.get(a.id) || null,
                po: poPorAtividade.get(a.id) || null,
                avanco_percentual: execucaoPorAtividade.get(a.id)?.avanco_percentual ?? 0,
                custo_pago: custoPago,
                saldo: budget - custoPago,
                documentos_total: docs.length,
                documentos_ok: docsOk,
                documentos_pendentes: Math.max(docs.length - docsOk, 0),
                documentos_correcao: docsCorrecao,
                documentos_percentual: docs.length ? Math.round((docsOk / docs.length) * 100) : 0,
            };
        });

        res.json(carteira);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function getAtividade(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const atividade = await prisma.atividade.findUnique({
            where: { id },
            include: {
                contratante: true,
                acionamento: true,
                statusHistorico: { orderBy: { criado_em: 'desc' } },
                orcamentos: {
                    orderBy: { updated_at: 'desc' },
                    select: { id: true, assunto: true, status: true, versao_atual: true, created_at: true, tipo_orcamento: true },
                },
            },
        });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });
        res.json(atividade);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function createAtividade(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);
        const {
            titulo, acionamento_id, tipo_demanda, subtipo_demanda, tipo_obra, tipo_site_highline, tipo_atividade, modelo_operacao,
            sharing, operadora, contratante_id, contrato, id_site_sharing, id_site_operadora, estado, municipio,
            valor_contrato, valor_orcado, responsavel, descricao,
            data_inicio_planejada, data_fim_planejada,
        } = req.body;

        if (!titulo || !tipo_demanda || !sharing || !id_site_sharing || !id_site_operadora) {
            return res.status(400).json({ error: 'titulo, tipo_demanda, sharing, id_site_sharing e id_site_operadora são obrigatórios' });
        }
        const estadoNormalizado = normalizarUf(estado);
        const estadoFoiPreenchido = estado !== undefined && estado !== null && String(estado).trim() !== '';
        if (estadoFoiPreenchido && !estadoNormalizado) {
            return res.status(400).json({ error: 'UF inválida' });
        }
        if (String(sharing).trim().toUpperCase() === 'HIGHLINE' && tipo_demanda === 'IMPLANTACAO'
            && !estadoNormalizado) {
            return res.status(400).json({ error: 'UF é obrigatória para implantação Highline' });
        }
        const highlineSiteTypes = ['BTS', 'Roof Top', 'Collo - BTS', 'Collo RT', 'Reforço'];
        if (sharing.toUpperCase() === 'HIGHLINE' && tipo_demanda === 'IMPLANTACAO'
            && !highlineSiteTypes.includes(tipo_site_highline)) {
            return res.status(400).json({ error: 'tipo_site_highline é obrigatório para implantação Highline' });
        }

        const modelosValidos = tipo_demanda === 'IMPLANTACAO'
            ? ['MEDIANTE_APROVACAO']
            : ['EXECUCAO_DIRETA', 'EXECUCAO_COM_APROVACAO'];
        if (modelo_operacao && !modelosValidos.includes(modelo_operacao)) {
            return res.status(400).json({ error: 'modelo_operacao incompatível com o tipo_demanda' });
        }

        const codigo = await proximoCodigo(prisma.atividade, 'ATV');

        // O sharing já diz quem é o cliente — se existe um Contratante com esse nome,
        // vincula sozinho. Sem isso a atividade nasce sem contratante e trava a criação
        // do orçamento por um dado que o sistema já tinha.
        let contratanteResolvido = contratante_id || null;
        if (!contratanteResolvido && sharing) {
            const chave = (v: string) => v.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
            const candidatos = await prisma.contratante.findMany({ where: { tenant_id } });
            const achado = candidatos.find(c => chave(c.nome) === chave(sharing))
                || candidatos.find(c => chave(c.nome).startsWith(chave(sharing)));
            if (achado) contratanteResolvido = achado.id;
        }

        // Tipo de demanda decide o modelo de operação padrão (Blueprint LSI, seção 05):
        // Implantação → Mediante Aprovação (exige APC); qualquer outra → Execução Direta.
        // Sempre editável manualmente via modelo_operacao explícito.
        const modeloDefault = tipo_demanda === 'IMPLANTACAO' ? 'MEDIANTE_APROVACAO' : 'EXECUCAO_DIRETA';

        const atividade = await prisma.atividade.create({
            data: {
                tenant_id,
                codigo,
                acionamento_id: acionamento_id || null,
                titulo,
                tipo_demanda,
                subtipo_demanda: subtipo_demanda || null,
                tipo_obra: tipo_obra || null,
                tipo_site_highline: tipo_site_highline || null,
                tipo_atividade: tipo_atividade || null,
                modelo_operacao: modelo_operacao || modeloDefault,
                sharing,
                operadora: operadora || null,
                contratante_id: contratanteResolvido,
                contrato: contrato || null,
                id_site_sharing: id_site_sharing.trim(),
                id_site_operadora: id_site_operadora.trim(),
                estado: estadoNormalizado,
                municipio: municipio || null,
                valor_contrato: valor_contrato ? parseFloat(valor_contrato) : null,
                valor_orcado: valor_orcado ? parseFloat(valor_orcado) : null,
                responsavel: responsavel || null,
                descricao: descricao || null,
                data_inicio_planejada: data_inicio_planejada ? new Date(data_inicio_planejada) : null,
                data_fim_planejada: data_fim_planejada ? new Date(data_fim_planejada) : null,
                created_by: (req as any).user?.email || null,
                statusHistorico: {
                    create: {
                        dimensao: 'OPERACIONAL',
                        status_de: null,
                        status_para: 'PLANEJAMENTO',
                        observacao: 'Atividade criada',
                        criado_por: (req as any).user?.email || null,
                    },
                },
            },
            include: {
                acionamento: { select: { codigo: true, titulo: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 1 },
            },
        });

        // Automação (Blueprint LSI, seção 21): gera a matriz documental assim que o tipo de
        // obra é conhecido, sem esperar o RFI — documentação começa em paralelo à obra.
        if (atividade.tipo_obra) {
            await gerarMatrizDocumental(atividade.id, atividade.tipo_obra);
        }
        await recalcularStatusDocumental(atividade.id);

        res.status(201).json(atividade);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function updateAtividade(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const body = req.body;

        const existing = await prisma.atividade.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Atividade não encontrada' });

        const nextSharing = String(body.sharing ?? existing.sharing).toUpperCase();
        const nextDemandType = body.tipo_demanda ?? existing.tipo_demanda;
        const nextHighlineSiteType = body.tipo_site_highline !== undefined
            ? body.tipo_site_highline
            : existing.tipo_site_highline;
        const estadoFoiInformado = Object.prototype.hasOwnProperty.call(body, 'estado');
        const estadoRecebido = estadoFoiInformado ? body.estado : existing.estado;
        const estadoNormalizado = normalizarUf(estadoRecebido);
        const estadoFoiPreenchido = estadoRecebido !== undefined && estadoRecebido !== null
            && String(estadoRecebido).trim() !== '';
        if (estadoFoiInformado && estadoFoiPreenchido && !estadoNormalizado) {
            return res.status(400).json({ error: 'UF inválida' });
        }
        const touchesHighlineLocation = ['sharing', 'tipo_demanda', 'estado']
            .some(field => Object.prototype.hasOwnProperty.call(body, field));
        if (touchesHighlineLocation && nextSharing === 'HIGHLINE' && nextDemandType === 'IMPLANTACAO'
            && !estadoNormalizado) {
            return res.status(400).json({ error: 'UF é obrigatória para implantação Highline' });
        }
        const highlineSiteTypes = ['BTS', 'Roof Top', 'Collo - BTS', 'Collo RT', 'Reforço'];
        const touchesHighlineIdentity = ['sharing', 'tipo_demanda', 'tipo_obra', 'tipo_site_highline']
            .some(field => Object.prototype.hasOwnProperty.call(body, field));
        if (nextHighlineSiteType && !highlineSiteTypes.includes(nextHighlineSiteType)) {
            return res.status(400).json({ error: 'tipo_site_highline inválido' });
        }
        if (touchesHighlineIdentity && nextSharing === 'HIGHLINE' && nextDemandType === 'IMPLANTACAO'
            && !nextHighlineSiteType) {
            return res.status(400).json({ error: 'tipo_site_highline é obrigatório para implantação Highline' });
        }

        // O status operacional é o único com fluxo fechado (os outros quatro ainda
        // aceitam texto livre do cliente legado). Barra aqui para um POST torto
        // não plantar um estado que nenhuma tela sabe desenhar.
        if (body.status_operacional !== undefined
            && !(STATUS_ATIVIDADE as readonly string[]).includes(body.status_operacional)) {
            return res.status(400).json({
                error: `status_operacional inválido. Use: ${STATUS_ATIVIDADE.join(', ')}`,
            });
        }

        // Detecta mudança em qualquer uma das 5 dimensões de status para gerar histórico próprio de cada uma.
        const historicoCreates: any[] = [];
        for (const dim of DIMENSOES) {
            if (body[dim] !== undefined && body[dim] !== (existing as any)[dim]) {
                historicoCreates.push({
                    dimensao: DIMENSAO_LABEL[dim],
                    status_de: (existing as any)[dim],
                    status_para: body[dim],
                    observacao: body.observacao_status || null,
                    criado_por: (req as any).user?.email || null,
                });
            }
        }

        const data: any = {
            titulo: body.titulo ?? existing.titulo,
            tipo_demanda: body.tipo_demanda ?? existing.tipo_demanda,
            subtipo_demanda: body.subtipo_demanda !== undefined ? body.subtipo_demanda : existing.subtipo_demanda,
            tipo_obra: body.tipo_obra !== undefined ? body.tipo_obra : existing.tipo_obra,
            tipo_site_highline: body.tipo_site_highline !== undefined ? body.tipo_site_highline : existing.tipo_site_highline,
            tipo_atividade: body.tipo_atividade !== undefined ? body.tipo_atividade : existing.tipo_atividade,
            modelo_operacao: body.modelo_operacao ?? existing.modelo_operacao,
            sharing: body.sharing ?? existing.sharing,
            operadora: body.operadora !== undefined ? body.operadora : existing.operadora,
            contratante_id: body.contratante_id !== undefined ? body.contratante_id : existing.contratante_id,
            contrato: body.contrato !== undefined ? body.contrato : existing.contrato,
            id_site_sharing: body.id_site_sharing !== undefined ? body.id_site_sharing : existing.id_site_sharing,
            id_site_operadora: body.id_site_operadora !== undefined ? body.id_site_operadora : existing.id_site_operadora,
            estado: estadoFoiInformado ? estadoNormalizado : (estadoNormalizado || existing.estado),
            municipio: body.municipio !== undefined ? body.municipio : existing.municipio,
            valor_contrato: body.valor_contrato !== undefined ? parseFloat(body.valor_contrato) : existing.valor_contrato,
            valor_orcado: body.valor_orcado !== undefined ? parseFloat(body.valor_orcado) : existing.valor_orcado,
            responsavel: body.responsavel !== undefined ? body.responsavel : existing.responsavel,
            gestor: body.gestor !== undefined ? body.gestor : existing.gestor,
            descricao: body.descricao !== undefined ? body.descricao : existing.descricao,
            // Pasta da obra no servidor; sai nos e-mails financeiros.
            diretorio_url: body.diretorio_url !== undefined ? (body.diretorio_url || null) : existing.diretorio_url,
            data_inicio_planejada: body.data_inicio_planejada !== undefined ? (body.data_inicio_planejada ? new Date(body.data_inicio_planejada) : null) : existing.data_inicio_planejada,
            data_fim_planejada: body.data_fim_planejada !== undefined ? (body.data_fim_planejada ? new Date(body.data_fim_planejada) : null) : existing.data_fim_planejada,
            data_conclusao: body.data_conclusao !== undefined ? (body.data_conclusao ? new Date(body.data_conclusao) : null) : existing.data_conclusao,
        };
        for (const dim of DIMENSOES) {
            if (body[dim] !== undefined) data[dim] = body[dim];
        }
        if (historicoCreates.length > 0) {
            data.statusHistorico = { create: historicoCreates };
        }

        const atividade = await prisma.atividade.update({
            where: { id },
            data,
            include: {
                acionamento: { select: { codigo: true, titulo: true } },
                statusHistorico: { orderBy: { criado_em: 'desc' }, take: 5 },
            },
        });

        if (atividade.tipo_obra
            && (atividade.tipo_obra !== existing.tipo_obra || atividade.sharing !== existing.sharing)) {
            await gerarMatrizDocumental(atividade.id, atividade.tipo_obra);
            await recalcularStatusDocumental(atividade.id);
        }

        // Documentos ainda apenas gerados acompanham os dados mestres da
        // atividade. Contratos enviados ou assinados permanecem imutaveis.
        await sincronizarPendenciasAtividade(atividade.id);

        res.json(atividade);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// Excluir uma atividade apaga toda a cadeia ligada a ela (cronograma, APC, RFI, execução,
// documentação, POs com seus PDFs, contratações e orçamentos vinculados). Por isso é
// restrito a administrador, exige justificativa e é bloqueado quando já existe
// faturamento com o cliente — nesse caso o histórico não pode simplesmente sumir.
export async function deleteAtividade(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { motivo, autor } = req.body || {};
        const usuario = autor || (req as any).user;

        if (usuario?.role && usuario.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Apenas administradores podem excluir uma atividade' });
        }
        if ((motivo || '').trim().length < 10) {
            return res.status(400).json({ error: 'Descreva o motivo da exclusão (mínimo de 10 caracteres)' });
        }

        const atividade = await prisma.atividade.findUnique({ where: { id } });
        if (!atividade) return res.status(404).json({ error: 'Atividade não encontrada' });

        // Bloqueios de negócio: o que já foi comunicado ao cliente ou pago não pode sumir.
        const pos = await prisma.purchaseOrder.findMany({
            where: { atividade_id: id },
            include: { arquivos: true, linhas: { include: { faturamentos: true } } },
        });
        const temFaturamento = pos.some(p => p.linhas.some(l => l.faturamentos.some(f => f.status !== 'CANCELADO')));
        if (temFaturamento) {
            return res.status(400).json({
                error: 'Esta atividade tem faturamento solicitado ao cliente. Cancele os faturamentos na tela de Faturamento antes de excluí-la.',
            });
        }
        const emLote = await prisma.faturamentoAtividade.count({ where: { atividade_id: id } });
        if (emLote > 0) {
            return res.status(400).json({ error: 'Esta atividade já foi incluída em um lote de faturamento e não pode ser excluída.' });
        }
        const parcelasPagas = await prisma.parcelaPagamento.count({
            where: { contratacao: { atividade_id: id }, status: { in: ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'] } },
        });
        if (parcelasPagas > 0) {
            return res.status(400).json({ error: 'Existem parcelas já pagas a fornecedores nesta atividade. A exclusão apagaria esse histórico financeiro.' });
        }

        // Registra a exclusão antes de apagar, para ficar rastro de quem e por quê.
        console.log(`[EXCLUSÃO DE ATIVIDADE] ${atividade.codigo} — ${atividade.titulo} | por: ${usuario?.nome || usuario?.email || 'desconhecido'} | motivo: ${String(motivo).trim()}`);

        await prisma.$transaction(async tx => {
            // POs e seus filhos
            for (const po of pos) {
                for (const linha of po.linhas) {
                    await tx.faturamentoLinha.deleteMany({ where: { linha_id: linha.id } });
                }
                await tx.purchaseOrderLinha.deleteMany({ where: { po_id: po.id } });
                await tx.purchaseOrderArquivo.deleteMany({ where: { po_id: po.id } });
            }
            await tx.purchaseOrder.deleteMany({ where: { atividade_id: id } });

            // Contratações de fornecedor e seus filhos
            const contratacoes = await tx.contratacaoFornecedor.findMany({ where: { atividade_id: id }, select: { id: true } });
            for (const c of contratacoes) {
                const parcelas = await tx.parcelaPagamento.findMany({ where: { contratacao_id: c.id }, select: { id: true } });
                for (const p of parcelas) {
                    await tx.solicitacaoPagamento.deleteMany({ where: { parcela_id: p.id } });
                }
                await tx.parcelaPagamento.deleteMany({ where: { contratacao_id: c.id } });
                await tx.contrato.deleteMany({ where: { contratacao_id: c.id } });
            }
            await tx.contratacaoFornecedor.deleteMany({ where: { atividade_id: id } });

            // Documentação
            const documentos = await tx.documentoAtividade.findMany({ where: { atividade_id: id }, select: { id: true } });
            for (const d of documentos) {
                await tx.documentoAtividadeArquivo.deleteMany({ where: { documento_id: d.id } });
            }
            await tx.documentoAtividade.deleteMany({ where: { atividade_id: id } });

            // Negociações e orçamentos
            const negociacoes = await tx.negociacao.findMany({ where: { atividade_id: id }, select: { id: true } });
            for (const n of negociacoes) {
                await tx.contraproposta.deleteMany({ where: { negociacao_id: n.id } });
            }
            await tx.negociacao.deleteMany({ where: { atividade_id: id } });
            // orçamentos ficam no sistema, apenas desvinculados
            await tx.budget.updateMany({ where: { atividade_id: id }, data: { atividade_id: null } });

            // Obra
            await tx.rFI.deleteMany({ where: { atividade_id: id } });
            await tx.aPC.deleteMany({ where: { atividade_id: id } });
            await tx.cronogramaItem.deleteMany({ where: { atividade_id: id } });
            await tx.registroExecucao.deleteMany({ where: { atividade_id: id } });
            await tx.aceite.deleteMany({ where: { atividade_id: id } });
            await tx.atividadeStatusHistorico.deleteMany({ where: { atividade_id: id } });

            await tx.atividade.delete({ where: { id } });
        });

        // Arquivos em disco só depois que o banco confirmou
        for (const po of pos) {
            for (const arq of po.arquivos) {
                await removerArquivoDoDisco(arq.storage_key).catch(() => undefined);
            }
        }

        res.json({ ok: true, codigo: atividade.codigo });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
}

export async function getAtividadeStats(req: Request, res: Response) {
    try {
        const tenant_id = await getTenantId(req);

        const [porOperacional, porComercial, porFaturamento, porTipo, porSharing, totais] = await Promise.all([
            prisma.atividade.groupBy({ by: ['status_operacional'], where: { tenant_id }, _count: true }),
            prisma.atividade.groupBy({ by: ['status_comercial'], where: { tenant_id }, _count: true }),
            prisma.atividade.groupBy({ by: ['status_faturamento'], where: { tenant_id }, _count: true }),
            prisma.atividade.groupBy({ by: ['tipo_demanda'], where: { tenant_id }, _count: true }),
            prisma.atividade.groupBy({ by: ['sharing'], where: { tenant_id }, _count: true }),
            prisma.atividade.aggregate({
                where: { tenant_id },
                _sum: { valor_contrato: true, valor_orcado: true },
                _count: true,
            }),
        ]);

        res.json({ porOperacional, porComercial, porFaturamento, porTipo, porSharing, totais });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
