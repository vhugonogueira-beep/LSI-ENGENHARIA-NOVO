// ─────────────────────────────────────────────────────────────────────────────
// Custo real da atividade (04/11/2026).
//
// Custo real = tudo o que foi efetivamente gasto dentro da atividade. Não é o
// Custo planejado (aba própria, só em Implantação). Junta quatro origens:
//   1. FORNECEDOR       — parcelas pagas das contratações (fornecedor/prestador/funcionário);
//   2. REEMBOLSO        — despesas de reembolso/adiantamento da própria atividade;
//   3. RATEIO_PROJETO   — despesas de adiantamento de projeto rateadas para esta atividade;
//   4. PRESTACAO_CONTAS — despesas da prestação de contas consolidada destinadas a ela.
//
// Os comprovantes e NFs anexados aos pagamentos são lidos por IA (Claude) para
// conferir valor, data, número e emitente contra o lançamento. Só os campos
// extraídos ficam gravados (LeituraDocumentoFinanceiro) — nunca o arquivo nem o texto.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../server';
import { loadPaymentAttachment } from './payment-attachment.service';
import { MODELO_IA, iaDisponivel } from './ia-orcamento.service';

const PAGOS = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];
const cent = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
/** Diferença tolerada entre o valor lido no documento e o lançado (centavos de arredondamento). */
const TOLERANCIA = 0.5;

export interface DocumentoLido {
    id: string;
    tipo: string; // COMPROVANTE_PAGAMENTO | DOCUMENTO_FISCAL | OUTRO_DOCUMENTO
    nome: string;
    mime: string;
    enviado_em: Date;
    leitura: null | {
        status: string; tipo_documento: string | null; valor: number | null; data_documento: Date | null;
        numero: string | null; emitente: string | null; emitente_documento: string | null;
        descricao: string | null; observacao: string | null; lido_em: Date;
    };
}

export interface Lancamento {
    id: string;
    origem: 'FORNECEDOR' | 'REEMBOLSO' | 'RATEIO_PROJETO' | 'PRESTACAO_CONTAS';
    referencia: string;        // "Contratação · parcela ENTRADA", "REE-2026-0041"...
    favorecido: string;
    categoria: string;
    descricao: string | null;
    valor: number;
    pago: boolean;             // dinheiro já saiu da LS
    status: string;
    data: Date | null;         // pagamento (fornecedor) ou data da despesa
    forma_pagamento: string | null;
    tem_comprovante: boolean;
    tem_nf: boolean;
    documentos: DocumentoLido[];
    valor_lido: number | null; // soma dos comprovantes lidos (ou da NF, se não houver comprovante)
    divergencia: number | null; // valor_lido - valor, quando passa da tolerância
}

const docDe = (a: any): DocumentoLido => ({
    id: a.id, tipo: a.tipo, nome: a.nome_original, mime: a.mime_type, enviado_em: a.created_at,
    leitura: a.leitura ? {
        status: a.leitura.status, tipo_documento: a.leitura.tipo_documento, valor: a.leitura.valor,
        data_documento: a.leitura.data_documento, numero: a.leitura.numero, emitente: a.leitura.emitente,
        emitente_documento: a.leitura.emitente_documento, descricao: a.leitura.descricao,
        observacao: a.leitura.observacao, lido_em: a.leitura.lido_em,
    } : null,
});

/** Valor lido nos documentos: soma dos comprovantes lidos; sem comprovante lido, a NF. */
function valorLido(docs: DocumentoLido[]): number | null {
    const lidos = docs.filter(d => d.leitura?.status === 'LIDO' && d.leitura.valor != null);
    const comp = lidos.filter(d => d.tipo === 'COMPROVANTE_PAGAMENTO' || d.leitura?.tipo_documento === 'COMPROVANTE');
    const base = comp.length ? comp : lidos.filter(d => d.tipo === 'DOCUMENTO_FISCAL' || d.leitura?.tipo_documento === 'NOTA_FISCAL');
    return base.length ? cent(base.reduce((s, d) => s + (d.leitura!.valor || 0), 0)) : null;
}

