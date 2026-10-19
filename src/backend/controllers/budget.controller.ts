import fs from 'fs';
import { nomeArquivoUtf8 } from '../utils/nome-arquivo';
import { Request, Response } from 'express';
import { BudgetService, calcularTotalLinha } from '../services/budget.service';
import { ExportService } from '../services/export.service';
import { prisma } from '../server';
import { generateHighlinePv, listHighlinePvCatalog } from '../services/highline-pv.service';
import { getHighlinePvDefaultPriceSet } from '../data/highline-pv-default-prices';
import { carregarPvDoCliente } from '../services/pv-cliente.service';
import { lpusDaAtividade } from '../services/lpu-atividade.service';
import { normalizarUf } from '../utils/uf';
import { lerOrcamentoArquivo } from '../services/orcamento-importacao.service';
import { emitirNumeroOrcamento } from '../services/orcamento-numero.service';
import { guardarArquivoImportado, listarArquivosImportados, caminhoArquivoImportado, removerArquivoImportado } from '../services/orcamento-arquivo.service';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class BudgetController {
    static async highlinePvCatalog(req: Request, res: Response) {
        try {
            const budgetId = typeof req.query.budgetId === 'string' ? req.query.budgetId : '';
            let uf = normalizarUf(req.query.uf);
            let baseId: string | null = null;

            if (budgetId) {
                const budget = await prisma.budget.findUnique({
                    where: { id: budgetId },
                    select: { pricebook_id: true, atividade_id: true, atividade: { select: { estado: true } } },
                });
                if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
                uf = normalizarUf(budget.atividade?.estado);
                // A base gravada no orçamento; orçamento antigo sem ela usa a
                // escolhida agora por área + cliente da atividade.
                baseId = budget.pricebook_id
                    || (budget.atividade_id ? (await lpusDaAtividade(budget.atividade_id))?.precoCliente?.id || null : null);
            }

            // A base "PV Padrão" (Bases/LPUs) é a fonte da verdade para estrutura E
            // preço. O catálogo do código e o arquivo por UF são reserva, para a PV
            // abrir numa instalação onde a base ainda não existe.
            const priceSet = getHighlinePvDefaultPriceSet(uf);
            const pv = await carregarPvDoCliente(baseId);

            const items = listHighlinePvCatalog().map(item => {
                const daBase = pv.porLinha.get(item.templateRow);
                const temPreco = !!daBase && daBase.valor > 0;
                const defaultUnitPrice = temPreco
                    ? daBase!.valor
                    : (priceSet?.values[item.templateRow] ?? null);
                return {
                    ...item,
                    // Descrição, categoria e unidade seguem a base quando ela tem a
                    // linha — é o que a tela de LPUs edita.
                    description: daBase?.descricao || item.description,
                    category: daBase?.categoria || item.category,
                    unit: daBase?.unidade || item.unit,
                    defaultUnitPrice,
                    priceSource: temPreco
                        ? pv.baseNome
                        : (defaultUnitPrice == null ? null : priceSet?.source),
                    priceDetail: temPreco ? daBase!.observacoes : null,
                    pricebookItemId: daBase?.itemId ?? null,
                };
            });
            const categories = [...new Set(items.map(item => item.category))];
            const pricedItems = items.filter(item => item.defaultUnitPrice != null).length;

            res.json({
                items,
                categories,
                total: items.length,
                context: {
                    uf,
                    priceSource: pv.baseNome || priceSet?.source || null,
                    pricedItems,
                    totalItems: items.length,
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getAll(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const budgets = await BudgetService.getBudgetsByTenant(tenantId);
            res.json(budgets);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const budget = await BudgetService.getBudgetById(req.params.id);
            if (!budget) return res.status(404).json({ error: 'Not found' });
            res.json(budget);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const budget = await BudgetService.createBudget(req.body);
            res.status(201).json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateHeader(req: Request, res: Response) {
        try {
            const budget = await BudgetService.updateBudgetHeader(req.params.id, req.body);
            res.json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateItems(req: Request, res: Response) {
        try {
            const { items, versaoAtual, expectedUpdatedAt, scope } = req.body;
            const budget = await BudgetService.updateBudgetItems(req.params.id, versaoAtual, items, expectedUpdatedAt, scope);
            res.json(budget);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async definirModelo(req: Request, res: Response) {
        try {
            res.json(await BudgetService.definirModelo(req.params.id, String(req.body?.modelo || ''), (req as any).user || {}));
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    /** Lê um orçamento pronto (Excel/PDF): devolve os itens para conferir e guarda o arquivo. */
    static async importarArquivo(req: Request, res: Response) {
        try {
            const arquivo = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string } | undefined;
            if (!arquivo) return res.status(400).json({ error: 'Envie o arquivo do orçamento (Excel ou PDF)' });
            const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
            if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
            const leitura = await lerOrcamentoArquivo(arquivo.buffer, nomeArquivoUtf8(arquivo.originalname), arquivo.mimetype);
            const nome = await guardarArquivoImportado(budget.id, nomeArquivoUtf8(arquivo.originalname), arquivo.buffer);
            await prisma.auditLog.create({
                data: {
                    tenant_id: budget.tenant_id, entidade: 'Budget', entidade_id: budget.id, acao: 'ORCAMENTO_ARQUIVO_LIDO',
                    depois_json: JSON.stringify({ arquivo: nome, formato: leitura.formato, itens: leitura.itens.length, soma: leitura.soma_itens }),
                    user_id: (req as any).user?.userId || null,
                },
            });
            res.json({ ...leitura, arquivo: nome });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async listarImportados(req: Request, res: Response) {
        try {
            // Cada arquivo é um orçamento (18/10/2026): quantos itens dele estão no
            // orçamento, quanto somam e se vale (algum item ativo) ou não.
            const arquivos = await listarArquivosImportados(req.params.id);
            // Itens importados antes de existir o vínculo (18/10/2026): religados ao
            // arquivo que os contém, comparando descrição e valor com o que o arquivo traz.
            const soltos = await prisma.budgetItem.findMany({ where: { budget_id: req.params.id, arquivo_origem: null, origem_item: { in: ['ORCAMENTO_LS', 'PV_CLIENTE'] } } });
            if (soltos.length) {
                const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                for (const a of [...arquivos].reverse()) {
                    const caminho = caminhoArquivoImportado(req.params.id, a.nome);
                    if (!caminho) continue;
                    const lidos = await lerOrcamentoArquivo(fs.readFileSync(caminho), a.nome_original).then(l => l.itens).catch(() => []);
                    for (const l of lidos) {
                        const alvo = soltos.find(i => !(i as any).ligado && norm(i.titulo) === norm(l.titulo) && Math.abs(i.valor_unitario - l.valor_unitario) < 0.01);
                        if (!alvo) continue;
                        (alvo as any).ligado = true;
                        await prisma.budgetItem.update({ where: { id: alvo.id }, data: { arquivo_origem: a.nome } });
                    }
                }
            }
            const itens = await prisma.budgetItem.findMany({ where: { budget_id: req.params.id, arquivo_origem: { not: null } } });
            res.json(arquivos.map(a => {
                const doArquivo = itens.filter(i => i.arquivo_origem === a.nome);
                const ativos = doArquivo.filter(i => i.ativo);
                return {
                    ...a, itens: doArquivo.length,
                    // Valor do orçamento do arquivo, mesmo quando ele está não válido (item inativo tem total 0).
                    total: Math.round(doArquivo.reduce((s, i) => s + calcularTotalLinha({ ...i, ativo: true }), 0) * 100) / 100,
                    situacao: !doArquivo.length ? 'SEM_ITENS' : ativos.length ? 'VALIDO' : 'NAO_VALIDO',
                };
            }));
        }
        catch (error: any) { res.status(400).json({ error: error.message }); }
    }

    static async baixarImportado(req: Request, res: Response) {
        try {
            const caminho = caminhoArquivoImportado(req.params.id, req.params.nome);
            if (!caminho) return res.status(404).json({ error: 'Arquivo não encontrado' });
            res.download(caminho, req.params.nome.replace(/^\d+-/, ''));
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    /** Número do orçamento: gera na primeira chamada, devolve o mesmo nas seguintes. */
    static async numero(req: Request, res: Response) {
        try {
            res.json({ numero: await emitirNumeroOrcamento(req.params.id, (req as any).user?.userId) });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    /** Marca o orçamento importado como válido ou não: os itens dele entram ou saem do total. */
    static async validadeImportado(req: Request, res: Response) {
        try {
            const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
            if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
            if (budget.status !== 'RASCUNHO') return res.status(400).json({ error: 'O orçamento já saiu do rascunho; não dá para mudar quais arquivos valem' });
            const valido = req.body?.valido === true;
            const doArquivo = await prisma.budgetItem.findMany({ where: { budget_id: budget.id, arquivo_origem: req.params.nome } });
            // O total da linha acompanha: inativo vale 0, e volta ao reativar.
            for (const i of doArquivo) await prisma.budgetItem.update({ where: { id: i.id }, data: { ativo: valido, total_linha: calcularTotalLinha({ ...i, ativo: valido }) } });
            const r = { count: doArquivo.length };
            if (!r.count) return res.status(400).json({ error: 'Nenhum item deste arquivo está no orçamento. Importe o arquivo de novo e use "Adicionar".' });
            await prisma.budget.update({ where: { id: budget.id }, data: { updated_at: new Date() } });
            await prisma.auditLog.create({
                data: {
                    tenant_id: budget.tenant_id, entidade: 'Budget', entidade_id: budget.id, acao: valido ? 'ORCAMENTO_ARQUIVO_VALIDO' : 'ORCAMENTO_ARQUIVO_NAO_VALIDO',
                    depois_json: JSON.stringify({ arquivo: req.params.nome, itens: r.count }), user_id: (req as any).user?.userId || null,
                },
            });
            res.json({ itens: r.count, valido });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async excluirImportado(req: Request, res: Response) {
        try {
            const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
            if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
            await removerArquivoImportado(budget.id, req.params.nome);
            await prisma.auditLog.create({
                data: {
                    tenant_id: budget.tenant_id, entidade: 'Budget', entidade_id: budget.id, acao: 'ORCAMENTO_ARQUIVO_EXCLUIDO',
                    antes_json: JSON.stringify({ arquivo: req.params.nome }), user_id: (req as any).user?.userId || null,
                },
            });
            res.status(204).end();
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async createVersion(req: Request, res: Response) {
        try {
            const version = await BudgetService.createVersion(req.params.id, req.body.userId);
            res.status(201).json(version);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async exportHtml(req: Request, res: Response) {
        try {
            const html = await ExportService.genterateHTML(req.params.id, req.query.grupo as string | undefined);
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async exportExcel(req: Request, res: Response) {
        try {
            const buffer = await ExportService.generateExcel(req.params.id, req.query.grupo as string | undefined);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=orcamento-${req.params.id}.xlsx`);
            res.send(buffer);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async exportHighlinePv(req: Request, res: Response) {
        try {
            const { buffer, filename } = await generateHighlinePv(req.params.id);
            res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
}
