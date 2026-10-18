// Cadastro de bases (LPUs) pela tela (18/10/2026).
//
// Antes, bases só nasciam por script: quem excluía a PV Padrão Highline no
// portal não tinha como trazê-la de volta. Aqui ficam:
//   - criarBase: nova base com natureza (PV do cliente, custo LS, fornecedor),
//     área (implantação, operação ou as duas) e cliente;
//   - importarItensPlanilha: itens de uma planilha Excel/CSV, colunas achadas
//     pelo NOME do cabeçalho (nunca pela posição);
//   - restaurarPvHighline: recria a PV Padrão Highline a partir do catálogo
//     oficial que vem com o sistema (266 linhas do template "PV HIGHLINE PADRÃO").

import path from 'path';
import XLSX from 'xlsx';
import { prisma } from '../server';
import { HIGHLINE_PV_CATALOG } from '../data/highline-pv-catalog';
import { lerAnaliseDasMedias } from '../scripts/importar-pv-medio';

export const NOME_PV_HIGHLINE = 'PV Padrão Highline';
const ORIGENS = ['PV_CLIENTE', 'LPU_LS_OFFICE', 'FORNECEDOR'];
const AREAS = ['IMPLANTACAO', 'OPERACAO'];
const ARQUIVO_MEDIAS = path.resolve(process.cwd(), 'assets', 'lpu', 'PV MÉDIO CONSOLIDADO - LS OFFICE - 36 PVs.xlsx');

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function criarBase(tenantId: string, d: {
    nome_lpu?: string; origem?: string; tipo?: string | null; contratante_id?: string | null;
    supplier_id?: string | null; regiao?: string; versao?: string; padrao?: boolean;
}) {
    const nome = String(d.nome_lpu || '').trim();
    if (nome.length < 3) throw new Error('Dê um nome à base (pelo menos 3 letras)');
    const origem = String(d.origem || '');
    if (!ORIGENS.includes(origem)) throw new Error('Escolha a natureza: Preço ao cliente (PV), Custo LS ou Fornecedor');
    const tipo = d.tipo ? String(d.tipo) : null;
    if (tipo && !AREAS.includes(tipo)) throw new Error('Área inválida: Implantação, Operação ou as duas');
    if (origem === 'FORNECEDOR' && !d.supplier_id) throw new Error('Base de fornecedor precisa do fornecedor');
    const existe = await prisma.priceBook.findFirst({ where: { tenant_id: tenantId, nome_lpu: nome, status: 'ATIVA' } });
    if (existe) throw new Error(`Já existe uma base ativa chamada "${nome}"`);
    const base = await prisma.priceBook.create({
        data: {
            tenant_id: tenantId, nome_lpu: nome, origem, tipo,
            contratante_id: d.contratante_id || null,
            supplier_id: origem === 'FORNECEDOR' ? d.supplier_id || null : null,
            regiao: String(d.regiao || 'NACIONAL').trim() || 'NACIONAL',
            versao: String(d.versao || 'V1').trim() || 'V1',
            status: 'ATIVA', data_inicio_vigencia: new Date(),
        },
    });
    if (d.padrao) {
        const { PriceBookService } = await import('./pricebook.service');
        await PriceBookService.updatePriceBook(base.id, { padrao: true });
    }
    return prisma.priceBook.findUnique({ where: { id: base.id }, include: { _count: { select: { items: true } } } });
}

/** Coluna da planilha pelo nome do cabeçalho (sem acento, sem caixa). */
const CABECALHOS: Record<string, RegExp> = {
    codigo: /^(COD(IGO)?( ?(DO )?ITEM| LPU| LS)?|ITEM|REF(ERENCIA)?)$/,
    descricao: /^(DESCRICAO( DO (ITEM|SERVICO))?|SERVICO( CONSOLIDADO)?|ITEM DESCRICAO|NOME)$/,
    unidade: /^(UNID(ADE)?\.?( (DE )?MEDIDA)?|UN|UND)$/,
    categoria: /^(CATEGORIA|ATIVIDADE|GRUPO|FAMILIA|DISCIPLINA)$/,
    detalhamento: /^(DETALHAMENTO|ESCOPO( \/ DETALHAMENTO)?|OBS(ERVACAO|ERVACOES)?)$/,
    valor: /^(VALOR( UNIT(ARIO)?\.?)?|PRECO( UNIT(ARIO)?)?|PRECO VIGENTE|VALOR VENDA|PRECO (AO )?CLIENTE)$/,
    custo: /^(CUSTO( LS| UNIT(ARIO)?)?)$/,
};

