import { Request, Response } from 'express';
import { PriceBookService } from '../services/pricebook.service';
import { LpuMigracaoService } from '../services/lpu-migracao.service';
import { prisma } from '../server';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class PriceBookController {

    // ─── PriceBook ──────────────────────────────────────────────────

    static async list(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const filters = {
                supplier_id: req.query.supplier_id as string,
                regiao: req.query.regiao as string,
                status: req.query.status as string,
            };
            res.json(await PriceBookService.getPriceBooks(tenantId, filters));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const pb = await PriceBookService.getPriceBookById(req.params.id);
            if (!pb) return res.status(404).json({ error: 'LPU não encontrada' });
            res.json(pb);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) data.tenant_id = await getDemoTenantId();
            res.status(201).json(await PriceBookService.createPriceBook(data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            res.json(await PriceBookService.updatePriceBook(req.params.id, req.body));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── PriceBook Items ────────────────────────────────────────────

    static async listItems(req: Request, res: Response) {
        try {
            const filters = {
                tipo_escopo: req.query.tipo_escopo as string,
                search: req.query.search as string,
                unidade: req.query.unidade as string,
                comDerivados: req.query.comDerivados === '1',
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 100,
            };
            res.json(await PriceBookService.getPriceBookItems(req.params.id, filters));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async createItem(req: Request, res: Response) {
        try {
            const data = { ...req.body, pricebook_id: req.params.id };
            if (!data.tenant_id) data.tenant_id = await getDemoTenantId();
            if (!data.descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
            const base = await prisma.priceBook.findUnique({ where: { id: req.params.id } });
            if (!base) return res.status(404).json({ error: 'Base não encontrada' });
            data.supplier_id = data.supplier_id ?? base.supplier_id ?? null;
            data.regiao = data.regiao || base.regiao;
            data.tipo_escopo = data.tipo_escopo || 'SERVICO';
            data.valor_unitario = Number(data.valor_unitario) || 0;
            if (data.custo_ls != null) data.custo_ls = Number(data.custo_ls) || 0;
            if (data.valor_venda != null) data.valor_venda = Number(data.valor_venda) || 0;
            res.status(201).json(await PriceBookService.createPriceBookItem(data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // A rota está aberta (ver nota de autenticação em po.routes.ts), então só os campos
    // que a tela de LPUs edita passam adiante — nada de gravar o corpo cru no banco.
    static async updateItem(req: Request, res: Response) {
        const EDITAVEIS = [
            'descricao', 'unidade', 'subtipo', 'codigo_item',
            'valor_unitario',                          // preco cliente
            'custo_ls', 'valor_venda',    // LPU LS Office Geral
            'regiao', 'uf', 'fonte', 'pv_item_id',
            'tipo_custo', 'obrigatorio', 'observacoes', 'detalhamento',
            'data_referencia', 'ativo',
        ];
        try {
            const data: any = {};
            for (const campo of EDITAVEIS) {
                if (req.body[campo] !== undefined) data[campo] = req.body[campo];
            }
            for (const campo of ['valor_unitario', 'custo_ls', 'valor_venda']) {
                if (data[campo] === undefined || data[campo] === null) continue;
                const valor = Number(data[campo]);
                if (!Number.isFinite(valor) || valor < 0) {
                    return res.status(400).json({ error: `Valor inválido em ${campo}` });
                }
                data[campo] = valor;
            }
            if (Object.keys(data).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo editável foi enviado' });
            }
            res.json(await PriceBookService.updatePriceBookItem(req.params.id, data));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async deleteItem(req: Request, res: Response) {
        try {
            res.json(await PriceBookService.deletePriceBookItem(req.params.id));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Validação de duplicidades ──────────────────────────────────

    // Relatório dos códigos repetidos de uma base. NADA é sobrescrito nem
    // fundido: cada ocorrência mantém a descrição original da PV e fica apenas
    // sinalizada, até que alguém normalize o cadastro conscientemente.
    static async duplicidades(req: Request, res: Response) {
        try {
            const itens = await prisma.priceBookItem.findMany({
                where: { pricebook_id: req.params.id, ativo: true, codigo_item: { not: null } },
                orderBy: { highline_template_row: 'asc' },
                select: {
                    id: true, codigo_item: true, descricao: true, subtipo: true,
                    unidade: true, highline_template_row: true, codigo_duplicado: true,
                },
            });

            const porCodigo = new Map<string, typeof itens>();
            for (const i of itens) {
                const cod = (i.codigo_item || '').trim();
                if (!porCodigo.has(cod)) porCodigo.set(cod, []);
                porCodigo.get(cod)!.push(i);
            }

            const grupos = [...porCodigo.entries()]
                .filter(([, lista]) => lista.length > 1)
                .map(([codigo, ocorrencias]) => ({
                    codigo,
                    ocorrencias,
                    // Descrições diferentes = são itens distintos que herdaram o
                    // mesmo código. Iguais = repetição real de linha.
                    descricoesDistintas: new Set(ocorrencias.map(o => o.descricao.trim())).size > 1,
                }));

            // Mantém a marca no banco alinhada com o que a base tem agora.
            const idsDuplicados = grupos.flatMap(g => g.ocorrencias.map(o => o.id));
            await prisma.priceBookItem.updateMany({
                where: { pricebook_id: req.params.id, id: { in: idsDuplicados } },
                data: { codigo_duplicado: true },
            });
            await prisma.priceBookItem.updateMany({
                where: { pricebook_id: req.params.id, id: { notIn: idsDuplicados }, codigo_duplicado: true },
                data: { codigo_duplicado: false },
            });

            res.json({
                totalItens: itens.length,
                codigosRepetidos: grupos.length,
                itensAfetados: idsDuplicados.length,
                grupos,
            });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Migração das LPUs do localStorage ──────────────────────────

    // Recebe da tela os templates que ainda vivem no navegador e os grava como
    // PriceBook. Depois disso o banco é a única fonte — a tela para de ler local.
    static async importarLocais(req: Request, res: Response) {
        try {
            const tenantId = (req.body.tenant_id as string) || await getDemoTenantId();
            const templates = req.body.templates;
            if (!Array.isArray(templates)) {
                return res.status(400).json({ error: 'Envie "templates" como lista' });
            }
            res.json(await LpuMigracaoService.importarTemplatesLocais(tenantId, templates));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Price Lookup ───────────────────────────────────────────────

    static async lookupPrice(req: Request, res: Response) {
        try {
            const tenantId = (req.query.tenantId as string) || await getDemoTenantId();
            const { supplier_id, regiao, descricao, unidade, limit: k } = req.query;

            if (!descricao) return res.status(400).json({ error: 'Parâmetro descricao obrigatório' });

            const results = await PriceBookService.lookupPrice(
                tenantId,
                supplier_id as string | undefined,
                String(regiao || 'SUDESTE'),
                String(descricao),
                unidade as string | undefined,
                k ? parseInt(k as string) : 5
            );
            res.json(results);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
