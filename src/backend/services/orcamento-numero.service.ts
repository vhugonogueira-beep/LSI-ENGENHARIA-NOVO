// Número do orçamento — decisões de 12/10/2026:
// - só o sistema gera; ninguém digita;
// - formato ORC-<ano>-<seq>-<site>, ex. ORC-2026-001-PAMRB008;
// - o sequencial é único no ano para todos os sites e recomeça em 001 a cada ano;
// - nasce ao gerar o primeiro PDF ou ao abrir a negociação (enviar ao cliente):
//   rascunho descartado não gasta número;
// - não muda nas revisões (a revisão é Budget.versao_atual);
// - nunca é reaproveitado: o registro em NumeroOrcamentoEmitido não é apagado;
// - orçamentos emitidos fora do sistema não entram: a numeração começa do zero.

import { prisma } from '../server';
import { proximoCodigo } from './codigo-sequencial.service';

export const PREFIXO_ORCAMENTO = 'ORC';

/** Site ID como vai no número: só letras, números e hífen, em maiúsculas. */
export function siteParaNumero(site: string) {
    return site.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9-]+/g, '').replace(/^-+|-+$/g, '').slice(0, 30);
}

/**
 * Devolve o número do orçamento, gerando na primeira vez. Chamar de novo devolve
 * o mesmo número. Exige que o orçamento esteja numa atividade com Site ID.
 */
export async function emitirNumeroOrcamento(budgetId: string, usuarioId?: string | null): Promise<string> {
    const budget = await prisma.budget.findUnique({
        where: { id: budgetId },
        include: { atividade: { select: { id_site_sharing: true, id_site_operadora: true, codigo: true } } },
    });
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.numero) return budget.numero;
    if (!budget.atividade) throw new Error('O orçamento precisa estar dentro de uma atividade para receber número');
    const site = siteParaNumero(budget.atividade.id_site_sharing || budget.atividade.id_site_operadora || '');
    if (!site) throw new Error(`Preencha o Site ID na atividade ${budget.atividade.codigo} antes de gerar o número do orçamento`);

    const tenant_id = budget.tenant_id;
    // Só os números desta empresa contam para o próximo.
    const fonte = {
        findMany: (args: { where: { codigo: { startsWith: string } }; select: { codigo: true } }) =>
            prisma.numeroOrcamentoEmitido.findMany({ where: { tenant_id, codigo: args.where.codigo }, select: { codigo: true } }),
    };

    // Duas gerações ao mesmo tempo: a segunda bate na unicidade do código e tenta o próximo.
    for (let tentativa = 0; tentativa < 8; tentativa++) {
        const codigo = await proximoCodigo(fonte, PREFIXO_ORCAMENTO);
        const numero = `${codigo}-${site}`;
        try {
            const resultado = await prisma.$transaction(async tx => {
                await tx.numeroOrcamentoEmitido.create({ data: { tenant_id, codigo, numero, budget_id: budget.id, emitido_por: usuarioId || null } });
                // Só grava se ninguém numerou este orçamento enquanto isso.
                const r = await tx.budget.updateMany({ where: { id: budget.id, numero: null }, data: { numero } });
                if (r.count === 0) throw new Error('JA_NUMERADO');
                await tx.auditLog.create({
                    data: { tenant_id, entidade: 'Budget', entidade_id: budget.id, acao: 'ORCAMENTO_NUMERO_EMITIDO', depois_json: JSON.stringify({ numero }), user_id: usuarioId || null },
                });
                return numero;
            });
            return resultado;
        } catch (e: any) {
            if (e?.message === 'JA_NUMERADO') {
                const atual = await prisma.budget.findUnique({ where: { id: budget.id }, select: { numero: true } });
                if (atual?.numero) return atual.numero;
            }
            if (e?.code !== 'P2002') throw e;
        }
    }
    throw new Error('Não foi possível gerar o número do orçamento agora. Tente de novo.');
}