const nomeFavorecido = (supplier?: any, funcionario?: any, avulso?: string | null) =>
    supplier?.nome_fantasia || supplier?.nome || funcionario?.nome || avulso || '—';

const includeAnexos = { anexos: { include: { leitura: true }, orderBy: { created_at: 'asc' as const } } };

export async function custoRealDaAtividade(atividadeId: string, tenantId: string) {
    const atividade = await prisma.atividade.findFirst({
        where: { id: atividadeId, tenant_id: tenantId },
        select: { id: true, codigo: true, titulo: true, id_site_sharing: true, tipo_demanda: true, valor_contrato: true, valor_orcado: true },
    });
    if (!atividade) throw Object.assign(new Error('Atividade não encontrada'), { status: 404 });

    const [contratacoes, reembolsos, despesasRateadas, despesasPrestacao] = await Promise.all([
        prisma.contratacaoFornecedor.findMany({
            where: { atividade_id: atividadeId, status: { not: 'CANCELADA' } },
            include: {
                supplier: { select: { nome: true, nome_fantasia: true } },
                funcionario: { select: { nome: true } },
                parcelas: { include: includeAnexos, orderBy: { created_at: 'asc' } },
            },
        }),
        // Reembolsos/adiantamentos da própria atividade.
        prisma.reembolso.findMany({
            where: { atividade_id: atividadeId, status: { not: 'CANCELADO' } },
            include: {
                supplier: { select: { nome: true, nome_fantasia: true } },
                funcionario: { select: { nome: true } },
                despesas: { orderBy: { ordem: 'asc' } },
                pagamentos: { include: includeAnexos, orderBy: { numero: 'asc' } },
            },
        }),
        // Rateio de adiantamento de PROJETO para esta atividade.
        prisma.reembolsoDespesa.findMany({
            where: { atividade_id: atividadeId, reembolso: { status: { not: 'CANCELADO' }, OR: [{ atividade_id: null }, { atividade_id: { not: atividadeId } }] } },
            include: {
                reembolso: { select: { codigo: true, natureza: true, favorecido_nome: true } },
                supplier: { select: { nome: true, nome_fantasia: true } },
                funcionario: { select: { nome: true } },
            },
        }),
        prisma.prestacaoContasDespesa.findMany({
            where: { atividade_id: atividadeId },
            include: { prestacao: { select: { id: true } } },
        }),
    ]);

    const lancamentos: Lancamento[] = [];
    let contratado = 0, compromissosAPagar = 0, aReembolsar = 0, adiantadoAComprovar = 0;

    // 1. Fornecedores: cada parcela é um lançamento; só a paga entra no realizado.
    for (const c of contratacoes) {
        contratado += c.valor_contratado;
        for (const p of c.parcelas) {
            const docs = (p as any).anexos.map(docDe);
            const pago = PAGOS.includes(p.status);
            if (!pago) compromissosAPagar += p.valor;
            const lido = valorLido(docs);
            lancamentos.push({
                id: p.id, origem: 'FORNECEDOR',
                referencia: `Parcela ${p.tipo === 'UNICA' ? 'única' : p.tipo.toLowerCase()}`,
                favorecido: nomeFavorecido(c.supplier, c.funcionario),
                categoria: c.finalidade, descricao: c.observacoes,
                valor: cent(p.valor), pago, status: p.status, data: p.data_pagamento || p.data_prevista,
                forma_pagamento: p.forma_pagamento,
                tem_comprovante: Boolean(p.comprovante_url) || docs.some((d: DocumentoLido) => d.tipo === 'COMPROVANTE_PAGAMENTO'),
                tem_nf: docs.some((d: DocumentoLido) => d.tipo === 'DOCUMENTO_FISCAL'),
                documentos: docs, valor_lido: lido,
                divergencia: pago && lido != null && Math.abs(lido - p.valor) > TOLERANCIA ? cent(lido - p.valor) : null,
            });
        }
    }

    // 2. Reembolsos/adiantamentos da atividade: o custo é a despesa comprovada.
    // Despesa que aponta para OUTRA atividade (rateio) não entra aqui.
    for (const r of reembolsos) {
        const docs = r.pagamentos.flatMap((pg: any) => pg.anexos.map(docDe));
        const pagos = r.pagamentos.filter(pg => PAGOS.includes(pg.status));
        const valorPago = cent(pagos.reduce((s, pg) => s + pg.valor, 0));
        const despesas = r.despesas.filter(d => !d.atividade_id || d.atividade_id === atividadeId);
        const totalDespesas = cent(despesas.reduce((s, d) => s + d.valor, 0));
        const adiantamento = r.natureza === 'ADIANTAMENTO';
        // Adiantamento: o dinheiro já saiu; o que ainda não virou despesa comprovada fica "a comprovar".
        if (adiantamento) adiantadoAComprovar += Math.max(0, (r.valor_adiantado ?? valorPago) - totalDespesas);
        // Reembolso: a despesa é custo real, mas a LS ainda deve à pessoa o que não pagou.
        else aReembolsar += Math.max(0, totalDespesas - valorPago);
        const ref = r.codigo || (adiantamento ? 'Adiantamento' : 'Reembolso');
        const quem = nomeFavorecido(r.supplier, r.funcionario, r.favorecido_nome);
        despesas.forEach((d, i) => lancamentos.push({
            id: d.id, origem: 'REEMBOLSO', referencia: `${ref}${adiantamento ? ' · adiantamento' : ''}`,
            favorecido: quem, categoria: d.categoria, descricao: d.descricao,
            valor: cent(d.valor), pago: adiantamento || PAGOS.includes(r.status) || valorPago >= totalDespesas - TOLERANCIA,
            status: r.status, data: d.data, forma_pagamento: r.forma_pagamento,
            tem_comprovante: pagos.some(pg => pg.comprovante_url) || docs.some((x: DocumentoLido) => x.tipo === 'COMPROVANTE_PAGAMENTO'),
            tem_nf: Boolean(d.anexo_url) || docs.some((x: DocumentoLido) => x.tipo === 'DOCUMENTO_FISCAL'),
            // Os comprovantes do depósito valem para o processo inteiro: ficam na primeira despesa.
            documentos: i === 0 ? docs : [], valor_lido: null, divergencia: null,
        }));
        // Processo sem despesa lançada ainda: o que já foi pago aparece como um lançamento só.
        if (!despesas.length && valorPago > 0) {
            lancamentos.push({
                id: r.id, origem: 'REEMBOLSO', referencia: ref, favorecido: quem, categoria: 'OUTROS',
                descricao: r.motivo || (adiantamento ? 'Adiantamento sem prestação de contas' : 'Reembolso sem despesas lançadas'),
                valor: adiantamento ? 0 : valorPago, pago: true, status: r.status, data: r.data_pagamento,
                forma_pagamento: r.forma_pagamento, tem_comprovante: docs.length > 0, tem_nf: false,
                documentos: docs, valor_lido: valorLido(docs), divergencia: null,
            });
        }
    }

    // 3. Rateio do adiantamento de projeto.
    for (const d of despesasRateadas) {
        lancamentos.push({
            id: d.id, origem: 'RATEIO_PROJETO', referencia: `${d.reembolso.codigo || 'Adiantamento de projeto'} · rateio`,
            favorecido: nomeFavorecido(d.supplier, d.funcionario, d.reembolso.favorecido_nome),
            categoria: d.categoria, descricao: d.descricao, valor: cent(d.valor), pago: true, status: 'RATEADO',
            data: d.data, forma_pagamento: null, tem_comprovante: true, tem_nf: Boolean(d.anexo_url),
            documentos: [], valor_lido: null, divergencia: null,
        });
    }

    // 4. Prestação de contas consolidada.
    for (const d of despesasPrestacao) {
        lancamentos.push({
            id: d.id, origem: 'PRESTACAO_CONTAS', referencia: 'Prestação de contas', favorecido: '—',
            categoria: d.categoria, descricao: d.descricao, valor: cent(d.valor), pago: true, status: 'COMPROVADO',
            data: d.data, forma_pagamento: null, tem_comprovante: true, tem_nf: Boolean(d.anexo_url),
            documentos: [], valor_lido: null, divergencia: null,
        });
    }

    // O realizado é o que já virou gasto: parcela paga + toda despesa comprovada.
    const realizados = lancamentos.filter(l => l.origem !== 'FORNECEDOR' || l.pago);
    const realizado = cent(realizados.reduce((s, l) => s + l.valor, 0));
    const agrupar = (chave: (l: Lancamento) => string) => {
        const m = new Map<string, { chave: string; valor: number; quantidade: number }>();
        realizados.forEach(l => {
            const k = chave(l);
            const g = m.get(k) || { chave: k, valor: 0, quantidade: 0 };
            g.valor = cent(g.valor + l.valor); g.quantidade += 1;
            m.set(k, g);
        });
        return [...m.values()].sort((a, b) => b.valor - a.valor);
    };

    const documentos = lancamentos.flatMap(l => l.documentos);
    const pagosFornecedor = lancamentos.filter(l => l.origem === 'FORNECEDOR' && l.pago);
    const receita = atividade.valor_contrato ?? atividade.valor_orcado ?? null;

    return {
        atividade,
        ia_disponivel: iaDisponivel(),
        resumo: {
            realizado,
            pago_fornecedores: cent(pagosFornecedor.reduce((s, l) => s + l.valor, 0)),
            despesas_comprovadas: cent(realizados.filter(l => l.origem !== 'FORNECEDOR').reduce((s, l) => s + l.valor, 0)),
            contratado: cent(contratado),
            compromissos_a_pagar: cent(compromissosAPagar),
            a_reembolsar: cent(aReembolsar),
            adiantado_a_comprovar: cent(adiantadoAComprovar),
            receita,
            margem_realizada: receita != null ? cent(receita - realizado) : null,
        },
        por_categoria: agrupar(l => l.categoria || 'OUTROS'),
        por_favorecido: agrupar(l => l.favorecido),
        por_origem: agrupar(l => l.origem),
        conferencia: {
            pagos_sem_comprovante: pagosFornecedor.filter(l => !l.tem_comprovante).length,
            pagos_sem_nf: pagosFornecedor.filter(l => !l.tem_nf).length,
            divergencias: lancamentos.filter(l => l.divergencia != null).length,
            documentos: documentos.length,
            documentos_lidos: documentos.filter(d => d.leitura?.status === 'LIDO').length,
            documentos_nao_lidos: documentos.filter(d => !d.leitura).length,
            documentos_com_erro: documentos.filter(d => d.leitura && d.leitura.status !== 'LIDO').length,
        },
        lancamentos: lancamentos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))),
    };
}

