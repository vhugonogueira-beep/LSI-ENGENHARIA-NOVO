// Usuários e acessos — exclusivo do administrador (política em permissoes.service.ts).
// Criar um usuário NÃO define senha: gera um convite com link de 72h, e a
// própria pessoa escolhe a senha. Nada aqui apaga usuário — suspender corta o
// acesso na hora e preserva o histórico de quem fez o quê.

import { Request, Response } from 'express';
import { prisma } from '../server';
import { hashPassword, novoTokenConvite, HORAS_CONVITE } from '../services/auth.service';
import { APROVACOES, MODELOS_ACESSO, PAPEIS, PERMISSOES, filtrarPermissoes } from '../services/permissoes.service';
import { normalizeRecipients } from '../services/email-routing.service';
import { randomBytes } from 'crypto';

const SELECAO = {
    id: true, nome: true, nome_exibicao: true, email: true, cargo: true, telefone: true, role: true, ativo: true,
    status_acesso: true, convite_expira_em: true, ultimo_acesso_em: true, aprovacao_pagamento: true,
    limite_pagamento: true, email_cc_padrao: true, created_at: true,
    permissoes: { select: { chave: true } },
} as const;

const formatar = (u: any) => ({ ...u, permissoes: u.permissoes.map((p: any) => p.chave) });
const autor = (req: Request) => (req as any).user as { userId: string; tenantId: string };

async function auditar(req: Request, entidadeId: string, acao: string, antes?: unknown, depois?: unknown) {
    await prisma.auditLog.create({
        data: {
            tenant_id: autor(req).tenantId, entidade: 'User', entidade_id: entidadeId, acao,
            antes_json: antes === undefined ? null : JSON.stringify(antes),
            depois_json: depois === undefined ? null : JSON.stringify(depois),
            user_id: autor(req).userId,
        },
    });
}

/** Lê e valida os campos de acesso; devolve erro em texto ou os dados prontos. */
function lerAcesso(body: any): { erro: string } | { dados: Record<string, unknown>; permissoes: string[] | undefined } {
    const dados: Record<string, unknown> = {};
    if (body.nome !== undefined) {
        if (!String(body.nome).trim()) return { erro: 'Informe o nome' };
        dados.nome = String(body.nome).trim();
    }
    for (const campo of ['nome_exibicao', 'cargo', 'telefone'] as const) {
        if (body[campo] !== undefined) dados[campo] = String(body[campo] || '').trim() || null;
    }
    if (body.role !== undefined) {
        if (!PAPEIS.includes(body.role)) return { erro: 'Papel inválido' };
        dados.role = body.role;
    }
    if (body.aprovacao_pagamento !== undefined) {
        if (!APROVACOES.includes(body.aprovacao_pagamento)) return { erro: 'Regra de aprovação inválida' };
        dados.aprovacao_pagamento = body.aprovacao_pagamento;
    }
    if (body.limite_pagamento !== undefined) {
        const n = body.limite_pagamento === null || body.limite_pagamento === '' ? null : Number(body.limite_pagamento);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return { erro: 'Limite de pagamento inválido' };
        dados.limite_pagamento = n;
    }
    const regra = dados.aprovacao_pagamento ?? body._aprovacao_atual;
    if (regra === 'ACIMA_DO_LIMITE' && (dados.limite_pagamento ?? body._limite_atual) == null) {
        return { erro: 'Defina o limite em reais para a regra "acima do limite"' };
    }
    if (body.email_cc_padrao !== undefined) {
        try { dados.email_cc_padrao = normalizeRecipients(body.email_cc_padrao).join('; ') || null; }
        catch (e: any) { return { erro: e.message }; }
    }
    return { dados, permissoes: body.permissoes === undefined ? undefined : filtrarPermissoes(body.permissoes) };
}

async function contarAdminsAtivos(excetoId?: string) {
    return prisma.user.count({ where: { role: 'ADMIN', ativo: true, status_acesso: 'ATIVO', ...(excetoId ? { id: { not: excetoId } } : {}) } });
}

export async function catalogo(_req: Request, res: Response) {
    res.json({ permissoes: PERMISSOES, modelos: MODELOS_ACESSO, aprovacoes: APROVACOES, horas_convite: HORAS_CONVITE });
}

