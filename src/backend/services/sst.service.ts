// Segurança do trabalho (SST) de fornecedores e prestadores — decisões de 09/10/2026:
// - os trabalhos que a pessoa executa (altura, eletricidade...) definem os
//   certificados exigidos; a empresa pode criar trabalhos e documentos novos;
// - prestador pessoa física e cada membro da equipe precisam de RG e CPF;
// - pendência só AVISA (na contratação e nas pendências da atividade), não bloqueia;
// - vale só para quem presta serviço: fornecedor de material/equipamento fica fora.

import { prisma } from '../server';

export interface DocumentoSst { codigo: string; nome: string; meses: number; grupo: 'PESSOAL' | 'SST' | 'EMPRESA'; personalizado?: boolean; id?: string }
export interface TrabalhoSst { codigo: string; nome: string; exige: string[]; personalizado?: boolean; id?: string }

/** Documentos de fábrica, com a validade usual em meses (0 = sem vencimento). */
export const DOCUMENTOS_PADRAO: DocumentoSst[] = [
    { codigo: 'RG', nome: 'RG — Identidade', meses: 0, grupo: 'PESSOAL' },
    { codigo: 'CPF', nome: 'CPF', meses: 0, grupo: 'PESSOAL' },
    { codigo: 'CNH', nome: 'CNH', meses: 0, grupo: 'PESSOAL' },
    { codigo: 'COMPROVANTE_RESIDENCIA', nome: 'Comprovante de residência', meses: 0, grupo: 'PESSOAL' },
    { codigo: 'ASO', nome: 'ASO — Atestado de saúde ocupacional', meses: 12, grupo: 'SST' },
    { codigo: 'NR06', nome: 'NR-06 — EPI (ficha de entrega)', meses: 0, grupo: 'SST' },
    { codigo: 'NR10', nome: 'NR-10 — Segurança em eletricidade', meses: 24, grupo: 'SST' },
    { codigo: 'NR10_SEP', nome: 'NR-10 SEP — Sistema elétrico de potência', meses: 12, grupo: 'SST' },
    { codigo: 'NR11', nome: 'NR-11 — Movimentação de cargas', meses: 24, grupo: 'SST' },
    { codigo: 'NR12', nome: 'NR-12 — Máquinas e equipamentos', meses: 24, grupo: 'SST' },
    { codigo: 'NR18', nome: 'NR-18 — Construção civil', meses: 24, grupo: 'SST' },
    { codigo: 'NR33', nome: 'NR-33 — Espaço confinado', meses: 12, grupo: 'SST' },
    { codigo: 'NR35', nome: 'NR-35 — Trabalho em altura', meses: 24, grupo: 'SST' },
    { codigo: 'RESGATE', nome: 'Resgate em altura', meses: 24, grupo: 'SST' },
    { codigo: 'PGR', nome: 'PGR — Programa de gerenciamento de riscos', meses: 24, grupo: 'EMPRESA' },
    { codigo: 'PCMSO', nome: 'PCMSO — Controle médico de saúde ocupacional', meses: 12, grupo: 'EMPRESA' },
    { codigo: 'SEGURO_VIDA', nome: 'Seguro de vida', meses: 12, grupo: 'EMPRESA' },
    { codigo: 'ART', nome: 'ART — Anotação de responsabilidade técnica', meses: 0, grupo: 'EMPRESA' },
    { codigo: 'OUTRO', nome: 'Outro documento', meses: 0, grupo: 'PESSOAL' },
];

/** Trabalhos de fábrica e o que cada um exige (tabela aprovada em 09/10/2026). */
export const TRABALHOS_PADRAO: TrabalhoSst[] = [
    { codigo: 'CAMPO', nome: 'Trabalho de campo (qualquer)', exige: ['ASO', 'NR06'] },
    { codigo: 'ALTURA', nome: 'Trabalho em altura', exige: ['NR35', 'ASO'] },
    { codigo: 'ELETRICIDADE', nome: 'Eletricidade', exige: ['NR10'] },
    { codigo: 'ELETRICIDADE_SEP', nome: 'Eletricidade perto de alta tensão (SEP)', exige: ['NR10', 'NR10_SEP'] },
    { codigo: 'ESPACO_CONFINADO', nome: 'Espaço confinado', exige: ['NR33'] },
    { codigo: 'MAQUINAS', nome: 'Máquinas e equipamentos', exige: ['NR12'] },
    { codigo: 'OBRA_CIVIL', nome: 'Obra civil', exige: ['NR18'] },
    { codigo: 'DIRIGIR', nome: 'Dirigir veículo da obra', exige: ['CNH'] },
];