export async function importarItensPlanilha(baseId: string, buffer: Buffer) {
    const base = await prisma.priceBook.findUnique({ where: { id: baseId } });
    if (!base) throw new Error('Base não encontrada');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let linhas: any[][] = [];
    let mapa: Record<string, number> = {};
    let inicio = -1;
    // Procura, em cada aba, a primeira linha que tenha ao menos descrição: é o cabeçalho.
    for (const nome of wb.SheetNames) {
        const ls: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null });
        for (let i = 0; i < Math.min(ls.length, 40); i++) {
            const m: Record<string, number> = {};
            (ls[i] || []).forEach((c, j) => {
                const t = normalizar(String(c ?? '')).replace(/[^A-Z0-9 /.]/g, '').trim();
                for (const [campo, re] of Object.entries(CABECALHOS)) if (m[campo] === undefined && re.test(t)) m[campo] = j;
            });
            if (m.descricao !== undefined) { linhas = ls; mapa = m; inicio = i + 1; break; }
        }
        if (inicio >= 0) break;
    }
    if (inicio < 0) throw new Error('Não achei o cabeçalho: a planilha precisa de uma coluna "Descrição" (e, se tiver, "Código", "Unidade", "Categoria", "Valor", "Custo")');

    const texto = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const num = (v: any) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) && n >= 0 ? r2(n) : null;
    };
    const existentes = await prisma.priceBookItem.findMany({ where: { pricebook_id: base.id }, select: { id: true, codigo_item: true, descricao_normalizada: true } });
    const porCodigo = new Map(existentes.filter(i => i.codigo_item).map(i => [i.codigo_item!.toUpperCase(), i.id]));
    const porDescricao = new Map(existentes.map(i => [i.descricao_normalizada, i.id]));
    const ehLs = base.origem === 'LPU_LS_OFFICE';
    let criados = 0, atualizados = 0, ignorados = 0;
    for (const l of linhas.slice(inicio)) {
        const descricao = texto(l[mapa.descricao]);
        if (!descricao) { ignorados++; continue; }
        const codigo = mapa.codigo !== undefined ? texto(l[mapa.codigo]) || null : null;
        const valor = mapa.valor !== undefined ? num(l[mapa.valor]) : null;
        const custo = mapa.custo !== undefined ? num(l[mapa.custo]) : null;
        const campos = {
            descricao, descricao_normalizada: normalizar(descricao),
            codigo_item: codigo,
            unidade: (mapa.unidade !== undefined ? texto(l[mapa.unidade]) : '') || 'VB',
            subtipo: mapa.categoria !== undefined ? texto(l[mapa.categoria]) || null : null,
            detalhamento: mapa.detalhamento !== undefined ? texto(l[mapa.detalhamento]) || null : null,
            // Custo LS: o par que vale é venda × custo; nas demais, o valor unitário.
            ...(ehLs ? { valor_venda: valor, custo_ls: custo } : { valor_unitario: valor ?? 0, ...(custo !== null ? { custo_ls: custo } : {}) }),
        };
        const id = (codigo && porCodigo.get(codigo.toUpperCase())) || porDescricao.get(campos.descricao_normalizada);
        if (id) {
            await prisma.priceBookItem.update({ where: { id }, data: { ...campos, ativo: true } });
            atualizados++;
        } else {
            const novo = await prisma.priceBookItem.create({
                data: {
                    tenant_id: base.tenant_id, pricebook_id: base.id, supplier_id: base.supplier_id, regiao: base.regiao,
                    tipo_escopo: 'SERVICO', valor_unitario: 0, data_referencia: new Date(), ...campos,
                },
            });
            if (codigo) porCodigo.set(codigo.toUpperCase(), novo.id);
            porDescricao.set(campos.descricao_normalizada, novo.id);
            criados++;
        }
    }
    return { criados, atualizados, ignorados, colunas: Object.keys(mapa) };
}

