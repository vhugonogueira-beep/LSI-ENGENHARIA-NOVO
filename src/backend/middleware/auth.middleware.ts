import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação ausente' });
    }
    const token = authHeader.slice(7);
    try {
        const payload = verifyToken(token);
        (req as any).user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