/** Documentos que toda pessoa física que vai a campo apresenta. */
const BASE_PESSOA = ['RG', 'CPF'];

/** Categorias de fornecedor que não prestam serviço — sem SST. */
const SEM_SST = new Set(['MATERIAL', 'EQUIPAMENTO']);
export const exigeSst = (categoria?: string | null) => !SEM_SST.has(String(categoria || '').toUpperCase());

export function lerLista(json?: string | null): string[] {
    try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

export async function catalogo(tenant_id: string) {
    const proprios = await prisma.itemCatalogoSst.findMany({ where: { tenant_id, ativo: true }, orderBy: { nome: 'asc' } });
    const documentos: DocumentoSst[] = [
        ...DOCUMENTOS_PADRAO,
        ...proprios.filter(i => i.tipo === 'DOCUMENTO').map(i => ({ codigo: i.codigo, nome: i.nome, meses: i.meses, grupo: 'SST' as const, personalizado: true, id: i.id })),
    ];
    const trabalhos: TrabalhoSst[] = [
        ...TRABALHOS_PADRAO,
        ...proprios.filter(i => i.tipo === 'TRABALHO').map(i => ({ codigo: i.codigo, nome: i.nome, exige: lerLista(i.exige), personalizado: true, id: i.id })),
    ];
    return { documentos, trabalhos };
}

/** Código estável a partir do nome: "Solda e corte" → "SOLDA_E_CORTE". */
export function codigoDoNome(nome: string) {
    return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

/** VENCIDO | VENCE_EM_BREVE | VALIDO | SEM_VALIDADE — aviso com 30 dias de antecedência. */
export function situacaoValidade(validade: Date | null | undefined) {
    if (!validade) return { situacao: 'SEM_VALIDADE', diasRestantes: null as number | null };
    const dias = Math.ceil((validade.getTime() - Date.now()) / 86400000);
    if (dias < 0) return { situacao: 'VENCIDO', diasRestantes: dias };
    if (dias <= 30) return { situacao: 'VENCE_EM_BREVE', diasRestantes: dias };
    return { situacao: 'VALIDO', diasRestantes: dias };
}

export interface Pendencia { pessoa: string; codigo: string; documento: string; motivo: 'FALTANDO' | 'VENCIDO' | 'VENCE_EM_BREVE'; dias?: number | null }

type Doc = { tipo: string; data_validade: Date | null };

/**
 * Pendências de uma pessoa (o prestador PF ou um membro da equipe; a empresa
 * PJ não tem exigência própria — os documentos dela são opcionais). Para cada documento exigido vale
 * o de validade mais longa que ela tiver.
 */
export function avaliarPessoa(pessoa: string, ehPessoaFisica: boolean, trabalhos: string[], docs: Doc[], cat: { documentos: DocumentoSst[]; trabalhos: TrabalhoSst[] }) {
    const nomeDoc = (c: string) => cat.documentos.find(d => d.codigo === c)?.nome || c;
    const exigidos = new Set<string>(ehPessoaFisica ? BASE_PESSOA : []);
    for (const t of trabalhos) cat.trabalhos.find(x => x.codigo === t)?.exige.forEach(c => exigidos.add(c));

    const pendencias: Pendencia[] = [];
    for (const codigo of exigidos) {
        const doTipo = docs.filter(d => d.tipo === codigo);
        if (!doTipo.length) { pendencias.push({ pessoa, codigo, documento: nomeDoc(codigo), motivo: 'FALTANDO' }); continue; }
        if (doTipo.some(d => !d.data_validade)) continue;
        const melhor = doTipo.reduce((a, b) => (a.data_validade! > b.data_validade! ? a : b));
        const s = situacaoValidade(melhor.data_validade);
        if (s.situacao === 'VENCIDO' || s.situacao === 'VENCE_EM_BREVE') pendencias.push({ pessoa, codigo, documento: nomeDoc(codigo), motivo: s.situacao, dias: s.diasRestantes });
    }
    // Documento enviado mesmo sem ser exigido, mas vencido, também é aviso.
    for (const d of docs) {
        if (exigidos.has(d.tipo)) continue;
        const s = situacaoValidade(d.data_validade);
        if (s.situacao === 'VENCIDO' && !pendencias.some(p => p.codigo === d.tipo)) pendencias.push({ pessoa, codigo: d.tipo, documento: nomeDoc(d.tipo), motivo: 'VENCIDO', dias: s.diasRestantes });
    }
    return { exigidos: [...exigidos], pendencias };
}

/** EM_DIA | VENCE_EM_BREVE | PENDENTE | NAO_SE_APLICA */
export function resumir(pendencias: Pendencia[], aplica = true) {
    if (!aplica) return { situacao: 'NAO_SE_APLICA', pendencias: 0, vencendo: 0 };
    const graves = pendencias.filter(p => p.motivo !== 'VENCE_EM_BREVE').length;
    const vencendo = pendencias.length - graves;
    return { situacao: graves ? 'PENDENTE' : vencendo ? 'VENCE_EM_BREVE' : 'EM_DIA', pendencias: graves, vencendo };
}

const incluirDocs = { orderBy: { data_validade: 'asc' as const }, include: { arquivos: { orderBy: { created_at: 'asc' as const } } } };

/** Tudo de SST de um fornecedor: documentos dele, equipe, pendências. */
export async function sstDoFornecedor(supplierId: string) {
    const s = await prisma.supplier.findUnique({
        where: { id: supplierId },
        include: {
            qualificacoes: { where: { membro_id: null }, ...incluirDocs },
            membrosEquipe: { where: { ativo: true }, orderBy: { nome: 'asc' }, include: { qualificacoes: incluirDocs } },
        },
    });
    if (!s) throw new Error('Fornecedor não encontrado');
    const cat = await catalogo(s.tenant_id);
    const aplica = exigeSst(s.categoria);
    const pf = s.tipo !== 'PESSOA_JURIDICA';
    const trabalhos = lerLista(s.sst_trabalhos);
    const nomeDoc = (c: string) => cat.documentos.find(d => d.codigo === c)?.nome || c;
    const comSituacao = (qs: any[]) => qs.map(q => ({ ...q, rotulo: q.tipo === 'OUTRO' && q.descricao ? q.descricao : nomeDoc(q.tipo), ...situacaoValidade(q.data_validade) }));

    // PJ: quem sobe na torre são os membros da equipe; a empresa em si não tem NR.
    const proprio = avaliarPessoa(s.nome, pf, pf ? trabalhos : [], s.qualificacoes, cat);
    const membros = s.membrosEquipe.map(m => {
        const t = lerLista(m.sst_trabalhos);
        const av = avaliarPessoa(m.nome, true, t, m.qualificacoes, cat);
        return { ...m, sst_trabalhos: t, documentos: comSituacao(m.qualificacoes), qualificacoes: undefined, exigidos: av.exigidos, pendencias: av.pendencias, resumo: resumir(av.pendencias) };
    });
    const todas = [...proprio.pendencias, ...membros.flatMap(m => m.pendencias)];
    return {
        aplica,
        trabalhos,
        documentos: comSituacao(s.qualificacoes),
        exigidos: proprio.exigidos,
        pendencias: proprio.pendencias,
        membros,
        resumo: resumir(todas, aplica),
        pendencias_total: aplica ? todas : [],
    };
}

/** Resumo de vários fornecedores de uma vez (cartões da lista, filtro, atividade). */
export async function resumoSst(tenant_id: string, supplierIds?: string[]) {
    const lista = await prisma.supplier.findMany({
        where: { tenant_id, ...(supplierIds ? { id: { in: supplierIds } } : {}) },
        select: {
            id: true, nome: true, tipo: true, categoria: true, sst_trabalhos: true,
            qualificacoes: { where: { membro_id: null }, select: { tipo: true, data_validade: true } },
            membrosEquipe: { where: { ativo: true }, select: { nome: true, sst_trabalhos: true, qualificacoes: { select: { tipo: true, data_validade: true } } } },
        },
    });
    const cat = await catalogo(tenant_id);
    const saida: Record<string, ReturnType<typeof resumir> & { membros: number; itens: Pendencia[] }> = {};
    for (const s of lista) {
        const aplica = exigeSst(s.categoria);
        const pend = aplica ? [
            ...avaliarPessoa(s.nome, s.tipo !== 'PESSOA_JURIDICA', s.tipo !== 'PESSOA_JURIDICA' ? lerLista(s.sst_trabalhos) : [], s.qualificacoes, cat).pendencias,
            ...s.membrosEquipe.flatMap(m => avaliarPessoa(m.nome, true, lerLista(m.sst_trabalhos), m.qualificacoes, cat).pendencias),
        ] : [];
        saida[s.id] = { ...resumir(pend, aplica), membros: s.membrosEquipe.length, itens: pend };
    }
    return saida;
}
