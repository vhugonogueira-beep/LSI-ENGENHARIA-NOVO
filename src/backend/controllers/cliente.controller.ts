import { Request, Response } from 'express';
import { chaveNome, ehHighline } from '../utils/sharing';
import { prisma } from '../server';

// O tipo "Cliente" saiu em 19/10/2026: todo cadastro é sharing, operadora ou os dois.
const TIPOS = ['SHARING', 'OPERADORA', 'SHARING_OPERADORA'];
const OPERADORAS_MOVEIS = /^(TIM|VIVO|CLARO|OI|TELEFONICA)\b/;

/**
 * Cadastros antigos do tipo CLIENTE viram SHARING; as operadoras móveis (TIM,
 * Vivo, Claro, Oi) viram SHARING_OPERADORA — detentora em umas atividades,
 * operadora em outras. Idempotente: roda a cada listagem e só mexe no que sobrou.
 */
async function converterTipoCliente(tenant: string) {
    const antigos = await prisma.contratante.findMany({ where: { tenant_id: tenant, tipo: 'CLIENTE' }, select: { id: true, nome: true, sigla: true } });
    for (const c of antigos) {
        const chave = `${c.sigla || ''} ${c.nome}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
        const operadora = [c.sigla, c.nome].some(v => v && OPERADORAS_MOVEIS.test(v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim())) || OPERADORAS_MOVEIS.test(chave);
        await prisma.contratante.update({ where: { id: c.id }, data: { tipo: operadora ? 'SHARING_OPERADORA' : 'SHARING' } });
    }
}

function tenantId(req: Request) { return (req as any).user.tenantId as string; }

function dataFrom(body: any) {
    const tipo = String(body.tipo || 'SHARING').toUpperCase();
    if (!TIPOS.includes(tipo)) throw new Error('Tipo inválido: use Sharing, Operadora ou Sharing e operadora');
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
    try {
        await converterTipoCliente(tenantId(req));
        res.json(await prisma.contratante.findMany({ where: { tenant_id: tenantId(req) }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] }));
    }
    catch (error: any) { res.status(400).json({ error: error.message }); }
}

/**
 * Cliente repetido (23/10/2026): o nome é o que a atividade grava como sharing ou
 * operadora — dois cadastros ativos com o mesmo nome (ou duas Highline)
 * dividiriam atividades e LPUs entre eles.
 */
async function duplicado(tenant: string, nome: string, ativo: boolean, ignorarId?: string) {
    if (!ativo) return null;
    const outros = await prisma.contratante.findMany({ where: { tenant_id: tenant, ativo: true, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) }, select: { nome: true } });
    return outros.find(o => chaveNome(o.nome) === chaveNome(nome) || (ehHighline(o.nome) && ehHighline(nome))) || null;
}

export async function createCliente(req: Request, res: Response) {
    try {
        const data = dataFrom(req.body);
        if (!data.nome) return res.status(400).json({ error: 'Informe o nome do cliente' });
        const igual = await duplicado(tenantId(req), data.nome, (data as any).ativo !== false);
        if (igual) return res.status(409).json({ error: `Já existe o cliente ativo "${igual.nome}". Use o cadastro existente.` });
        res.status(201).json(await prisma.contratante.create({ data: { ...data, tenant_id: tenantId(req) } }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function updateCliente(req: Request, res: Response) {
    try {
        const existing = await prisma.contratante.findFirst({ where: { id: req.params.id, tenant_id: tenantId(req) } });
        if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
        const data = dataFrom({ ...existing, ...req.body });
        if (!data.nome) return res.status(400).json({ error: 'Informe o nome do cliente' });
        const igual = await duplicado(existing.tenant_id, data.nome, (data as any).ativo !== false, existing.id);
        if (igual) return res.status(409).json({ error: `Já existe o cliente ativo "${igual.nome}". Desative um dos dois ou use o cadastro existente.` });
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
