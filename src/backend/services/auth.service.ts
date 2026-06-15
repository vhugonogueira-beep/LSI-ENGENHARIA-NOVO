import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';

const JWT_SECRET = process.env.JWT_SECRET || 'LSOfficeERP@2026#SuperSecretKey!';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface JwtPayload {
    userId: string;
    tenantId: string;
    email: string;
    nome: string;
    role: string;
}

export async function loginUser(email: string, senha: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.ativo) {
        throw new Error('Usuário não encontrado ou inativo');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
        throw new Error('Senha incorreta');
    }

    const payload: JwtPayload = {
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        nome: user.nome,
        role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    return {
        token,
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role, tenant_id: user.tenant_id }
    };
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPassword(senha: string): Promise<string> {
    return bcrypt.hash(senha, 12);
}
