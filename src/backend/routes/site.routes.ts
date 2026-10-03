import { Router, Request, Response } from 'express';
import {
    DETENTORAS, OPERADORAS, TIPOS_SITE, TECNOLOGIAS, ErroSite,
    listarSites, obterSite, procurarSite, criarSite, atualizarSite, excluirSite,
    adicionarIdOperadora, removerIdOperadora, vincularAtividadesSemSite, sugerirSites,
} from '../services/site.service';

// Cadastro único de sites. Quem altera: `atividades.gerenciar` (quem abre a
// atividade cadastra o site); excluir: só ADMIN — ver permissoes.service.ts.

const router = Router();

const tenant = (req: Request) => (req as any).user.tenantId as string;
const autor = (req: Request) => ({ userId: (req as any).user?.userId ?? null, email: (req as any).user?.email ?? null });

function responder(res: Response, e: any) {
    if (e instanceof ErroSite) return res.status(e.status).json({ error: e.message });
    return res.status(500).json({ error: e.message });
}

const rota = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response) => fn(req, res).catch(e => responder(res, e));

router.get('/opcoes', (_req, res) => res.json({ detentoras: DETENTORAS, operadoras: OPERADORAS, tipos: TIPOS_SITE, tecnologias: TECNOLOGIAS }));

// ?id=PAMRB008[&detentora=HIGHLINE] — acha por ID da detentora, ID anterior ou ID de operadora.
router.get('/procurar', rota(async (req, res) => {
    res.json(await procurarSite(tenant(req), req.query.id, req.query.detentora));
}));

// ?q=ALBR — sugestões por trecho de qualquer ID, para o campo da atividade.
router.get('/sugestoes', rota(async (req, res) => { res.json(await sugerirSites(tenant(req), req.query.q)); }));

// Migração: liga ao cadastro as atividades sem site (só ADMIN; idempotente).
router.post('/vincular-atividades', rota(async (req, res) => { res.json(await vincularAtividadesSemSite(tenant(req), autor(req))); }));

router.get('/', rota(async (req, res) => { res.json(await listarSites(tenant(req))); }));
router.get('/:id', rota(async (req, res) => { res.json(await obterSite(tenant(req), req.params.id)); }));
router.post('/', rota(async (req, res) => { res.status(201).json(await criarSite(tenant(req), req.body, autor(req))); }));
router.put('/:id', rota(async (req, res) => { res.json(await atualizarSite(tenant(req), req.params.id, req.body, autor(req))); }));
router.delete('/:id', rota(async (req, res) => { await excluirSite(tenant(req), req.params.id, autor(req)); res.status(204).end(); }));
router.post('/:id/operadoras', rota(async (req, res) => { res.status(201).json(await adicionarIdOperadora(tenant(req), req.params.id, req.body, autor(req))); }));
router.delete('/:id/operadoras/:registroId', rota(async (req, res) => {
    await removerIdOperadora(tenant(req), req.params.id, req.params.registroId, autor(req));
    res.status(204).end();
}));

export default router;
