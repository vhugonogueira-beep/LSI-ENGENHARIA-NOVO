/**
 * Registro de alterações — quem mudou, o que mudou e por quê.
 *
 * O modelo `AuditLog` existe no schema desde o começo e **nunca teve uma única
 * escrita**. O efeito prático apareceu no uso: ao corrigir o valor de uma
 * parcela, quem corrigia escrevia o motivo e depois não achava esse texto em
 * lugar nenhum — porque não havia onde guardá-lo.
 *
 * Um valor financeiro que muda sem deixar rastro é um problema de auditoria:
 * meses depois ninguém sabe se o contrato foi de 1.600 para 3.500 porque o
 * escopo cresceu, porque houve erro de digitação ou porque alguém negociou.
 *
 * Este serviço é a única porta de escrita do AuditLog. Guarda o antes e o
 * depois em JSON — não só o motivo — para a conferência não depender da
 * memória de quem escreveu.
 */
import { prisma } from '../server';

export interface AlteracaoRegistrada {
    tenant_id: string;
    entidade: string;
    entidade_id: string;
    acao: string;
    antes?: Record<string, unknown> | null;
    depois?: Record<string, unknown> | null;
    /** O texto que a pessoa escreveu explicando a mudança. */
    motivo?: string | null;
    user_id?: string | null;
}

export async function registrarAlteracao(dados: AlteracaoRegistrada): Promise<void> {
    if (!dados.tenant_id) return;
    try {
        await prisma.auditLog.create({
            data: {
                tenant_id: dados.tenant_id,
                entidade: dados.entidade,
                entidade_id: dados.entidade_id,
                acao: dados.acao,
                antes_json: dados.antes ? JSON.stringify(dados.antes) : null,
                // O motivo viaja junto do depois: é o que explica a mudança, e
                // separá-lo em outra coluna exigiria migração de schema por um
                // ganho que o JSON já entrega.
                depois_json: JSON.stringify({ ...(dados.depois || {}), ...(dados.motivo ? { motivo: dados.motivo } : {}) }),
                user_id: dados.user_id || null,
            },
        });
    } catch {
        // Registro de auditoria nunca pode derrubar a operação que o gerou: se
        // a gravação falhar, a edição do valor continua valendo.
    }
}

export interface AlteracaoLida {
    id: string;
    entidade: string;
    entidade_id: string;
    acao: string;
    motivo: string | null;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
    user_id: string | null;
    criado_em: Date;
}

function interpretar(texto: string | null): Record<string, unknown> | null {
    if (!texto) return null;
    try { return JSON.parse(texto); } catch { return null; }
}

/** Histórico de uma entidade, ou de várias — a contratação e suas parcelas. */
export async function lerAlteracoes(entidadeIds: string[]): Promise<AlteracaoLida[]> {
    if (!entidadeIds.length) return [];
    const linhas = await prisma.auditLog.findMany({
        where: { entidade_id: { in: entidadeIds } },
        orderBy: { created_at: 'desc' },
        take: 100,
    });
    return linhas.map(l => {
        const depois = interpretar(l.depois_json);
        const motivo = depois && typeof depois.motivo === 'string' ? depois.motivo : null;
        if (depois && motivo !== null) delete depois.motivo;
        return {
            id: l.id,
            entidade: l.entidade,
            entidade_id: l.entidade_id,
            acao: l.acao,
            motivo,
            antes: interpretar(l.antes_json),
            depois,
            user_id: l.user_id,
            criado_em: l.created_at,
        };
    });
}
