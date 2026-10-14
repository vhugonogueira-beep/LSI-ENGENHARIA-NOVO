import { Router, Request, Response } from 'express';
import { prisma } from '../server';
import { MODELO_IA, descreverItem, iaDisponivel, revisarItens } from '../services/ia-orcamento.service';

// Agente de IA (14/10/2026). Ver ia-orcamento.service.ts.

const router = Router();

// Limite por usuário: 40 chamadas por hora evitam custo inesperado.
const LIMITE_HORA = 40;
const usos = new Map<string, number[]>();
function dentroDoLimite(usuario: string) {
    const agora = Date.now();
    const recentes = (usos.get(usuario) || []).filter(t => agora - t < 3600_000);
    if (recentes.length >= LIMITE_HORA) return false;
    recentes.push(agora);
    usos.set(usuario, recentes);
    return true;
}

async function registrar(req: Request, acao: string, detalhe: object) {
    const user = (req as any).user;
    if (!user?.tenantId) return;
    await prisma.auditLog.create({
        data: { tenant_id: user.tenantId, entidade: 'IA', entidade_id: String((req.body?.budget_id as string) || 'orcamento'), acao, depois_json: JSON.stringify({ modelo: MODELO_IA, ...detalhe }), user_id: user.userId || null },
    }).catch(() => undefined);
}

function erroIa(res: Response, e: any) {
    if (e?.message === 'IA_NAO_CONFIGURADA') return res.status(503).json({ error: 'A IA ainda não está configurada: falta a chave da API no servidor (ANTHROPIC_API_KEY).' });
    return res.status(400).json({ error: e?.message || 'Erro na IA' });
}

router.get('/status', (_req, res) => res.json({ disponivel: iaDisponivel(), modelo: MODELO_IA }));

router.post('/orcamento/revisar', async (req, res) => {
    try {
        if (!iaDisponivel()) throw new Error('IA_NAO_CONFIGURADA');
        const user = (req as any).user;
        if (!dentroDoLimite(user?.userId || 'anon')) return res.status(429).json({ error: `Limite de ${LIMITE_HORA} usos da IA por hora atingido. Tente mais tarde.` });
        const itens = (Array.isArray(req.body?.itens) ? req.body.itens : []).slice(0, 120);
        const r = await revisarItens(itens, req.body?.contexto || {});
        await registrar(req, 'IA_REVISAO_ORCAMENTO', { itens: itens.length, sugestoes: r.sugestoes.length, tokens: r.tokens });
        res.json(r);
    } catch (e: any) { erroIa(res, e); }
});

router.post('/orcamento/descrever', async (req, res) => {
    try {
        if (!iaDisponivel()) throw new Error('IA_NAO_CONFIGURADA');
        const user = (req as any).user;
        if (!dentroDoLimite(user?.userId || 'anon')) return res.status(429).json({ error: `Limite de ${LIMITE_HORA} usos da IA por hora atingido. Tente mais tarde.` });
        const r = await descreverItem({ comentario: req.body?.comentario, servico: req.body?.servico, unidade: req.body?.unidade, contexto: req.body?.contexto || {} });
        await registrar(req, 'IA_DESCRICAO_ITEM', { tokens: r.tokens });
        res.json(r);
    } catch (e: any) { erroIa(res, e); }
});

export default router;
