// Qualificações: ASO e as NRs que habilitam alguém a entrar em obra de telecom.
// Serve funcionário da LS e prestador — quem sobe na torre precisa estar em dia,
// independente do vínculo.

import { Request, Response } from 'express';
import { prisma } from '../server';
import { listarMunicipios } from '../services/localidades.service';

/** Tipos que a LS controla, com a validade usual em meses (0 = sem vencimento). */
export const TIPOS_QUALIFICACAO: Record<string, { rotulo: string; meses: number }> = {
    ASO: { rotulo: 'ASO — Atestado de Saúde Ocupacional', meses: 12 },
    NR06: { rotulo: 'NR-06 — EPI', meses: 0 },
    NR10: { rotulo: 'NR-10 — Segurança em eletricidade', meses: 24 },
    NR10_SEP: { rotulo: 'NR-10 SEP — Sistema Elétrico de Potência', meses: 12 },
    NR11: { rotulo: 'NR-11 — Movimentação de cargas', meses: 24 },
    NR12: { rotulo: 'NR-12 — Máquinas e equipamentos', meses: 24 },
    NR18: { rotulo: 'NR-18 — Construção civil', meses: 24 },
    NR33: { rotulo: 'NR-33 — Espaço confinado', meses: 12 },
    NR35: { rotulo: 'NR-35 — Trabalho em altura', meses: 24 },
    RESGATE: { rotulo: 'Resgate em altura', meses: 24 },
    CNH: { rotulo: 'CNH', meses: 0 },
    OUTRO: { rotulo: 'Outro', meses: 0 },
};

const CAMPOS = [
    'tipo', 'descricao', 'numero', 'entidade',
    'data_emissao', 'data_validade', 'arquivo_url', 'observacoes',
    'funcionario_id', 'supplier_id',
];

async function getTenantId(req: Request): Promise<string> {
    const informado = (req.body?.tenant_id || req.query?.tenantId) as string | undefined;
    if (informado) return informado;
    const t = await prisma.tenant.findFirst();
    if (!t) throw new Error('Nenhum tenant cadastrado');
    return t.id;
}

/** VENCIDO | VENCE_EM_BREVE | VALIDO | SEM_VALIDADE — calculado, não guardado. */
export function situacao(validade: Date | null | undefined) {
    if (!validade) return { situacao: 'SEM_VALIDADE', diasRestantes: null as number | null };
    const dias = Math.ceil((validade.getTime() - Date.now()) / 86400000);
    if (dias < 0) return { situacao: 'VENCIDO', diasRestantes: dias };
    if (dias <= 30) return { situacao: 'VENCE_EM_BREVE', diasRestantes: dias };
    return { situacao: 'VALIDO', diasRestantes: dias };
}

function filtrar(corpo: any) {
    const saida: any = {};
    for (const c of CAMPOS) {
        if (corpo[c] === undefined) continue;
        saida[c] = ['data_emissao', 'data_validade'].includes(c)
            ? (corpo[c] ? new Date(corpo[c]) : null)
            : corpo[c];
    }
    return saida;
}

export class QualificacaoController {
    /** Catálogo de tipos, para a tela não repetir a lista. */
    static tipos(_req: Request, res: Response) {
        res.json(Object.entries(TIPOS_QUALIFICACAO).map(([id, v]) => ({ id, ...v })));
    }

    static async list(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const where: any = { tenant_id };
            if (req.query.funcionario_id) where.funcionario_id = String(req.query.funcionario_id);
            if (req.query.supplier_id) where.supplier_id = String(req.query.supplier_id);

            const itens = await prisma.qualificacao.findMany({
                where,
                orderBy: [{ data_validade: 'asc' }],
                include: {
                    funcionario: { select: { id: true, nome: true } },
                    supplier: { select: { id: true, nome: true } },
                },
            });
            res.json(itens.map(q => ({
                ...q,
                rotulo: TIPOS_QUALIFICACAO[q.tipo]?.rotulo || q.tipo,
                ...situacao(q.data_validade),
            })));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const dados = filtrar(req.body);
            if (!dados.tipo) return res.status(400).json({ error: 'Informe o tipo da qualificação' });
            if (!dados.funcionario_id && !dados.supplier_id) {
                return res.status(400).json({ error: 'Vincule a um funcionário ou a um prestador' });
            }
            // Validade sugerida a partir da emissão, quando o tipo tem prazo fixo.
            const meses = TIPOS_QUALIFICACAO[dados.tipo]?.meses || 0;
            if (!dados.data_validade && dados.data_emissao && meses > 0) {
                const v = new Date(dados.data_emissao);
                v.setMonth(v.getMonth() + meses);
                dados.data_validade = v;
            }
            res.status(201).json(await prisma.qualificacao.create({ data: { ...dados, tenant_id } }));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const dados = filtrar(req.body);
            if (Object.keys(dados).length === 0) return res.status(400).json({ error: 'Nada para alterar' });
            res.json(await prisma.qualificacao.update({ where: { id: req.params.id }, data: dados }));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async remove(req: Request, res: Response) {
        try {
            await prisma.qualificacao.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    /** Rota antiga, mantida por compatibilidade — a base vive em /api/localidades. */
    static municipios(req: Request, res: Response) {
        res.json(listarMunicipios(req.query.uf));
    }
}
