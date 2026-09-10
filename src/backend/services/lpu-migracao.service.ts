// Migração de mão única: as LPUs que viviam no localStorage do navegador
// (chave "ls_lpuTemplates") passam a existir como PriceBook no banco.
//
// O dado de origem está no navegador do usuário, então quem dispara é a tela —
// não dá para um script do servidor ler aquele localStorage. Depois que a base
// existe no banco, a tela deixa de ler do localStorage para sempre.

import { prisma } from '../server';
import { PriceEngineService } from './price-engine.service';

// Formato exato do LpuTemplate/LpuTemplateItem do frontend
export interface TemplateLocalItem {
    cod?: string;
    resumo?: string;
    solucao?: string;
    config?: string;
    unid?: string;
    tipoCusto?: string;
    vlReferencia?: number;
    obrigatorio?: boolean;
}

export interface TemplateLocal {
    id: string;
    sharingId?: string;
    tipo?: string;           // implantacao | manutencao
    nome: string;
    versao?: string;
    itens?: TemplateLocalItem[];
    ativo?: boolean;
}

const TIPO_CUSTO: Record<string, string> = {
    MO: 'MO', MATERIAL: 'MATERIAL', 'SERVIÇO': 'SERVICO', SERVICO: 'SERVICO', VERBA: 'VERBA',
};

function normalizarTexto(v: string): string {
    return (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function traduzirTipo(tipo?: string): string | null {
    if (tipo === 'implantacao') return 'IMPLANTACAO';
    if (tipo === 'manutencao') return 'OPERACAO';
    return null;
}

function traduzirTipoCusto(v?: string): string {
    return TIPO_CUSTO[normalizarTexto(v || '')] || 'SERVICO';
}

/** Acha o contratante pelo sharingId ("highline") ou pelo nome da LPU, sem criar nada. */
async function acharContratante(tenantId: string, sharingId?: string, nome?: string) {
    const alvo = normalizarTexto(sharingId || '');
    if (!alvo) return null;
    const todos = await prisma.contratante.findMany({ where: { tenant_id: tenantId } });
    return todos.find(c => {
        const n = normalizarTexto(c.nome);
        return n === alvo || n.startsWith(alvo) || alvo.startsWith(n.split(' ')[0]);
    }) || (nome ? todos.find(c => normalizarTexto(nome).includes(normalizarTexto(c.nome))) : null) || null;
}

export interface ResultadoMigracao {
    criadas: string[];
    atualizadas: string[];
    ignoradas: { nome: string; motivo: string }[];
    itensGravados: number;
}

export class LpuMigracaoService {
    /**
     * Importa os templates locais. Reexecutar é seguro: uma base já migrada só
     * recebe os itens que ainda não tem — os valores já editados no banco mandam,
     * porque o banco passou a ser a fonte da verdade.
     */
    static async importarTemplatesLocais(
        tenantId: string,
        templates: TemplateLocal[],
    ): Promise<ResultadoMigracao> {
        const res: ResultadoMigracao = { criadas: [], atualizadas: [], ignoradas: [], itensGravados: 0 };

        for (const tpl of templates) {
            const itens = (tpl.itens || []).filter(i => i.cod || i.solucao);
            if (itens.length === 0) {
                res.ignoradas.push({ nome: tpl.nome, motivo: 'LPU vazia no navegador' });
                continue;
            }

            const contratante = await acharContratante(tenantId, tpl.sharingId, tpl.nome);

            let base = await prisma.priceBook.findFirst({
                where: { tenant_id: tenantId, nome_lpu: tpl.nome },
            });

            if (!base) {
                base = await prisma.priceBook.create({
                    data: {
                        tenant_id: tenantId,
                        // LPU herdada do navegador e uma tabela de cliente: itens do
                        // cliente com o preco que a LS Office cobra dele.
                        origem: 'PV_CLIENTE',
                        supplier_id: null,
                        contratante_id: contratante?.id ?? null,
                        tipo: traduzirTipo(tpl.tipo),
                        versao: tpl.versao || 'V1',
                        nome_lpu: tpl.nome,
                        regiao: 'NACIONAL',
                        status: tpl.ativo === false ? 'ARQUIVADA' : 'ATIVA',
                        data_inicio_vigencia: new Date(),
                    },
                });
                res.criadas.push(tpl.nome);
            } else {
                res.atualizadas.push(tpl.nome);
            }

            const jaExistem = await prisma.priceBookItem.findMany({
                where: { pricebook_id: base.id },
                select: { codigo_item: true, descricao_normalizada: true },
            });
            const chaves = new Set(
                jaExistem.map(i => `${i.codigo_item || ''}|${i.descricao_normalizada}`),
            );

            for (const item of itens) {
                const descricao = item.solucao || item.cod || '';
                // A chave tem que usar o MESMO normalizador que gravou o
                // descricao_normalizada, senao reimportar duplica tudo.
                const chave = `${item.cod || ''}|${PriceEngineService.normalizarDescricao(descricao)}`;
                if (chaves.has(chave)) continue;
                chaves.add(chave);

                await prisma.priceBookItem.create({
                    data: {
                        tenant_id: tenantId,
                        pricebook_id: base.id,
                        supplier_id: null,
                        regiao: 'NACIONAL',
                        tipo_escopo: 'SERVICO',
                        subtipo: item.resumo || null,
                        codigo_item: item.cod || null,
                        descricao,
                        descricao_normalizada: PriceEngineService.normalizarDescricao(descricao),
                        unidade: item.unid || 'VB',
                        valor_unitario: Number(item.vlReferencia) || 0,
                        tipo_custo: traduzirTipoCusto(item.tipoCusto),
                        obrigatorio: !!item.obrigatorio,
                        detalhamento: item.config || null,
                        observacoes: 'Migrado das LPUs locais do navegador',
                    } as any,
                });
                res.itensGravados += 1;
            }
        }

        return res;
    }
}
