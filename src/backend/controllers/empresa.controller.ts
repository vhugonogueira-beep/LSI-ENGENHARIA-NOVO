// Cadastro da própria LS Office: dados fiscais, contas de recebimento e
// operadoras. É daqui que saem o CNPJ e o logo que aparecem nos documentos.

import { Request, Response } from 'express';
import { prisma } from '../server';

async function getTenantId(req: Request): Promise<string> {
    const doCorpo = (req.body?.tenant_id || req.query?.tenantId) as string | undefined;
    if (doCorpo) return doCorpo;
    const t = await prisma.tenant.findFirst();
    if (!t) throw new Error('Nenhum tenant cadastrado');
    return t.id;
}

const CAMPOS_EMPRESA = [
    'razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'inscricao_municipal',
    'cnae', 'regime_tributario',
    'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep',
    'telefone', 'email', 'site', 'logo_url', 'assinatura_setor',
    'solicitante_nome', 'solicitante_cargo', 'solicitante_email', 'solicitante_telefone',
    'destinatarios_pagamento',
    'email_faturamento', 'aliquota_impostos', 'aliquota_iss', 'observacoes_nf',
];

const CAMPOS_CONTA = [
    'banco', 'codigo_banco', 'agencia', 'conta', 'tipo', 'titular', 'cnpj_titular',
    'pix_tipo', 'pix_chave', 'principal', 'ativa', 'observacoes',
];

function filtrar(corpo: any, permitidos: string[]) {
    const saida: any = {};
    for (const campo of permitidos) {
        if (corpo[campo] !== undefined) saida[campo] = corpo[campo];
    }
    return saida;
}