// ── Totais por atividade (Resultado, controladoria e carteira) ────────────────

export interface CustoTotais { comprometido: number; pago: number; despesas: number }

/**
 * Regra ÚNICA de custo das atividades (04/11/2026) — a mesma da aba Custo real:
 *   - contratações não canceladas: comprometido = contratado; pago = parcelas pagas;
 *   - despesas de reembolso/adiantamento (não cancelados): da própria atividade
 *     (despesa sem destino) ou rateadas para ela; entram como comprometido e pago;
 *   - despesas de prestação de contas destinadas à atividade.
 * Antes, Resultado, controladoria e carteira somavam cada um de um jeito, e os
 * reembolsos lançados direto na atividade ficavam de fora.
 */
export async function custosDasAtividades(ids: string[]): Promise<Map<string, CustoTotais>> {
    const mapa = new Map<string, CustoTotais>(ids.map(id => [id, { comprometido: 0, pago: 0, despesas: 0 }]));
    if (!ids.length) return mapa;
    const [contratacoes, parcelas, despesasReembolso, despesasPrestacao] = await Promise.all([
        prisma.contratacaoFornecedor.findMany({
            where: { atividade_id: { in: ids }, status: { not: 'CANCELADA' } },
            select: { atividade_id: true, valor_contratado: true },
        }),
        prisma.parcelaPagamento.findMany({
            where: { status: { in: PAGOS }, contratacao: { atividade_id: { in: ids }, status: { not: 'CANCELADA' } } },
            select: { valor: true, contratacao: { select: { atividade_id: true } } },
        }),
        prisma.reembolsoDespesa.findMany({
            where: {
                reembolso: { status: { not: 'CANCELADO' } },
                OR: [{ atividade_id: { in: ids } }, { atividade_id: null, reembolso: { atividade_id: { in: ids } } }],
            },
            select: { valor: true, atividade_id: true, reembolso: { select: { atividade_id: true } } },
        }),
        prisma.prestacaoContasDespesa.findMany({
            where: { atividade_id: { in: ids } },
            select: { valor: true, atividade_id: true },
        }),
    ]);
    const somar = (id: string | null | undefined, campo: keyof CustoTotais, v: number) => {
        const t = id ? mapa.get(id) : undefined;
        if (t) t[campo] = cent(t[campo] + v);
    };
    contratacoes.forEach(c => somar(c.atividade_id, 'comprometido', c.valor_contratado));
    parcelas.forEach(p => somar(p.contratacao.atividade_id, 'pago', p.valor));
    [...despesasReembolso.map(d => ({ id: d.atividade_id ?? d.reembolso.atividade_id, valor: d.valor })),
        ...despesasPrestacao.map(d => ({ id: d.atividade_id, valor: d.valor }))]
        .forEach(d => { somar(d.id, 'despesas', d.valor); somar(d.id, 'comprometido', d.valor); somar(d.id, 'pago', d.valor); });
    return mapa;
}

