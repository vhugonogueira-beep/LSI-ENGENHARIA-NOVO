import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../server';

// O segredo vem só do .env. Um valor escrito aqui ficaria no histórico do git
// e qualquer pessoa com o repositório poderia forjar um login de ADMIN.
// Lido na hora do uso: os imports do server.ts rodam antes do dotenv.config().
function segredo(): string {
    const valor = process.env.JWT_SECRET;
    if (!valor) throw new Error('JWT_SECRET não definido no .env');
    return valor;
}
const expiracao = () => process.env.JWT_EXPIRES_IN || '8h';

export interface JwtPayload {
    userId: string;
    tenantId: string;
    email: string;
    nome: string;
    role: string;
}

export async function loginUser(email: string, senha: string) {
    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
        || await prisma.user.findUnique({ where: { email } });
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta.
    const invalido = new Error('E-mail ou senha incorretos');
    if (!user) throw invalido;
    if (!user.ativo || user.status_acesso === 'SUSPENSO') throw new Error('Acesso suspenso — fale com o administrador');
    if (user.status_acesso === 'CONVIDADO') throw new Error('Convite ainda não aceito — use o link recebido para criar sua senha');
    if (!(await bcrypt.compare(senha, user.senha_hash))) throw invalido;

    await prisma.user.update({ where: { id: user.id }, data: { ultimo_acesso_em: new Date() } });

    const payload: JwtPayload = {
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        nome: user.nome,
        role: user.role,
    };
    const token = jwt.sign(payload, segredo(), { expiresIn: expiracao() } as jwt.SignOptions);

    return {
        token,
        user: { id: user.id, nome: user.nome, nome_exibicao: user.nome_exibicao, cargo: user.cargo, telefone: user.telefone, email: user.email, role: user.role, tenant_id: user.tenant_id },
    };
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, segredo()) as JwtPayload;
}

export async function hashPassword(senha: string): Promise<string> {
    return bcrypt.hash(senha, 12);
}

// ── Convite / redefinição de senha ─────────────────────────────────────────
// O link leva um token aleatório; no banco fica só o hash dele, para quem
// ler a base não conseguir usar um convite pendente.

export const HORAS_CONVITE = 72;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function novoTokenConvite() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token), expira: new Date(Date.now() + HORAS_CONVITE * 3600_000) };
}

export function validarSenha(senha: unknown): string | null {
    if (typeof senha !== 'string' || senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres';
    if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha';
    return null;
}