/** CNPJ com dígitos verificadores válidos. Aceita vazio — o cadastro é gradual. */
export function cnpjValido(valor: string): boolean {
    const n = (valor || '').replace(/\D/g, '');
    if (n.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(n)) return false;
    const digito = (base: string) => {
        let peso = base.length === 12 ? 5 : 6;
        let soma = 0;
        for (const c of base) {
            soma += Number(c) * peso;
            peso = peso === 2 ? 9 : peso - 1;
        }
        const r = soma % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return Number(n[12]) === digito(n.slice(0, 12)) && Number(n[13]) === digito(n.slice(0, 13));
}


/**
 * Aceita o logo como arquivo (data URI base64) e devolve pronto para gravar.
 * Guardar embutido — e não como arquivo servido — é o mesmo caminho que o logo
 * da Highline já usa, e faz o logo viajar junto no HTML do documento e do e-mail.
 */
function normalizarLogo(valor: string): string {
    const bruto = String(valor || '').trim();
    if (!bruto) return '';
    if (/^https?:\/\//i.test(bruto) || bruto.startsWith('/')) return bruto;

    const m = bruto.match(/^data:(image\/(png|jpe?g|gif|webp|svg\+xml));base64,(.+)$/i);
    if (!m) throw new Error('Envie uma imagem PNG, JPG, GIF, WEBP ou SVG — ou uma URL');
    const bytes = Buffer.from(m[3], 'base64').length;
    if (bytes === 0) throw new Error('Arquivo de imagem vazio');
    if (bytes > 2 * 1024 * 1024) throw new Error('O logo deve ter no máximo 2 MB');
    return bruto;
}

export class EmpresaController {
    static async get(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const empresa = await prisma.empresaConfig.findUnique({
                where: { tenant_id },
                include: {
                    contas: { orderBy: [{ principal: 'desc' }, { banco: 'asc' }] },
                    cartoes: { orderBy: [{ ativo: 'desc' }, { bandeira: 'asc' }] },
                },
            });
            res.json(empresa);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    }

    /** Cria no primeiro save e atualiza depois — a tela não precisa saber a diferença. */
    static async salvar(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const dados = filtrar(req.body, CAMPOS_EMPRESA);

            if (dados.cnpj) {
                if (!cnpjValido(dados.cnpj)) return res.status(400).json({ error: 'CNPJ inválido' });
                dados.cnpj = String(dados.cnpj).replace(/\D/g, '');
            }
            if (dados.aliquota_impostos !== undefined) {
                const a = Number(dados.aliquota_impostos);
                if (!Number.isFinite(a) || a < 0 || a > 1) {
                    return res.status(400).json({ error: 'Alíquota de impostos deve ser uma fração entre 0 e 1 (ex.: 0,2204)' });
                }
                dados.aliquota_impostos = a;
            }
            if (dados.uf) dados.uf = String(dados.uf).toUpperCase().slice(0, 2);
            if (req.body.logo_base64 !== undefined) {
                dados.logo_url = req.body.logo_base64 ? normalizarLogo(req.body.logo_base64) : null;
            } else if (dados.logo_url) {
                dados.logo_url = normalizarLogo(dados.logo_url);
            }

            const empresa = await prisma.empresaConfig.upsert({
                where: { tenant_id },
                create: { tenant_id, razao_social: dados.razao_social || 'LS Office', ...dados },
                update: dados,
                include: { contas: { orderBy: [{ principal: 'desc' }, { banco: 'asc' }] } },
            });
            res.json(empresa);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Contas de recebimento ──────────────────────────────────────

    static async criarConta(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const empresa = await prisma.empresaConfig.findUnique({ where: { tenant_id } });
            if (!empresa) return res.status(400).json({ error: 'Preencha os dados da empresa antes de cadastrar contas' });

            const dados = filtrar(req.body, CAMPOS_CONTA);
            if (!dados.banco) return res.status(400).json({ error: 'Informe o banco' });
            if (dados.cnpj_titular && !cnpjValido(dados.cnpj_titular)) {
                return res.status(400).json({ error: 'CNPJ do titular inválido' });
            }

            // Só uma conta principal — marcar uma nova desmarca a anterior.
            if (dados.principal) {
                await prisma.contaBancaria.updateMany({ where: { empresa_id: empresa.id }, data: { principal: false } });
            }
            const conta = await prisma.contaBancaria.create({
                data: { ...dados, tenant_id, empresa_id: empresa.id },
            });
            res.status(201).json(conta);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async atualizarConta(req: Request, res: Response) {
        try {
            const dados = filtrar(req.body, CAMPOS_CONTA);
            if (dados.cnpj_titular && !cnpjValido(dados.cnpj_titular)) {
                return res.status(400).json({ error: 'CNPJ do titular inválido' });
            }
            const atual = await prisma.contaBancaria.findUnique({ where: { id: req.params.contaId } });
            if (!atual) return res.status(404).json({ error: 'Conta não encontrada' });

            if (dados.principal) {
                await prisma.contaBancaria.updateMany({ where: { empresa_id: atual.empresa_id }, data: { principal: false } });
            }
            res.json(await prisma.contaBancaria.update({ where: { id: req.params.contaId }, data: dados }));
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async removerConta(req: Request, res: Response) {
        try {
            await prisma.contaBancaria.delete({ where: { id: req.params.contaId } });
            res.json({ ok: true });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Cartões corporativos ───────────────────────────────────────

    static async salvarCartao(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const empresa = await prisma.empresaConfig.findUnique({ where: { tenant_id } });
            if (!empresa) return res.status(400).json({ error: 'Preencha os dados da empresa antes' });

            const final = String(req.body.final || '').replace(/\D/g, '');
            if (final.length !== 4) return res.status(400).json({ error: 'Informe os quatro últimos dígitos do cartão' });
            if (!req.body.bandeira) return res.status(400).json({ error: 'Informe a bandeira' });

            const dados = {
                bandeira: String(req.body.bandeira).toUpperCase(),
                final,
                apelido: req.body.apelido || null,
                titular: req.body.titular || null,
                limite: req.body.limite != null ? Number(req.body.limite) : null,
                dia_fechamento: req.body.dia_fechamento != null ? Number(req.body.dia_fechamento) : null,
                ativo: req.body.ativo !== false,
            };
            const cartao = req.params.cartaoId
                ? await prisma.cartaoCorporativo.update({ where: { id: req.params.cartaoId }, data: dados })
                : await prisma.cartaoCorporativo.create({ data: { ...dados, tenant_id, empresa_id: empresa.id } });
            res.json(cartao);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async removerCartao(req: Request, res: Response) {
        try {
            await prisma.cartaoCorporativo.delete({ where: { id: req.params.cartaoId } });
            res.json({ ok: true });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    // ─── Operadoras (logo no cabeçalho dos documentos) ──────────────

    static async listarOperadoras(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            res.json(await prisma.operadora.findMany({ where: { tenant_id }, orderBy: { nome: 'asc' } }));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    }

    static async salvarOperadora(req: Request, res: Response) {
        try {
            const tenant_id = await getTenantId(req);
            const nome = String(req.body.nome || '').trim().toUpperCase();
            if (!nome) return res.status(400).json({ error: 'Informe o nome da operadora' });
            const bruto = req.body.logo_base64 !== undefined ? req.body.logo_base64 : req.body.logo_url;
            const dados = {
                sigla: req.body.sigla || null,
                logo_url: bruto ? normalizarLogo(bruto) : null,
                ativa: req.body.ativa !== false,
            };
            const operadora = await prisma.operadora.upsert({
                where: { tenant_id_nome: { tenant_id, nome } },
                create: { tenant_id, nome, ...dados },
                update: dados,
            });
            res.json(operadora);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }

    static async removerOperadora(req: Request, res: Response) {
        try {
            await prisma.operadora.delete({ where: { id: req.params.operadoraId } });
            res.json({ ok: true });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
}
