import { Request, Response } from 'express';
import { prisma } from '../server';

const TIPOS = ['CLIENTE', 'SHARING', 'OPERADORA', 'SHARING_OPERADORA'];

function tenantId(req: Request) { return (req as any).user.tenantId as string; }

function dataFrom(body: any) {
    const tipo = String(body.tipo || 'CLIENTE').toUpperCase();
    if (!TIPOS.includes(tipo)) throw new Error('Tipo de cliente inválido');
    return {
        nome: String(body.nome || '').trim(),
        razao_social: String(body.razao_social || '').trim() || null,
        sigla: String(body.sigla || '').trim() || null,
        tipo,
        cnpj: String(body.cnpj || '').replace(/\D/g, '') || null,
        contato_nome: String(body.contato_nome || '').trim() || null,
        contato_email: String(body.contato_email || '').trim() || null,
        contato_telefone: String(body.contato_telefone || '').trim() || null,
        endereco: String(body.endereco || '').trim() || null,
        cidade: String(body.cidade || '').trim() || null,
        uf: String(body.uf || '').trim().toUpperCase().slice(0, 2) || null,
        ativo: body.ativo !== false,
    };
}

export async function listClientes(req: Request, res: Response) {
    try { res.json(await prisma.contratante.findMany({ where: { tenant_id: tenantId(req) }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] })); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function createCliente(req: Request, res: Response) {
    try {
        const data = dataFrom(req.body);
        if (!data.nome) return res.status(400).json({ error: 'Informe o nome do cliente' });
        res.status(201).json(await prisma.contratante.create({ data: { ...data, tenant_id: tenantId(req) } }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function updateCliente(req: Request, res: Response) {
    try {
        const existing = await prisma.contratante.findFirst({ where: { id: req.params.id, tenant_id: tenantId(req) } });
        if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
        const data = dataFrom({ ...existing, ...req.body });
        if (!data.nome) return res.status(400).json({ error: 'Informe o nome do cliente' });
        res.json(await prisma.contratante.update({ where: { id: existing.id }, data }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function uploadLogoCliente(req: Request, res: Response) {
    try {
        const existing = await prisma.contratante.findFirst({ where: { id: req.params.id, tenant_id: tenantId(req) } });
        if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
        if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem' });
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
        if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: 'Use PNG, JPG, WEBP ou SVG' });
        const logo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        res.json(await prisma.contratante.update({ where: { id: existing.id }, data: { logo_url } }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}
