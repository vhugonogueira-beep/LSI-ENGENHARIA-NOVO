import { Request, Response } from 'express';
import type { JwtPayload } from '../services/auth.service';
import bcrypt from 'bcryptjs';
import { prisma } from '../server';
import { hashPassword } from '../services/auth.service';
import {
    getEmailSignatureMetadata,
    loadEmailSignature,
    removeEmailSignature,
    saveEmailSignature,
} from '../services/email-signature.service';

function currentUser(req: Request): JwtPayload {
    return (req as any).user as JwtPayload;
}

const profileSelect = {
    id: true, nome: true, nome_exibicao: true, cargo: true, telefone: true,
    email: true, role: true, tenant_id: true, ativo: true,
} as const;

export async function getMyProfile(req: Request, res: Response) {
    try {
        const user = await prisma.user.findFirst({ where: { id: currentUser(req).userId, tenant_id: currentUser(req).tenantId }, select: profileSelect });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function updateMyProfile(req: Request, res: Response) {
    try {
        const nome = String(req.body.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Informe o nome completo' });
        const user = await prisma.user.update({
            where: { id: currentUser(req).userId },
            data: {
                nome,
                nome_exibicao: String(req.body.nome_exibicao || '').trim() || null,
                cargo: String(req.body.cargo || '').trim() || null,
                telefone: String(req.body.telefone || '').trim() || null,
            },
            select: profileSelect,
        });
        res.json(user);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function changeMyPassword(req: Request, res: Response) {
    try {
        const atual = String(req.body.senha_atual || '');
        const nova = String(req.body.nova_senha || '');
        if (nova.length < 8) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres' });
        const user = await prisma.user.findFirst({ where: { id: currentUser(req).userId, tenant_id: currentUser(req).tenantId } });
        if (!user || !(await bcrypt.compare(atual, user.senha_hash))) return res.status(400).json({ error: 'Senha atual incorreta' });
        await prisma.user.update({ where: { id: user.id }, data: { senha_hash: await hashPassword(nova) } });
        res.json({ ok: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
}

export async function getMyEmailSignature(req: Request, res: Response) {
    try {
        res.json(await getEmailSignatureMetadata(currentUser(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}

export async function uploadMyEmailSignature(req: Request, res: Response) {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem de assinatura' });
        res.status(201).json(await saveEmailSignature(currentUser(req), req.file));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}

export async function viewMyEmailSignature(req: Request, res: Response) {
    try {
        const signature = await loadEmailSignature(currentUser(req));
        if (!signature) return res.status(404).json({ error: 'Assinatura não cadastrada' });
        res.setHeader('Content-Type', signature.mimeType);
        res.setHeader('Content-Length', String(signature.buffer.length));
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(signature.buffer);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}

export async function deleteMyEmailSignature(req: Request, res: Response) {
    try {
        res.json({ removed: await removeEmailSignature(currentUser(req)) });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}
