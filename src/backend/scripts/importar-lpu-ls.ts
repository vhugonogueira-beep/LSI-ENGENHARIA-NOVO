// Importa a "BASE CONSOLIDADA LPU LS" como a base LPU LS Office Geral — a LPU padrão da
// LS Office.
//
// Só sete informações entram, por definição da LS:
//
//   coluna A  Linha LPU   → codigo_origem, e dela sai o CÓDIGO LS (codigo_item)
//   coluna B  Família     → subtipo    (é por ela que a tela filtra)
//   coluna C  Grupo       ┐
//   coluna D  Subgrupo    ┘ → detalhamento ("Grupo › Subgrupo")
//   coluna E  Item        → descricao
//   coluna F  Un.         → unidade
//   coluna M  MERCADO NORTE  → valor_venda : o que a LS VENDE ao cliente
//   coluna T  CUSTO LS       → custo_ls      : o que a LS PAGA na compra
//
// As demais colunas da planilha (Nordeste, N+NE, Brasil, praticado em PV,
// dispersão, nº de fornecedores) ficam fora da base de propósito. Elas seguem
// na planilha; se um dia forem necessárias, entram aqui.
//
// Reexecutar é seguro: valor e custo digitados na tela são preservados. Use
// --sobrescrever para o número da planilha voltar a mandar.
//
//   npx tsx src/backend/scripts/importar-lpu-ls.ts [--sobrescrever]

import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ARQUIVO = path.resolve(process.cwd(), 'assets', 'lpu', 'BASE CONSOLIDADA LPU LS.xlsx');
const ABA = 'BASE CONSOLIDADA';
const NOME_BASE = 'LPU LS Office Geral';

const COL = {
    linha: 0,       // A  Linha LPU
    familia: 1,     // B
    grupo: 2,       // C
    subgrupo: 3,    // D
    item: 4,        // E
    unidade: 5,     // F
    mercado: 12,    // M  MERCADO NORTE → venda
    custo: 19,      // T  CUSTO LS      → compra
};

/**
 * Sigla de três letras por família. Explícita, para o código LS não mudar
 * quando uma família nova entrar e colidir na abreviação automática
 * (PROJETO e PROTEÇÃO, por exemplo, dariam "PRO" as duas).
 */
const SIGLA_FAMILIA: Record<string, string> = {
    MASTRO: 'MAS', POSTE: 'POS', TORRE: 'TOR', MONTAGEM: 'MON', INFRA: 'INF',
    ATERRAMENTO: 'ATE', FUNDACAO: 'FUN', ELETRICA: 'ELE', ADMINISTRATIVO: 'ADM',
    LOGISTICA: 'LOG', PROTECAO: 'PRT', LAUDO: 'LAU', LICENCIAMENTO: 'LIC',
    PINTURA: 'PIN', AQUISICAO: 'AQU', PROJETO: 'PRJ', REFORCO: 'REF',
};

