import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';
import { carregarUsuarioSessao, exigenciaDaRota, ehAdmin, temPermissao, PERMISSOES } from '../services/permissoes.service';

// Rotas que funcionam sem sessão: entrar, aceitar convite, saúde do servidor
// e a base IBGE (lista pública de apoio).
const PUBLICAS = [
    /^\/api\/health$/,
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/convite(\/|$)/,
    /^\/api\/localidades(\/|$)/,
];

const ALTERA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ROTULO = new Map<string, string>(PERMISSOES.map(p => [p.chave, p.rotulo]));

function tokenDaRequisicao(req: Request): string | null {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    return null;
}

/**
 * Porteiro único de /api: exige sessão válida em tudo que não é público e,
 * para o que altera dado, confere a permissão da política em
 * permissoes.service.ts. O usuário é relido do banco a cada requisição —
 * suspender ou tirar uma permissão vale na hora, sem esperar o token vencer.
 */
export async function controleDeAcesso(req: Request, res: Response, next: NextFunction) {
    const caminho = req.originalUrl.split('?')[0];
    if (!caminho.startsWith('/api/') || PUBLICAS.some(re => re.test(caminho))) return next();

    const token = tokenDaRequisicao(req);
    if (!token) return res.status(401).json({ error: 'Sessão expirada — entre novamente' });
    let payload;
    try { payload = verifyToken(token); } catch { return res.status(401).json({ error: 'Sessão expirada — entre novamente' }); }

    const usuario = await carregarUsuarioSessao(payload.userId);
    if (!usuario) return res.status(401).json({ error: 'Acesso suspenso ou usuário inativo' });
    (req as any).user = usuario;
    (req as any).tenantId = usuario.tenantId;

    if (!ALTERA.has(req.method)) return next();
    const exige = exigenciaDaRota(req.method, caminho);
    if (exige === 'LOGADO') return next();
    if (exige === 'ADMIN') {
        if (ehAdmin(usuario)) return next();
        return res.status(403).json({ error: 'Ação exclusiva do administrador' });
    }
    if (temPermissao(usuario, exige)) return next();
    return res.status(403).json({ error: `Sem permissão para esta ação (${ROTULO.get(exige) || exige}). Fale com o administrador.` });
}

/** Mantido para as rotas que já o usavam; com o porteiro global, só confirma. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    if ((req as any).user) return next();
    const token = tokenDaRequisicao(req);
    if (!token) return res.status(401).json({ error: 'Token de autenticação ausente' });
    try {
        (req as any).user = verifyToken(token);
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (ehAdmin((req as any).user)) return next();
    return res.status(403).json({ error: 'Ação exclusiva do administrador' });
}
