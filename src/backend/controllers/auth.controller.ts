import { Request, Response } from 'express';
import { loginUser } from '../services/auth.service';
import { prisma } from '../server';

export async function login(req: Request, res: Response) {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }
        const result = await loginUser(email, senha);
        return res.json(result);
    } catch (err: any) {
        return res.status(401).json({ error: err.message || 'Credenciais inválidas' });
    }
}

export async function me(req: Request, res: Response) {
    try {
        const user = (req as any).user as { userId: string };
        const found = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { id: true, nome: true, email: true, role: true, tenant_id: true, ativo: true }
        });
        if (!found) return res.status(404).json({ error: 'Usuário não encontrado' });
        return res.json(found);
    } catch (err: any) {
        return res.status(500).json({ error: 'Erro interno' });
    }
}
