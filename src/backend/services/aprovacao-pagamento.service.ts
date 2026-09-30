// Aprovação de pagamento para quem não tem autonomia (regra por usuário:
// NUNCA / SEMPRE / ACIMA_DO_LIMITE, em Usuários e acessos).
//
// Todo ponto que tira um pagamento de PENDENTE — solicitar, gerar o e-mail ao
// financeiro, avançar o status — chama `autorizarSolicitacao` antes. Sem
// autonomia e sem aprovação válida, o pedido vira uma AprovacaoPagamento
// PENDENTE e o pagamento não sai do lugar; depois de APROVADA, a mesma ação
// passa normalmente. A aprovação vale para o valor aprovado: se o valor subir,
// é preciso aprovar de novo.

import { prisma } from '../server';
import { precisaAprovacao, temPermissao, type UsuarioSessao } from './permissoes.service';

export type OrigemAprovacao = 'PARCELA' | 'DEPOSITO' | 'REEMBOLSO';

export interface PedidoAutorizacao {
    origem: OrigemAprovacao;
    registro_id: string;
    valor: number;
    descricao: string;
    atividade_id?: string | null;
}

export type ResultadoAutorizacao = { liberado: true } | { liberado: false; status: number; error: string; aprovacao_id?: string };

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function autorizarSolicitacao(usuario: UsuarioSessao | undefined, pedido: PedidoAutorizacao): Promise<ResultadoAutorizacao> {
    if (!usuario) return { liberado: false, status: 401, error: 'Sessão expirada — entre novamente' };
    if (!temPermissao(usuario, 'pagamentos.solicitar')) {
        return { liberado: false, status: 403, error: 'Sem permissão para solicitar pagamentos' };
    }
    if (!precisaAprovacao(usuario, pedido.valor)) return { liberado: true };

    const aprovada = await prisma.aprovacaoPagamento.findFirst({
        where: { registro_id: pedido.registro_id, status: 'APROVADA', valor: { gte: pedido.valor - 0.005 } },
    });
    if (aprovada) return { liberado: true };

    // Um pedido pendente por pagamento: clicar de novo não duplica a fila.
    const pendente = await prisma.aprovacaoPagamento.findFirst({ where: { registro_id: pedido.registro_id, status: 'PENDENTE' } });
    const aprovacao = pendente
        ? await prisma.aprovacaoPagamento.update({ where: { id: pendente.id }, data: { valor: pedido.valor, descricao: pedido.descricao } })
        : await prisma.aprovacaoPagamento.create({
            data: {
                tenant_id: usuario.tenantId, origem: pedido.origem, registro_id: pedido.registro_id,
                atividade_id: pedido.atividade_id || null, descricao: pedido.descricao, valor: pedido.valor,
                solicitante_id: usuario.userId,
            },
        });

    const motivo = usuario.aprovacao_pagamento === 'SEMPRE'
        ? 'suas solicitações precisam de aprovação'
        : `o valor passa do seu limite de ${moeda(usuario.limite_pagamento ?? 0)}`;
    return {
        liberado: false, status: 409, aprovacao_id: aprovacao.id,
        error: `Enviado para aprovação do administrador: ${motivo}. Assim que for aprovado, repita a solicitação.`,
    };
}

/** Situação de aprovação por registro, para as telas mostrarem "aguardando aprovação". */
export async function situacaoAprovacoes(registroIds: string[]) {
    if (!registroIds.length) return new Map<string, { status: string; valor: number; motivo_decisao: string | null }>();
    const linhas = await prisma.aprovacaoPagamento.findMany({
        where: { registro_id: { in: registroIds } },
        orderBy: { created_at: 'desc' },
    });
    const mapa = new Map<string, { status: string; valor: number; motivo_decisao: string | null }>();
    for (const l of linhas) if (!mapa.has(l.registro_id)) mapa.set(l.registro_id, { status: l.status, valor: l.valor, motivo_decisao: l.motivo_decisao });
    return mapa;
}