// ── Leitura por IA dos comprovantes e NFs ─────────────────────────────────────

const URL_API = 'https://api.anthropic.com/v1/messages';
const MIMES_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const FERRAMENTA = {
    name: 'registrar_documento',
    description: 'Registra os dados extraídos do documento financeiro.',
    input_schema: {
        type: 'object',
        properties: {
            tipo_documento: { type: 'string', enum: ['COMPROVANTE', 'NOTA_FISCAL', 'RECIBO', 'BOLETO', 'CUPOM', 'OUTRO'], description: 'COMPROVANTE = comprovante de transferência/PIX/TED/pagamento; NOTA_FISCAL = NF-e/NFS-e/DANFE.' },
            valor: { type: ['number', 'null'], description: 'Valor total pago/da nota, em reais (ex.: 1280.5). Em NF, o valor total da nota (líquido se houver retenção destacada como valor a pagar).' },
            data_documento: { type: ['string', 'null'], description: 'Data do pagamento (comprovante) ou de emissão (NF), no formato AAAA-MM-DD.' },
            numero: { type: ['string', 'null'], description: 'Número da NF, ou ID/autenticação da transação no comprovante.' },
            emitente: { type: ['string', 'null'], description: 'NF: razão social do emitente/prestador. Comprovante: nome de quem RECEBEU o pagamento (favorecido/destinatário).' },
            emitente_documento: { type: ['string', 'null'], description: 'CNPJ ou CPF de quem emitiu a NF / recebeu o pagamento, só dígitos.' },
            descricao: { type: ['string', 'null'], description: 'Resumo curto do que foi pago/discriminado (até 120 caracteres).' },
            observacao: { type: ['string', 'null'], description: 'Ressalva: documento ilegível, cortado, valor em dúvida etc. Nulo se estiver tudo claro.' },
        },
        required: ['tipo_documento', 'valor', 'data_documento'],
    },
};

