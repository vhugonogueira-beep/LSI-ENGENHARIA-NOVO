// Monta as bases do módulo "Bases (LPUs)".
//
//   1. PV Padrão Highline  (PV_CLIENTE)  catálogo oficial de itens do cliente
//                                        (código, descrição, categoria, unidade
//                                        vindos do template oficial) MAIS o preço
//                                        que a LS Office cobra da Highline por
//                                        item. Esse preço é editável na tela.
//   2. LPU LS Office Geral (LPU_LS_OFFICE)               o que CUSTA para a LS executar ou
//                                        adquirir o item (custo de mercado).
//
// A diferença entre os dois é a margem.
//
// Reexecutar é seguro e NÃO apaga trabalho:
//   · preço só é semeado com a média histórica quando o item ainda não tem preço;
//   · estrutura editada à mão na tela é PRESERVADA e apenas relatada.
//
// Para forçar a volta ao texto do template oficial, descartando as edições:
//
//   npx tsx src/backend/scripts/reestruturar-bases-pv.ts --realinhar

import path from 'path';
import { PrismaClient } from '@prisma/client';
import { HIGHLINE_PV_CATALOG } from '../data/highline-pv-catalog';
import { lerAnaliseDasMedias } from './importar-pv-medio';

const prisma = new PrismaClient();

const NOME_PV = 'PV Padrão Highline';
const NOME_LPU_LS = 'LPU LS Office Geral';
// Bases de estruturas anteriores que foram absorvidas pela PV Padrão.
const NOMES_ABSORVIDOS = ['Preço Cliente Highline', 'PV Médio Consolidado — Highline'];

const ARQUIVO_MEDIAS = path.resolve(
    process.cwd(), 'assets', 'lpu', 'PV MÉDIO CONSOLIDADO - LS OFFICE - 36 PVs.xlsx',
);

function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Códigos que a PV original repete. A identidade estável é a LINHA do template,
 * não o código — por isso as duas ocorrências são mantidas com a descrição
 * original de cada uma, apenas sinalizadas.
 */
function codigosDuplicados(): Set<string> {
    const contagem = new Map<string, number>();
    for (const c of HIGHLINE_PV_CATALOG) contagem.set(c.code, (contagem.get(c.code) || 0) + 1);
    return new Set([...contagem.entries()].filter(([, n]) => n > 1).map(([code]) => code));
}

async function apagarBase(tenantId: string, nome: string) {
    const base = await prisma.priceBook.findFirst({ where: { tenant_id: tenantId, nome_lpu: nome } });
    if (!base) return;
    // Solta os vínculos antes de apagar, senão a FK segura os itens derivados.
    await prisma.priceBookItem.updateMany({
        where: { pv_item: { pricebook_id: base.id } },
        data: { pv_item_id: null },
    });
    await prisma.priceBookItem.deleteMany({ where: { pricebook_id: base.id } });
    await prisma.priceBook.delete({ where: { id: base.id } });
    console.log(`  base "${nome}" removida (absorvida pela PV Padrão)`);
}