export async function listar(req: Request, res: Response) {
    const users = await prisma.user.findMany({
        where: { tenant_id: autor(req).tenantId },
        select: SELECAO,
        orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    res.json(users.map(formatar));
}

/** POST /api/usuarios — cadastra e devolve o link de convite (mostrado uma vez só). */
export async function convidar(req: Request, res: Response) {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
        if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'Já existe usuário com este e-mail' });
        const lido = lerAcesso({ role: 'USUARIO', aprovacao_pagamento: 'NUNCA', ...req.body });
        if ('erro' in lido) return res.status(400).json({ error: lido.erro });
        if (!lido.dados.nome) return res.status(400).json({ error: 'Informe o nome' });

        const convite = novoTokenConvite();
        const user = await prisma.user.create({
            data: {
                ...(lido.dados as any),
                email, tenant_id: autor(req).tenantId,
                // Senha impossível até a pessoa aceitar o convite.
                senha_hash: await hashPassword(randomBytes(32).toString('hex')),
                status_acesso: 'CONVIDADO', convite_token_hash: convite.hash, convite_expira_em: convite.expira,
                permissoes: { create: (lido.permissoes || []).map(chave => ({ chave })) },
            },
            select: SELECAO,
        });
        await auditar(req, user.id, 'USUARIO_CONVIDADO', undefined, formatar(user));
        res.status(201).json({ usuario: formatar(user), token_convite: convite.token, expira_em: convite.expira });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

export async function atualizar(req: Request, res: Response) {
    try {
        const atual = await prisma.user.findFirst({ where: { id: req.params.id, tenant_id: autor(req).tenantId }, select: SELECAO });
        if (!atual) return res.status(404).json({ error: 'Usuário não encontrado' });
        const lido = lerAcesso({ ...req.body, _aprovacao_atual: atual.aprovacao_pagamento, _limite_atual: atual.limite_pagamento });
        if ('erro' in lido) return res.status(400).json({ error: lido.erro });

        // Ninguém tira o próprio ADMIN, e o sistema nunca fica sem administrador.
        if (lido.dados.role && lido.dados.role !== 'ADMIN' && atual.role === 'ADMIN') {
            if (atual.id === autor(req).userId) return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de administrador' });
            if (await contarAdminsAtivos(atual.id) === 0) return res.status(400).json({ error: 'O sistema precisa de pelo menos um administrador ativo' });
        }

        const user = await prisma.$transaction(async tx => {
            if (lido.permissoes) {
                await tx.userPermissao.deleteMany({ where: { user_id: atual.id } });
                if (lido.permissoes.length) await tx.userPermissao.createMany({ data: lido.permissoes.map(chave => ({ user_id: atual.id, chave })) });
            }
            return tx.user.update({ where: { id: atual.id }, data: lido.dados as any, select: SELECAO });
        });
        await auditar(req, user.id, 'ACESSO_ALTERADO', formatar(atual), formatar(user));
        res.json(formatar(user));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** PUT /api/usuarios/:id/status — { status: 'ATIVO' | 'SUSPENSO' } */
export async function alterarStatus(req: Request, res: Response) {
    const status = req.body?.status;
    if (!['ATIVO', 'SUSPENSO'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const atual = await prisma.user.findFirst({ where: { id: req.params.id, tenant_id: autor(req).tenantId } });
    if (!atual) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (status === 'SUSPENSO') {
        if (atual.id === autor(req).userId) return res.status(400).json({ error: 'Você não pode suspender o seu próprio acesso' });
        if (atual.role === 'ADMIN' && await contarAdminsAtivos(atual.id) === 0) return res.status(400).json({ error: 'O sistema precisa de pelo menos um administrador ativo' });
    }
    if (status === 'ATIVO' && atual.status_acesso === 'CONVIDADO') {
        return res.status(400).json({ error: 'Este usuário ainda não aceitou o convite — gere um novo link' });
    }
    const user = await prisma.user.update({
        where: { id: atual.id },
        data: { status_acesso: status, ativo: status === 'ATIVO', ...(status === 'SUSPENSO' ? { convite_token_hash: null, convite_expira_em: null } : {}) },
        select: SELECAO,
    });
    await auditar(req, user.id, status === 'SUSPENSO' ? 'ACESSO_SUSPENSO' : 'ACESSO_REATIVADO');
    res.json(formatar(user));
}

/**
 * POST /api/usuarios/:id/link — novo link: reenvia o convite de quem não
 * entrou ainda, ou serve para redefinir a senha de quem esqueceu. O link
 * anterior deixa de valer.
 */
export async function gerarLink(req: Request, res: Response) {
    const atual = await prisma.user.findFirst({ where: { id: req.params.id, tenant_id: autor(req).tenantId } });
    if (!atual) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (atual.status_acesso === 'SUSPENSO') return res.status(400).json({ error: 'Reative o acesso antes de gerar um link' });
    const convite = novoTokenConvite();
    await prisma.user.update({ where: { id: atual.id }, data: { convite_token_hash: convite.hash, convite_expira_em: convite.expira } });
    await auditar(req, atual.id, atual.status_acesso === 'CONVIDADO' ? 'CONVITE_REENVIADO' : 'REDEFINICAO_SENHA_GERADA');
    res.json({ token_convite: convite.token, expira_em: convite.expira, tipo: atual.status_acesso === 'CONVIDADO' ? 'CONVITE' : 'REDEFINICAO' });
}

/** GET /api/usuarios/:id/historico — trilha de acesso do usuário. */
export async function historico(req: Request, res: Response) {
    const linhas = await prisma.auditLog.findMany({
        where: { tenant_id: autor(req).tenantId, entidade: 'User', entidade_id: req.params.id },
        orderBy: { created_at: 'desc' }, take: 50,
    });
    const autores = await prisma.user.findMany({ where: { id: { in: linhas.map(l => l.user_id).filter(Boolean) as string[] } }, select: { id: true, nome: true } });
    const nome = new Map(autores.map(a => [a.id, a.nome]));
    res.json(linhas.map(l => ({ id: l.id, acao: l.acao, em: l.created_at, por: l.user_id ? nome.get(l.user_id) || l.user_id : null })));
}