async function lerComIa(buffer: Buffer, mime: string) {
    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) throw new Error('IA_NAO_CONFIGURADA');
    const arquivo = mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } };
    const r = await fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: MODELO_IA,
            max_tokens: 1024,
            system: 'Você é analista financeiro da LS Office (engenharia de telecom). Extraia os dados do documento financeiro anexado '
                + '(comprovante de pagamento, nota fiscal, recibo, boleto ou cupom). Não invente: campo que não estiver legível vai nulo. '
                + 'Responda SEMPRE chamando a ferramenta registrar_documento, uma única vez, sem texto fora dela.',
            tools: [FERRAMENTA],
            tool_choice: { type: 'auto' },
            messages: [{ role: 'user', content: [arquivo, { type: 'text', text: 'Extraia os dados deste documento.' }] }],
        }),
    });
    const corpo: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.error?.message ? `IA: ${corpo.error.message}` : `IA indisponível (HTTP ${r.status})`);
    const tokens = (corpo.usage?.input_tokens || 0) + (corpo.usage?.output_tokens || 0);
    const uso = corpo.content?.find((c: any) => c.type === 'tool_use' && c.name === FERRAMENTA.name);
    if (uso) return { dados: uso.input, tokens };
    const texto = (corpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const json = texto.match(/\{[\s\S]*\}/);
    if (json) { try { return { dados: JSON.parse(json[0]), tokens }; } catch { /* cai no erro */ } }
    throw new Error('A IA não devolveu os dados do documento');
}

