// Importa as duas bases de Operações (14/10/2026):
//
//   1. "LPU Operações LS Office" (LPU_LS_OFFICE, área OPERACAO) — de onde se
//      compõe o Orçamento LS das atividades de operação. Colunas usadas:
//        A Código LPU → codigo_item     B Código original → codigo_origem
//        C Categoria → subtipo          D Serviço consolidado → descricao
//        E Escopo / detalhamento → detalhamento
//        F Unidade                      U Preço vigente → valor_venda
//        Y Referência custo mercado → custo_ls (quando numérica)
//        X Status de revisão → observacoes
//   2. "PV O&M Highline" (PV_CLIENTE, área OPERACAO, cliente Highline) — o
//      cadastro de produtos O&M da Highline: só código e descrição, sem preço.
//      O preço de cada linha da PV O&M nasce no orçamento (histórico + edição).
//
// Item da LPU cujo código original é um código O&M da Highline já sai vinculado
// a ele (pv_item_id): é a primeira sugestão na vinculação do orçamento.
//
// As planilhas NÃO ficam no repositório (público). Informe os caminhos:
//
//   npx tsx src/backend/scripts/importar-lpu-operacoes.ts --lpu=<xlsx> --hl=<xlsx> [--sobrescrever]
//
// Reexecutar é seguro: preço editado na tela é preservado (use --sobrescrever
// para a planilha voltar a mandar).

import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const NOME_LPU_OPERACOES = 'LPU Operações LS Office';
export const NOME_PV_OM_HIGHLINE = 'PV O&M Highline';

const arg = (nome: string) => process.argv.find(a => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const texto = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const normalizada = (t: string) => semAcento(t).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
function num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
const UNIDADE: Record<string, string> = { M: 'm', 'M²': 'm²', 'M2': 'm²', 'M³': 'm³', UNID: 'UN', KG: 'kg' };
const unidade = (u: any) => { const t = texto(u); return UNIDADE[t.toUpperCase()] || t || 'VB'; };

function linhas(arquivo: string): any[][] {
    const wb = XLSX.readFile(arquivo);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
}

async function base(tenantId: string, nome: string, dados: Record<string, any>) {
    const atual = await prisma.priceBook.findFirst({ where: { tenant_id: tenantId, nome_lpu: nome } });
    if (atual) return prisma.priceBook.update({ where: { id: atual.id }, data: dados });
    console.log(`Base "${nome}" criada.`);
    return prisma.priceBook.create({ data: { tenant_id: tenantId, nome_lpu: nome, versao: 'V1', regiao: 'BRASIL', status: 'ATIVA', data_inicio_vigencia: new Date(), ...dados } as any });
}

async function main() {
    const arqLpu = arg('lpu'), arqHl = arg('hl');
    if (!arqLpu || !arqHl) throw new Error('Informe --lpu=<LPU Operações.xlsx> e --hl=<HIGHLINE - CADASTRO DE PRODUTOS.xlsx>');
    const sobrescrever = process.argv.includes('--sobrescrever');
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant cadastrado');
    const highline = await prisma.contratante.findFirst({
        where: { tenant_id: tenant.id, OR: [{ sigla: { in: ['HIGHLINE', 'Highline', 'HL'] } }, { nome: { contains: 'HIGHLINE' } }, { nome: { contains: 'Highline' } }] },
    });
    if (!highline) throw new Error('Cliente Highline não encontrado em Clientes');

    // ── 1. PV O&M Highline
    const pv = await base(tenant.id, NOME_PV_OM_HIGHLINE, { origem: 'PV_CLIENTE', tipo: 'OPERACAO', contratante_id: highline.id, supplier_id: null, padrao: true });
    const itensHl = linhas(arqHl).slice(1).filter(r => texto(r[0]) && texto(r[1]));
    const pvExistentes = new Map((await prisma.priceBookItem.findMany({ where: { pricebook_id: pv.id }, select: { id: true, codigo_item: true } })).map(i => [i.codigo_item!, i.id]));
    let pvNovos = 0;
    const pvPorCodigo = new Map<string, string>();
    for (const r of itensHl) {
        const codigo = texto(r[0]).toUpperCase();
        const descricao = texto(r[1]);
        const campos = { codigo_item: codigo, codigo_origem: codigo, descricao, descricao_normalizada: normalizada(descricao), unidade: 'UN', regiao: 'BRASIL', subtipo: 'O&M', ativo: true };
        const id = pvExistentes.get(codigo);
        if (id) { await prisma.priceBookItem.update({ where: { id }, data: campos }); pvPorCodigo.set(codigo, id); }
        else {
            const novo = await prisma.priceBookItem.create({ data: { tenant_id: tenant.id, pricebook_id: pv.id, supplier_id: null, tipo_escopo: 'SERVICO', valor_unitario: 0, ...campos } });
            pvPorCodigo.set(codigo, novo.id); pvNovos++;
        }
    }
    console.log(`PV O&M Highline: ${itensHl.length} itens (${pvNovos} novos).`);

    // ── 2. LPU Operações LS Office
    const lpu = await base(tenant.id, NOME_LPU_OPERACOES, { origem: 'LPU_LS_OFFICE', tipo: 'OPERACAO', contratante_id: null, supplier_id: null, padrao: true });
    const itensLpu = linhas(arqLpu).filter(r => /^LS-[A-Z]{3}-\d+/.test(texto(r[0])));
    const lpuExistentes = new Map((await prisma.priceBookItem.findMany({ where: { pricebook_id: lpu.id }, select: { id: true, codigo_item: true, valor_venda: true, custo_ls: true, pv_item_id: true } })).map(i => [i.codigo_item!, i]));
    let criados = 0, atualizados = 0, preservados = 0, vinculados = 0;
    for (const r of itensLpu) {
        const codigo = texto(r[0]);
        const origem = texto(r[1]);
        const descricao = texto(r[3]);
        const venda = num(r[20]);
        const custo = typeof r[24] === 'number' ? num(r[24]) : null;
        const pvItem = pvPorCodigo.get(origem.toUpperCase()) || null;
        if (pvItem) vinculados++;
        const campos = {
            codigo_item: codigo, codigo_origem: origem || null, subtipo: texto(r[2]) || null,
            descricao, descricao_normalizada: normalizada(descricao), detalhamento: texto(r[4]) || null,
            unidade: unidade(r[5]), regiao: 'BRASIL', observacoes: texto(r[23]) || null, ativo: true,
        };
        const atual = lpuExistentes.get(codigo);
        if (atual) {
            const mexido = Math.round((atual.valor_venda ?? 0) * 100) !== Math.round((venda ?? 0) * 100);
            const manter = mexido && !sobrescrever;
            if (manter) preservados++;
            await prisma.priceBookItem.update({
                where: { id: atual.id },
                data: { ...campos, ...(atual.pv_item_id ? {} : { pv_item_id: pvItem }), ...(manter ? {} : { valor_venda: venda, custo_ls: custo, data_referencia: new Date() }) },
            });
            atualizados++;
        } else {
            await prisma.priceBookItem.create({
                data: { tenant_id: tenant.id, pricebook_id: lpu.id, supplier_id: null, tipo_escopo: 'SERVICO', valor_unitario: 0, valor_venda: venda, custo_ls: custo, pv_item_id: pvItem, data_referencia: new Date(), ...campos },
            });
            criados++;
        }
    }
    console.log(`LPU Operações: ${itensLpu.length} itens (${criados} novos, ${atualizados} atualizados, ${preservados} com preço da tela preservado); ${vinculados} já vinculados a um código O&M da Highline.`);
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