async function main() {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant cadastrado');

    const highline = await prisma.contratante.findFirst({
        where: { tenant_id: tenant.id, nome: { contains: 'HIGHLINE' } },
    });
    if (!highline) console.log('  aviso: nenhum contratante "Highline" encontrado; a base fica sem vínculo');

    // ── 1. PV Padrão Highline ────────────────────────────────────────────────
    const duplicados = codigosDuplicados();
    const medias = lerAnaliseDasMedias(ARQUIVO_MEDIAS);
    const mediaPorCodigo = new Map(medias.map(m => [m.codigo, m]));

    let pv = await prisma.priceBook.findFirst({ where: { tenant_id: tenant.id, nome_lpu: NOME_PV } });
    const jaExistia = !!pv;
    if (!pv) {
        pv = await prisma.priceBook.create({
            data: {
                tenant_id: tenant.id,
                origem: 'PV_CLIENTE',
                contratante_id: highline?.id ?? null,
                tipo: 'IMPLANTACAO',
                versao: 'V1',
                nome_lpu: NOME_PV,
                regiao: 'NACIONAL',
                status: 'ATIVA',
                data_inicio_vigencia: new Date(),
            },
        });
    }

    const realinhar = process.argv.includes('--realinhar');

    // O que a PV já tem hoje, por linha do template — preço e estrutura preservados.
    const atuais = await prisma.priceBookItem.findMany({
        where: { pricebook_id: pv.id },
        select: {
            id: true, highline_template_row: true, valor_unitario: true,
            codigo_item: true, descricao: true, subtipo: true, unidade: true,
        },
    });
    const atualPorLinha = new Map(atuais.filter(i => i.highline_template_row != null)
        .map(i => [i.highline_template_row!, i]));

    let criados = 0, atualizados = 0, semeados = 0, preservados = 0;
    const estruturaEditada: string[] = [];

    for (const linha of HIGHLINE_PV_CATALOG) {
        const media = mediaPorCodigo.get(linha.code);
        const origemPreco = media
            ? `Média de ${media.n_pvs} PV(s) · mediana ${media.mediana} · faixa ${media.minimo}–${media.maximo} · variação ${media.variacao}x`
            : null;

        const existente = atualPorLinha.get(linha.templateRow);

        // Estrutura sempre vem do template oficial; preço só é semeado se falta.
        const estrutura = {
            subtipo: linha.category,          // coluna "Atividade" da PV
            codigo_item: linha.code,
            descricao: linha.description,
            descricao_normalizada: normalizar(linha.description),
            unidade: linha.unit,              // coluna "Unid. Medida" da PV
            codigo_duplicado: duplicados.has(linha.code),
        };

        if (existente) {
            const temPreco = existente.valor_unitario > 0;
            if (temPreco) preservados += 1; else if (media) semeados += 1;

            // Estrutura mexida na tela de LPUs. Sem --realinhar, a edição manda.
            const mexida = existente.descricao.trim() !== linha.description.trim()
                || (existente.unidade || '').trim() !== linha.unit.trim()
                || (existente.subtipo || '').trim() !== linha.category.trim()
                || (existente.codigo_item || '').trim() !== linha.code.trim();
            if (mexida) {
                estruturaEditada.push(`linha ${linha.templateRow} (${linha.code}): "${existente.descricao}" / ${existente.unidade} / ${existente.subtipo}`);
            }

            await prisma.priceBookItem.update({
                where: { id: existente.id },
                data: {
                    ...(mexida && !realinhar ? { codigo_duplicado: estrutura.codigo_duplicado } : estrutura),
                    ...(temPreco ? {} : {
                        valor_unitario: media?.media ?? 0,
                        observacoes: origemPreco,
                        data_referencia: media ? new Date() : null,
                    }),
                },
            });
            atualizados += 1;
        } else {
            if (media) semeados += 1;
            await prisma.priceBookItem.create({
                data: {
                    tenant_id: tenant.id,
                    pricebook_id: pv.id,
                    supplier_id: null,
                    regiao: 'NACIONAL',
                    tipo_escopo: 'SERVICO',
                    ...estrutura,
                    // Preço que a LS Office cobra da Highline. Zero = ainda sem
                    // valor de referência; a PV da Atividade não preenche esses.
                    valor_unitario: media?.media ?? 0,
                    highline_template_row: linha.templateRow,
                    observacoes: origemPreco,
                    data_referencia: media ? new Date() : null,
                },
            });
            criados += 1;
        }
    }

    console.log(`\n1. "${NOME_PV}" ${jaExistia ? '(atualizada)' : '(criada)'}: ${HIGHLINE_PV_CATALOG.length} itens`);
    console.log(`   criados: ${criados} · realinhados com o template: ${atualizados}`);
    console.log(`   preço semeado com a média histórica: ${semeados} · preço já existente preservado: ${preservados}`);
    console.log(`   códigos repetidos sinalizados: ${[...duplicados].join(', ') || 'nenhum'}`);
    if (estruturaEditada.length) {
        console.log(`   estrutura editada na tela: ${estruturaEditada.length} item(ns) ${realinhar ? 'DESCARTADOS (--realinhar)' : 'preservados'}`);
        estruturaEditada.slice(0, 10).forEach(d => console.log(`      · ${d}`));
        if (estruturaEditada.length > 10) console.log(`      ... e mais ${estruturaEditada.length - 10}`);
        if (!realinhar) console.log('      (rode com --realinhar para voltar ao texto do template oficial)');
    }

    // ── 2. Bases absorvidas ──────────────────────────────────────────────────
    console.log('');
    for (const nome of NOMES_ABSORVIDOS) await apagarBase(tenant.id, nome);

    // ── 3. LPU LS Office Geral ──────────────────────────────────────────────────────────
    const lsoc = await prisma.priceBook.findFirst({
        where: { tenant_id: tenant.id, nome_lpu: NOME_LPU_LS },
        include: { _count: { select: { items: true } } },
    });
    if (lsoc) {
        console.log(`\n2. "${NOME_LPU_LS}": já existe com ${lsoc._count.items} item(ns) — preservada`);
    } else {
        await prisma.priceBook.create({
            data: {
                tenant_id: tenant.id,
                origem: 'LPU_LS_OFFICE',
                supplier_id: null,
                contratante_id: null,
                tipo: null,
                versao: 'V1',
                nome_lpu: NOME_LPU_LS,
                regiao: 'NACIONAL',
                status: 'ATIVA',
                data_inicio_vigencia: new Date(),
            },
        });
        console.log(`\n2. "${NOME_LPU_LS}": criada vazia, para receber as cotações de mercado`);
    }

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('Falhou:', e.message);
    await prisma.$disconnect();
    process.exit(1);
});
