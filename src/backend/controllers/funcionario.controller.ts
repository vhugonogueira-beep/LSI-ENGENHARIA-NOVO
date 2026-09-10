// Funcionários da LS Office. Existem no sistema para poder receber reembolso e
// adiantamento com o mesmo tratamento de um prestador de mão de obra — a
// diferença é de vínculo, não de fluxo financeiro.

import { Request, Response } from 'express';
import { prisma } from '../server';
import { sincronizarPendenciasFavorecido } from '../services/sincronizacao-pendencias.service';

const CAMPOS = [
    'nome', 'cpf', 'rg', 'rg_orgao', 'data_nascimento', 'tipo_vinculo',
    'funcao', 'cargo', 'data_admissao', 'telefone', 'email',
    'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'uf',
    'municipio', 'municipio_ibge',
    'banco', 'agencia', 'conta', 'tipo_conta', 'pix_tipo', 'pix_chave', 'forma_pagamento', 'ativo',
    'observacoes',
];

async function getTenantId(req: Request): Promise<string> {
    const informado = (req.body?.tenant_id || req.query?.tenantId) as string | undefined;
    if (informado) return informado;
    const t = await prisma.tenant.findFirst();
    if (!t) throw new Error('Nenhum tenant cadastrado');
    return t.id;
}

function filtrar(corpo: any) {
    const saida: any = {};
    for (const c of CAMPOS) {
        if (corpo[c] === undefined) continue;
        saida[c] = ['data_nascimento', 'data_admissao'].includes(c)
            ? (corpo[c] ? new Date(corpo[c]) : null)
            : corpo[c];
    }
    return saida;
}

export class FuncionarioController {
    static async list(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const where: any = { tenant_id };
            if (req.query.ativo !== 'todos') where.ativo = true;
            res.json(await prisma.funcionario.findMany({
                where,
                orderBy: { nome: 'asc' },
                include: { qualificacoes: true },
            }));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const dados = filtrar(req.body);
            if (!dados.nome) return res.status(400).json({ error: 'Informe o nome' });
            if (dados.cpf) dados.cpf = String(dados.cpf).replace(/\D/g, '');
            res.status(201).json(await prisma.funcionario.create({ data: { ...dados, tenant_id } }));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const dados = filtrar(req.body);
            if (dados.cpf) dados.cpf = String(dados.cpf).replace(/\D/g, '');
            if (Object.keys(dados).length === 0) return res.status(400).json({ error: 'Nada para alterar' });
            const anterior = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
            if (!anterior) return res.status(404).json({ error: 'Funcionário não encontrado' });
            const atualizado = await prisma.funcionario.update({ where: { id: req.params.id }, data: dados });
            await sincronizarPendenciasFavorecido('funcionario', atualizado.id, anterior, atualizado);
            res.json(atualizado);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    /** Desativa em vez de apagar: reembolso antigo tem que continuar rastreável. */
    static async remove(req: Request, res: Response) {
        try {
            const [reembolsos, contratacoes] = await Promise.all([
                prisma.reembolso.count({ where: { funcionario_id: req.params.id } }),
                prisma.contratacaoFornecedor.count({ where: { funcionario_id: req.params.id } }),
            ]);
            const usado = reembolsos + contratacoes;
            if (usado > 0) {
                await prisma.funcionario.update({ where: { id: req.params.id }, data: { ativo: false } });
                return res.json({ ok: true, desativado: true, reembolsos, contratacoes });
            }
            await prisma.funcionario.delete({ where: { id: req.params.id } });
            res.json({ ok: true, desativado: false });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