const dataOuNula = (v: unknown) => {
    const s = String(v || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};
const textoOuNulo = (v: unknown, max = 200) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };

/** Lê um anexo e grava (ou regrava) a leitura. */
export async function lerAnexoFinanceiro(tenantId: string, attachmentId: string) {
    const { record, buffer } = await loadPaymentAttachment(tenantId, attachmentId);
    const mime = String(record.mime_type || '').toLowerCase();
    const base = { tenant_id: tenantId, attachment_id: record.id, modelo: MODELO_IA, lido_em: new Date() };
    let dados: any;
    if (mime !== 'application/pdf' && !MIMES_IMAGEM.includes(mime)) {
        dados = { ...base, status: 'NAO_SUPORTADO', observacao: `Formato não lido automaticamente (${record.mime_type})` };
    } else if (buffer.length > 20 * 1024 * 1024) {
        dados = { ...base, status: 'NAO_SUPORTADO', observacao: 'Arquivo grande demais para leitura automática (máx. 20 MB)' };
    } else {
        try {
            const { dados: d, tokens } = await lerComIa(buffer, mime);
            const valor = Number(d.valor);
            dados = {
                ...base, status: 'LIDO', tokens,
                tipo_documento: textoOuNulo(d.tipo_documento, 20),
                valor: Number.isFinite(valor) && valor > 0 ? cent(valor) : null,
                data_documento: dataOuNula(d.data_documento),
                numero: textoOuNulo(d.numero, 60),
                emitente: textoOuNulo(d.emitente, 120),
                emitente_documento: textoOuNulo(String(d.emitente_documento || '').replace(/\D/g, ''), 14),
                descricao: textoOuNulo(d.descricao, 160),
                observacao: textoOuNulo(d.observacao, 200),
            };
        } catch (e: any) {
            if (e.message === 'IA_NAO_CONFIGURADA') throw e;
            dados = { ...base, status: 'ERRO', observacao: textoOuNulo(e.message, 200) };
        }
    }
    const { tenant_id: _t, attachment_id: _a, ...atualizacao } = dados;
    return prisma.leituraDocumentoFinanceiro.upsert({
        where: { attachment_id: record.id },
        create: dados,
        update: { ...atualizacao, tipo_documento: dados.tipo_documento ?? null, valor: dados.valor ?? null, data_documento: dados.data_documento ?? null, numero: dados.numero ?? null, emitente: dados.emitente ?? null, emitente_documento: dados.emitente_documento ?? null, descricao: dados.descricao ?? null, tokens: dados.tokens ?? null },
    });
}

/**
 * Lê os comprovantes/NFs da atividade. Sem `forcar`, só os que ainda não foram
 * lidos (ou deram erro). Limite por chamada para não estourar o tempo da requisição.
 */
export async function lerDocumentosDaAtividade(atividadeId: string, tenantId: string, forcar = false, limite = 15) {
    if (!iaDisponivel()) throw Object.assign(new Error('Leitura por IA indisponível: falta ANTHROPIC_API_KEY no servidor'), { status: 503 });
    const consolidado = await custoRealDaAtividade(atividadeId, tenantId);
    const pendentes = consolidado.lancamentos.flatMap(l => l.documentos)
        .filter(d => forcar || !d.leitura || d.leitura.status === 'ERRO');
    const lote = pendentes.slice(0, limite);
    let lidos = 0, erros = 0;
    for (const d of lote) {
        const r = await lerAnexoFinanceiro(tenantId, d.id);
        if (r.status === 'LIDO') lidos++; else erros++;
    }
    return { processados: lote.length, lidos, erros, restantes: Math.max(0, pendentes.length - lote.length) };
}
