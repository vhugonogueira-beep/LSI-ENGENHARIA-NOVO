import { Router, Request, Response } from 'express';
import { prisma } from '../server';
import { temPermissao } from '../services/permissoes.service';

// Fila de aprovação. Quem pediu vê os próprios pedidos; quem tem
// `pagamentos.aprovar` (ou é ADMIN) vê todos e decide. A política global já
// exige a permissão para POST/PUT aqui.
const router = Router();

router.get('/', async (req: Request, res: Response) => {
    const usuario = (req as any).user;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const podeAprovar = temPermissao(usuario, 'pagamentos.aprovar');
    const linhas = await prisma.aprovacaoPagamento.findMany({
        where: {
            tenant_id: usuario.tenantId,
            ...(status ? { status } : {}),
            ...(podeAprovar ? {} : { solicitante_id: usuario.userId }),
        },
        include: { solicitante: { select: { nome: true, email: true } }, decisor: { select: { nome: true } } },
        orderBy: [{ status: 'desc' }, { created_at: 'desc' }],
        take: 200,
    });
    const atividades = await prisma.atividade.findMany({
        where: { id: { in: linhas.map(l => l.atividade_id).filter(Boolean) as string[] } },
        select: { id: true, codigo: true, id_site_sharing: true },
    });
    const porId = new Map(atividades.map(a => [a.id, a]));
    res.json(linhas.map(l => ({ ...l, atividade: l.atividade_id ? porId.get(l.atividade_id) || null : null })));
});

/** PUT /api/aprovacoes-pagamento/:id — { decisao: 'APROVADA' | 'RECUSADA', motivo? } */
router.put('/:id', async (req: Request, res: Response) => {
    const usuario = (req as any).user;
    const { decisao, motivo } = req.body || {};
    if (!['APROVADA', 'RECUSADA'].includes(decisao)) return res.status(400).json({ error: 'Decisão inválida' });
    if (decisao === 'RECUSADA' && String(motivo || '').trim().length < 5) {
        return res.status(400).json({ error: 'Explique o motivo da recusa — ele aparece para quem pediu' });
    }
    const atual = await prisma.aprovacaoPagamento.findFirst({ where: { id: req.params.id, tenant_id: usuario.tenantId } });
    if (!atual) return res.status(404).json({ error: 'Pedido de aprovação não encontrado' });
    if (atual.status !== 'PENDENTE') return res.status(400).json({ error: 'Este pedido já foi decidido' });
    if (atual.solicitante_id === usuario.userId) return res.status(400).json({ error: 'Quem pediu não pode aprovar o próprio pedido' });

    const decidido = await prisma.aprovacaoPagamento.update({
        where: { id: atual.id },
        data: { status: decisao, decisor_id: usuario.userId, motivo_decisao: String(motivo || '').trim() || null, decidido_em: new Date() },
    });
    await prisma.auditLog.create({
        data: {
            tenant_id: usuario.tenantId, entidade: 'AprovacaoPagamento', entidade_id: atual.id,
            acao: decisao === 'APROVADA' ? 'PAGAMENTO_APROVADO' : 'PAGAMENTO_RECUSADO',
            antes_json: JSON.stringify({ status: atual.status, valor: atual.valor }),
            depois_json: JSON.stringify({ status: decisao, motivo: decidido.motivo_decisao }),
            user_id: usuario.userId,
        },
    });
    res.json(decidido);
});

export default router;
