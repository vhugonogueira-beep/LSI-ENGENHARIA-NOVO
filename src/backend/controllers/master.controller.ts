import { Request, Response } from 'express';
import { MasterService } from '../services/master.service';
import { prisma } from '../server';
import { PriceEngineService } from '../services/price-engine.service';

async function getDemoTenantId() {
    const t = await prisma.tenant.findFirst();
    return t ? t.id : '';
}

export class MasterController {

    static async listContratantes(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getContratantes(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createContratante(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            if (!data.tenant_id) {
                data.tenant_id = await getDemoTenantId();
            }
            res.status(201).json(await MasterService.createContratante(data));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async updateContratante(req: Request, res: Response) {
        try {
            res.json(await MasterService.updateContratante(req.params.id, req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    // A tela de Clientes ainda é a legada (localStorage), mas a logo precisa chegar aos
    // documentos gerados, que leem do Contratante real. Este upsert por nome faz a ponte:
    // salvar um cliente lá cria/atualiza o Contratante correspondente aqui.
    static async upsertContratantePorNome(req: Request, res: Response) {
        try {
            const { nome, cnpj, logo_url } = req.body;
            if (!nome?.trim()) return res.status(400).json({ error: 'nome é obrigatório' });

            const tenant_id = await getDemoTenantId();
            const existente = await prisma.contratante.findFirst({
                where: { tenant_id, nome: { equals: nome.trim() } },
            });

            if (existente) {
                const dados: any = {};
                if (cnpj !== undefined) dados.cnpj = cnpj || null;
                if (logo_url !== undefined) dados.logo_url = logo_url || null;
                if (Object.keys(dados).length === 0) return res.json(existente);
                return res.json(await prisma.contratante.update({ where: { id: existente.id }, data: dados }));
            }

            const criado = await prisma.contratante.create({
                data: { tenant_id, nome: nome.trim(), cnpj: cnpj || null, logo_url: logo_url || null },
            });
            res.status(201).json(criado);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    // A logo do cliente entra nos documentos gerados (orçamento, cronograma, relatórios).
    // Guardamos como data URI no próprio registro: o HTML exportado fica autocontido,
    // imprime/salva em PDF sem depender de o servidor estar acessível.
    static async uploadLogoContratante(req: Request, res: Response) {
        try {
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) return res.status(400).json({ error: 'Selecione uma imagem para a logo' });

            const permitidos = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
            if (!permitidos.includes(file.mimetype)) {
                return res.status(400).json({ error: 'Formato não permitido: use PNG, JPG, WEBP ou SVG' });
            }
            if (file.size > 1024 * 1024) {
                return res.status(400).json({ error: 'A logo deve ter no máximo 1 MB' });
            }

            const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            res.json(await MasterService.updateContratante(req.params.id, { logo_url: dataUri } as any));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listSites(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getSites(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createSite(req: Request, res: Response) {
        try {
            res.status(201).json(await MasterService.createSite(req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listCatalog(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getCatalogServices(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createCatalogItem(req: Request, res: Response) {
        try {
            res.status(201).json(await MasterService.createCatalogService(req.body));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async listTemplates(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string;
            res.json(await MasterService.getTemplates(tenantId));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async getTemplate(req: Request, res: Response) {
        try {
            const tpl = await MasterService.getTemplateById(req.params.id);
            if (!tpl) return res.status(404).json({ error: 'Not found' });
            res.json(tpl);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async createTemplate(req: Request, res: Response) {
        try {
            const { items, ...data } = req.body;
            res.status(201).json(await MasterService.createTemplate(data, items));
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }

    static async suggestPrice(req: Request, res: Response) {
        try {
            const tenantId = req.query.tenantId as string || await getDemoTenantId();
            const { query, regiao, k } = req.query;
            const limit = k ? parseInt(k as string) : 5;

            if (!query) {
                return res.status(400).json({ error: "Missing query parameter" });
            }

            const results = await PriceEngineService.suggestItems(
                tenantId,
                String(query),
                String(regiao || 'GERAL'),
                limit
            );

            res.json(results);
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    }
}
