import { Request, Response } from 'express';
import { hashPassword, hashToken, loginUser, validarSenha } from '../services/auth.service';
import { carregarUsuarioSessao } from '../services/permissoes.service';
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

/** Sessão atual, com as permissões — o front usa para mostrar ou esconder ações. */
export async function me(req: Request, res: Response) {
    try {
        const user = (req as any).user as { userId: string };
        const found = await prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                id: true, nome: true, nome_exibicao: true, cargo: true, telefone: true, email: true, role: true,
                tenant_id: true, ativo: true, aprovacao_pagamento: true, limite_pagamento: true, email_cc_padrao: true,
            },
        });
        if (!found) return res.status(404).json({ error: 'Usuário não encontrado' });
        const sessao = await carregarUsuarioSessao(found.id);
        return res.json({ ...found, permissoes: sessao?.permissoes || [] });
    } catch (err: any) {
        return res.status(500).json({ error: 'Erro interno' });
    }
}

async function acharConvite(token: string) {
    const user = await prisma.user.findFirst({ where: { convite_token_hash: hashToken(token) } });
    if (!user || !user.convite_expira_em || user.convite_expira_em < new Date()) return null;
    if (user.status_acesso === 'SUSPENSO' || !user.ativo) return null;
    return user;
}

/** GET /api/auth/convite/:token — confere o link antes de mostrar o formulário. */
export async function verConvite(req: Request, res: Response) {
    const user = await acharConvite(req.params.token);
    if (!user) return res.status(404).json({ error: 'Link inválido ou expirado — peça um novo ao administrador' });
    res.json({ nome: user.nome, email: user.email, primeiro_acesso: user.status_acesso === 'CONVIDADO' });
}

/** POST /api/auth/convite/:token — define a senha e ativa o acesso. O link morre aqui. */
export async function aceitarConvite(req: Request, res: Response) {
    const user = await acharConvite(req.params.token);
    if (!user) return res.status(404).json({ error: 'Link inválido ou expirado — peça um novo ao administrador' });
    const erro = validarSenha(req.body?.senha);
    if (erro) return res.status(400).json({ error: erro });
    await prisma.user.update({
        where: { id: user.id },
        data: {
            senha_hash: await hashPassword(req.body.senha),
            status_acesso: 'ATIVO', convite_token_hash: null, convite_expira_em: null,
        },
    });
    await prisma.auditLog.create({
        data: { tenant_id: user.tenant_id, entidade: 'User', entidade_id: user.id, acao: user.status_acesso === 'CONVIDADO' ? 'CONVITE_ACEITO' : 'SENHA_REDEFINIDA', user_id: user.id },
    });
    res.json({ ok: true, email: user.email });
}