function semAcento(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function texto(v: any): string {
    return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** LS-<FAMÍLIA>-<linha da LPU>. Estável: nasce da linha, que não muda. */
export function codigoLs(familia: string, linhaLpu: string): string {
    const chave = semAcento(familia).replace(/[^A-Z]/g, '');
    const sigla = SIGLA_FAMILIA[chave] || chave.slice(0, 3).padEnd(3, 'X') || 'GER';
    const n = Number(linhaLpu);
    const seq = Number.isFinite(n) ? String(n).padStart(4, '0') : semAcento(linhaLpu).slice(0, 4);
    return `LS-${sigla}-${seq}`;
}

async function main() {
    const sobrescrever = process.argv.includes('--sobrescrever');

    const wb = XLSX.readFile(ARQUIVO);
    if (!wb.Sheets[ABA]) throw new Error(`A planilha não tem a aba "${ABA}"`);
    const linhas: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[ABA], { header: 1, defval: null });
    const itens = linhas.slice(1).filter(r => texto(r[COL.item]));
    console.log(`Lidos ${itens.length} itens de "${path.basename(ARQUIVO)}".`);

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant cadastrado');

    let base = await prisma.priceBook.findFirst({ where: { tenant_id: tenant.id, nome_lpu: NOME_BASE } });
    if (!base) {
        base = await prisma.priceBook.create({
            data: {
                tenant_id: tenant.id, origem: 'LPU_LS_OFFICE', supplier_id: null, contratante_id: null,
                tipo: null, versao: 'V1', nome_lpu: NOME_BASE, regiao: 'NORTE',
                status: 'ATIVA', data_inicio_vigencia: new Date(),
            },
        });
        console.log(`Base "${NOME_BASE}" criada.`);
    }

    const existentes = await prisma.priceBookItem.findMany({
        where: { pricebook_id: base.id },
        select: { id: true, codigo_item: true, codigo_origem: true, valor_venda: true, custo_ls: true, observacoes: true },
    });
    // Casa pela linha de origem; o fallback pega a importação anterior, quando o
    // codigo_item ainda guardava a linha crua.
    const porOrigem = new Map(existentes.filter(i => i.codigo_origem).map(i => [i.codigo_origem!, i]));
    const porCodigoAntigo = new Map(existentes.filter(i => !i.codigo_origem && i.codigo_item).map(i => [i.codigo_item!, i]));

    let criados = 0, atualizados = 0, preservados = 0;
    let comMercado = 0, comCusto = 0, comAmbos = 0;
    const codigosVistos = new Set<string>();
    const colisoes: string[] = [];

    for (const r of itens) {
        const linhaLpu = texto(r[COL.linha]);
        const familia = texto(r[COL.familia]);
        const item = texto(r[COL.item]);
        const codigo = codigoLs(familia, linhaLpu);

        if (codigosVistos.has(codigo)) colisoes.push(codigo);
        codigosVistos.add(codigo);

        const valorVenda = num(r[COL.mercado]);
        const custoLs = num(r[COL.custo]);
        if (valorVenda) comMercado += 1;
        if (custoLs) comCusto += 1;
        if (valorVenda && custoLs) comAmbos += 1;

        const grupo = texto(r[COL.grupo]);
        const subgrupo = texto(r[COL.subgrupo]);

        // Em algumas linhas a coluna "Item" traz um número (uma quantidade ou
        // dimensão), não o nome. Nesses casos o texto que identifica o item é o
        // Subgrupo — usá-lo evita uma lista com dezenas de linhas chamadas "3".
        // O conteúdo original da célula fica registrado, não se perde.
        const itemEhNumero = /^\d+([.,]\d+)?$/.test(item);
        const descricao = itemEhNumero ? (subgrupo || grupo || item) : item;
        const notaItem = itemEhNumero ? `Coluna "Item" da planilha: ${item} — descrição herdada do subgrupo` : null;

        const campos = {
            codigo_item: codigo,
            codigo_origem: linhaLpu || null,
            subtipo: familia || null,
            detalhamento: [grupo, subgrupo].filter(Boolean).join(' › ') || null,
            descricao,
            descricao_normalizada: semAcento(descricao).replace(/[^\w\s]/g, '').replace(/\s+/g, ' '),
            unidade: texto(r[COL.unidade]) || 'VB',
            regiao: 'NORTE',
        };

        const existente = porOrigem.get(linhaLpu) || porCodigoAntigo.get(linhaLpu);

        if (existente) {
            // "Mexido" é o valor que DIVERGE da planilha — foi alguém que trocou.
            // Comparar com "tem valor" marcaria como manual tudo que a própria
            // planilha trouxe, e a base nunca mais aceitaria atualização de preço.
            const igual = (a: number | null, b: number | null) =>
                (a ?? null) === null && (b ?? null) === null
                || Math.round((a ?? 0) * 100) === Math.round((b ?? 0) * 100);
            const mexido = !igual(existente.valor_venda, valorVenda) || !igual(existente.custo_ls, custoLs);
            const manterNumeros = mexido && !sobrescrever;
            if (manterNumeros) preservados += 1;
            // Anotação escrita à mão na tela não é varrida pela reimportação —
            // é ela que explica por que um valor diverge da planilha.
            const temNotaManual = !!existente.observacoes && existente.observacoes !== notaItem;

            await prisma.priceBookItem.update({
                where: { id: existente.id },
                data: {
                    ...campos,
                    ...(temNotaManual ? {} : { observacoes: notaItem }),
                    ...(manterNumeros ? {} : {
                        valor_venda: valorVenda,
                        custo_ls: custoLs,
                        data_referencia: new Date(),
                    }),
                },
            });
            atualizados += 1;
        } else {
            await prisma.priceBookItem.create({
                data: {
                    tenant_id: tenant.id,
                    pricebook_id: base.id,
                    supplier_id: null,
                    tipo_escopo: 'SERVICO',
                    ...campos,
                    observacoes: notaItem,
                    // Nesta natureza de base o par que vale é venda × compra.
                    valor_unitario: 0,
                    valor_venda: valorVenda,
                    custo_ls: custoLs,
                    data_referencia: new Date(),
                },
            });
            criados += 1;
        }
    }

    console.log('');
    console.log(`"${NOME_BASE}": ${criados} criado(s) · ${atualizados} atualizado(s)`);
    if (preservados) console.log(`  valores digitados na tela preservados: ${preservados} (--sobrescrever troca pela planilha)`);
    if (colisoes.length) console.log(`  ATENÇÃO: ${colisoes.length} código(s) LS repetido(s): ${[...new Set(colisoes)].join(', ')}`);
    console.log('');
    console.log(`  com valor venda (coluna M)   : ${comMercado} de ${itens.length}`);
    console.log(`  com custo LS (coluna T)      : ${comCusto} de ${itens.length}`);
    console.log(`  com os dois → margem         : ${comAmbos}`);

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('Falhou:', e.message);
    await prisma.$disconnect();
    process.exit(1);
});