/**
 * Recria (ou completa) a PV Padrão Highline com as 266 linhas do template
 * oficial. Base arquivada volta a ativa; preço já digitado é preservado; item
 * sem preço recebe a média histórica das PVs, quando houver.
 */
export async function restaurarPvHighline(tenantId: string) {
    const highline = await prisma.contratante.findFirst({
        where: { tenant_id: tenantId, OR: [{ sigla: 'HIGHLINE' }, { nome: { contains: 'HIGHLINE' } }, { nome: { contains: 'Highline' } }] },
    });
    let base = await prisma.priceBook.findFirst({ where: { tenant_id: tenantId, nome_lpu: NOME_PV_HIGHLINE }, orderBy: { updated_at: 'desc' } });
    const criada = !base;
    if (!base) {
        base = await prisma.priceBook.create({
            data: {
                tenant_id: tenantId, origem: 'PV_CLIENTE', contratante_id: highline?.id ?? null, tipo: 'IMPLANTACAO',
                versao: 'V1', nome_lpu: NOME_PV_HIGHLINE, regiao: 'NACIONAL', status: 'ATIVA', data_inicio_vigencia: new Date(),
            },
        });
    } else if (base.status !== 'ATIVA') {
        base = await prisma.priceBook.update({ where: { id: base.id }, data: { status: 'ATIVA' } });
    }
    let medias = new Map<string, ReturnType<typeof lerAnaliseDasMedias>[number]>();
    try { medias = new Map(lerAnaliseDasMedias(ARQUIVO_MEDIAS).map(m => [m.codigo, m])); } catch { /* sem a planilha de médias, entra sem preço */ }
    const contagem = new Map<string, number>();
    for (const c of HIGHLINE_PV_CATALOG) contagem.set(c.code, (contagem.get(c.code) || 0) + 1);
    const atuais = new Map((await prisma.priceBookItem.findMany({
        where: { pricebook_id: base.id, highline_template_row: { not: null } },
        select: { id: true, highline_template_row: true, valor_unitario: true },
    })).map(i => [i.highline_template_row!, i]));
    let criados = 0, reativados = 0, comPreco = 0;
    for (const linha of HIGHLINE_PV_CATALOG) {
        const media = medias.get(linha.code);
        const estrutura = {
            subtipo: linha.category, codigo_item: linha.code, descricao: linha.description,
            descricao_normalizada: normalizar(linha.description), unidade: linha.unit,
            codigo_duplicado: (contagem.get(linha.code) || 0) > 1, ativo: true,
        };
        const atual = atuais.get(linha.templateRow);
        if (atual) {
            const semPreco = !(atual.valor_unitario > 0);
            await prisma.priceBookItem.update({
                where: { id: atual.id },
                data: { ...estrutura, ...(semPreco && media ? { valor_unitario: media.media, observacoes: `Média de ${media.n_pvs} PV(s)` } : {}) },
            });
            reativados++;
            if (!semPreco || media) comPreco++;
        } else {
            await prisma.priceBookItem.create({
                data: {
                    tenant_id: tenantId, pricebook_id: base.id, supplier_id: null, regiao: 'NACIONAL', tipo_escopo: 'SERVICO',
                    ...estrutura, valor_unitario: media?.media ?? 0, highline_template_row: linha.templateRow,
                    observacoes: media ? `Média de ${media.n_pvs} PV(s)` : null, data_referencia: media ? new Date() : null,
                },
            });
            criados++;
            if (media) comPreco++;
        }
    }
    // Linha fora do template oficial não é apagada (pode ter orçamento usando):
    // só deixa de contar como serviço da PV.
    const extras = await prisma.priceBookItem.updateMany({
        where: { pricebook_id: base.id, OR: [{ highline_template_row: null }, { highline_template_row: { notIn: HIGHLINE_PV_CATALOG.map(c => c.templateRow) } }] },
        data: { ativo: false },
    });
    const { PriceBookService } = await import('./pricebook.service');
    await PriceBookService.updatePriceBook(base.id, { padrao: true });
    return { id: base.id, criada, criados, mantidos: reativados, com_preco: comPreco, total: HIGHLINE_PV_CATALOG.length, desativados: extras.count };
}
