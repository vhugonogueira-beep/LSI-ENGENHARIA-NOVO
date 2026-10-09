// Pendências de preenchimento da atividade, separadas pela aba do cockpit onde
// se resolvem. É um diagnóstico calculado na hora — nada é gravado —, para a
// aba poder avisar "faltam 3 itens aqui" sem que cada tela reinvente a regra.

import { resumoSst } from './sst.service';
import { prisma } from '../server';
import { normalizarUf } from '../utils/uf';
import { encontrarMunicipio } from './localidades.service';

export type NivelPendencia = 'ALERTA' | 'AVISO';
export interface Pendencia {
    nivel: NivelPendencia; // ALERTA conta no selo da aba; AVISO só aparece no painel
    mensagem: string;
}
export type PendenciasPorAba = Record<string, Pendencia[]>;

const NAO_SOLICITADO = ['PENDENTE', 'CANCELADO', 'CANCELADA'];
const FINALIZADOS_OU_ANDANDO = ['EM_EXECUCAO', 'CONCLUIDA'];

export interface ComprovantePendente {
    atividade_id: string;
    descricao: string;
    valor: number;
    status: string;
}

/**
 * Pagamentos que já saíram (ou foram pedidos) e ainda não têm comprovante.
 *
 * Parcela de contratação e depósito de reembolso/adiantamento. Vale o
 * comprovante antigo (`comprovante_url`) ou um COMPROVANTE_PAGAMENTO na faixa
 * Documentos — a mesma regra de `tem_comprovante` do Controle de Pagamentos.
 * PENDENTE ainda não foi solicitado; formalização conta sempre, porque o
 * dinheiro já saiu antes de ela existir.
 */
export async function listarComprovantesPendentes(atividadeIds: string[]): Promise<ComprovantePendente[]> {
    if (!atividadeIds.length) return [];
    const [parcelas, reembolsos] = await Promise.all([
        prisma.parcelaPagamento.findMany({
            where: { contratacao: { atividade_id: { in: atividadeIds }, status: { not: 'CANCELADA' } } },
            select: {
                id: true, tipo: true, valor: true, status: true, processo_tipo: true, comprovante_url: true,
                contratacao: {
                    select: {
                        atividade_id: true, finalidade: true,
                        supplier: { select: { nome: true } }, funcionario: { select: { nome: true } },
                    },
                },
            },
        }),
        prisma.reembolso.findMany({
            where: { atividade_id: { in: atividadeIds }, status: { not: 'CANCELADO' } },
            select: {
                id: true, codigo: true, natureza: true, favorecido_nome: true, atividade_id: true,
                status: true, comprovante_url: true, valor_total: true, valor_adiantado: true,
                pagamentos: { select: { id: true, numero: true, valor: true, status: true, comprovante_url: true } },
            },
        }),
    ]);
    const anexos = await prisma.paymentAttachment.findMany({
        where: {
            tipo: 'COMPROVANTE_PAGAMENTO',
            OR: [
                { parcela_id: { in: parcelas.map(p => p.id) } },
                { reembolso_pagamento_id: { in: reembolsos.flatMap(r => r.pagamentos.map(p => p.id)) } },
            ],
        },
        select: { parcela_id: true, reembolso_pagamento_id: true },
    });
    const comAnexo = new Set(anexos.flatMap(a => [a.parcela_id, a.reembolso_pagamento_id]).filter(Boolean) as string[]);

    const saida: ComprovantePendente[] = [];
    for (const p of parcelas) {
        const cobravel = p.processo_tipo === 'PAYMENT_FORMALIZATION' || !NAO_SOLICITADO.includes(p.status);
        if (!cobravel || p.comprovante_url || comAnexo.has(p.id)) continue;
        const favorecido = (p.contratacao.supplier?.nome || p.contratacao.funcionario?.nome || 'favorecido').trim();
        saida.push({
            atividade_id: p.contratacao.atividade_id,
            descricao: `${favorecido} · parcela ${p.tipo.toLowerCase()} (${p.contratacao.finalidade.replace(/_/g, ' ').toLowerCase()})`,
            valor: p.valor, status: p.status,
        });
    }
    for (const r of reembolsos) {
        if (!r.atividade_id) continue;
        const rotulo = `${r.natureza === 'ADIANTAMENTO' ? 'Adiantamento' : 'Reembolso'} ${r.codigo || ''} · ${r.favorecido_nome}`.replace(/\s+/g, ' ').trim();
        // Processo antigo sem depósitos: o próprio cabeçalho faz papel de depósito.
        const registros = r.pagamentos.length
            ? r.pagamentos.map(pg => ({ ...pg, rotulo: `${rotulo} · depósito ${pg.numero}` }))
            : [{
                id: r.id, status: r.status, comprovante_url: r.comprovante_url, rotulo,
                valor: r.natureza === 'ADIANTAMENTO' ? Number(r.valor_adiantado || 0) : r.valor_total,
            }];
        for (const pg of registros) {
            if (NAO_SOLICITADO.includes(pg.status) || pg.comprovante_url || comAnexo.has(pg.id)) continue;
            saida.push({ atividade_id: r.atividade_id, descricao: pg.rotulo, valor: pg.valor, status: pg.status });
        }
    }
    return saida;
}

export async function contarComprovantesPendentes(atividadeIds: string[]): Promise<Map<string, number>> {
    const contagem = new Map<string, number>();
    for (const c of await listarComprovantesPendentes(atividadeIds)) {
        contagem.set(c.atividade_id, (contagem.get(c.atividade_id) || 0) + 1);
    }
    return contagem;
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const alerta = (mensagem: string): Pendencia => ({ nivel: 'ALERTA', mensagem });
const aviso = (mensagem: string): Pendencia => ({ nivel: 'AVISO', mensagem });

/** Pendências de uma atividade, por id de aba do cockpit (ver buildTabs). */
export async function calcularPendenciasAtividade(atividadeId: string): Promise<PendenciasPorAba | null> {
    const a = await prisma.atividade.findUnique({ where: { id: atividadeId } });
    if (!a) return null;

    const [orcamentos, execucao, rfis, pos, cronograma, apcs, documentos, contratacoes, comprovantes] = await Promise.all([
        prisma.budget.findMany({
            where: { atividade_id: a.id },
            orderBy: { created_at: 'desc' },
            select: { id: true, status: true, _count: { select: { items: true } } },
        }),
        prisma.registroExecucao.findFirst({ where: { atividade_id: a.id } }),
        prisma.rFI.count({ where: { atividade_id: a.id } }),
        prisma.purchaseOrder.findMany({ where: { atividade_id: a.id }, select: { numero: true, pdf_url: true, status: true } }),
        prisma.cronogramaItem.count({ where: { atividade_id: a.id } }),
        prisma.aPC.findMany({ where: { atividade_id: a.id }, select: { status: true } }),
        prisma.documentoAtividade.findMany({
            where: { atividade_id: a.id, aplicavel: true, requisito: { obrigatorio: true } },
            select: { status: true, justificativa_na: true },
        }),
        prisma.contratacaoFornecedor.count({ where: { atividade_id: a.id, status: { not: 'CANCELADA' } } }),
        listarComprovantesPendentes([a.id]),
    ]);
    const aprovacoes = await prisma.aprovacaoPagamento.findMany({
        where: { atividade_id: a.id, status: { in: ['PENDENTE', 'RECUSADA'] } },
        orderBy: { created_at: 'desc' },
    });

    const implantacao = a.modelo_operacao === 'MEDIANTE_APROVACAO';
    const andando = FINALIZADOS_OU_ANDANDO.includes(a.status_operacional);
    const concluida = a.status_operacional === 'CONCLUIDA';
    const p: PendenciasPorAba = {
        identificacao: [], comercial: [], 'cotacao-ls': [], planejamento: [], documentacao: [],
        execucao: [], fornecedores: [], faturamento: [], resultado: [],
    };

    // ── Identificação: campos que outras telas e e-mails consomem
    const uf = normalizarUf(a.estado);
    const faltando: [unknown, string][] = [
        [a.id_site_sharing, 'Site ID Sharing'],
        [a.id_site_operadora, 'Site ID Operadora'],
        [a.operadora, 'Operadora'],
        [uf, 'UF'],
        [a.municipio, 'Município'],
        [a.contratante_id, 'Cliente / contratante'],
        [a.responsavel, 'Responsável'],
        [a.gestor, 'Gestor (vai na planilha de faturamento)'],
        [a.data_inicio_planejada, 'Data de início prevista'],
        [a.data_fim_planejada, 'Data de término prevista'],
        [a.diretorio_url, 'Diretório da atividade no servidor (sai nos e-mails financeiros)'],
    ];
    if (a.tipo_demanda === 'OPERACAO') faltando.push([a.subtipo_demanda, 'Subtipo da operação']);
    if (implantacao && a.sharing === 'HIGHLINE') faltando.push([a.tipo_site_highline, 'Tipo de site aceito pela PV Highline (BTS, Roof Top, Collo ou Reforço)']);
    for (const [valor, rotulo] of faltando) if (!valor) p.identificacao.push(alerta(`Falta preencher: ${rotulo}`));
    if (uf && a.municipio && !encontrarMunicipio(uf, a.municipio)) {
        p.identificacao.push(aviso(`Município "${a.municipio}" não consta na base IBGE de ${uf}`));
    }

    // ── Orçamento (comercial) e custo (itens do mesmo orçamento)
    const orcamento = orcamentos[0];
    if (!orcamento) {
        p.comercial.push(alerta('Nenhum orçamento incluído na atividade'));
        p['cotacao-ls'].push(alerta('Sem orçamento — crie o orçamento para lançar os itens de custo'));
    } else {
        if (orcamento.status === 'RASCUNHO') p.comercial.push(aviso('Orçamento ainda em rascunho — não foi enviado ao cliente'));
        if (orcamento.status === 'REPROVADO') p.comercial.push(alerta('Orçamento reprovado — precisa de revisão'));
        if (!orcamento._count.items) p['cotacao-ls'].push(alerta('Orçamento sem nenhum item de custo lançado'));
    }

    // ── Planejamento e documentação (só Implantação completa)
    if (implantacao) {
        if (!cronograma) p.planejamento.push(alerta('Cronograma não montado'));
        if (!apcs.length) p.planejamento.push(alerta('APC não registrado'));
        else if (!apcs.some(x => x.status === 'APC_LIBERADO')) p.planejamento.push(aviso('APC ainda não liberado'));
        if (!documentos.length) p.documentacao.push(alerta('Matriz documental não gerada'));
        const ok = documentos.filter(d => d.status === 'APROVADO' || (d.status === 'NAO_APLICAVEL' && d.justificativa_na)).length;
        const correcao = documentos.filter(d => ['REPROVADO', 'NECESSITA_CORRECAO', 'VENCIDO'].includes(d.status)).length;
        if (documentos.length && ok < documentos.length) p.documentacao.push(alerta(`${documentos.length - ok} de ${documentos.length} documento(s) obrigatório(s) pendente(s)`));
        if (correcao) p.documentacao.push(alerta(`${correcao} documento(s) precisando de correção`));
    }

    // ── Execução e relatório (operação); na implantação o RFI vive no Planejamento
    const abaExecucao = implantacao ? 'planejamento' : 'execucao';
    const nomeRelatorio = implantacao ? 'RFI' : 'Relatório fotográfico';
    if (andando && !execucao) p[abaExecucao].push(alerta('Execução em andamento sem registro de avanço'));
    if (execucao && andando && !execucao.data_inicio) p[abaExecucao].push(alerta('Data de início da execução não informada'));
    const executada = concluida || (execucao?.avanco_percentual ?? 0) >= 100;
    if (executada && !execucao?.data_real_conclusao) p[abaExecucao].push(alerta('Data real de conclusão não informada'));
    if (executada && !rfis) p[abaExecucao].push(alerta(`${nomeRelatorio} não enviado`));

    // ── Pagamentos
    if (comprovantes.length) {
        const total = comprovantes.reduce((s, c) => s + c.valor, 0);
        p.fornecedores.push(alerta(`${comprovantes.length} pagamento(s) solicitado(s) sem comprovante anexado — ${moeda(total)}`));
        for (const c of comprovantes) p.fornecedores.push(aviso(`${c.descricao} — ${moeda(c.valor)} (${c.status.toLowerCase().replace(/_/g, ' ')})`));
    }
    if (andando && !contratacoes) p.fornecedores.push(aviso('Nenhum fornecedor ou prestador contratado nesta atividade'));
    const aguardando = aprovacoes.filter(x => x.status === 'PENDENTE');
    if (aguardando.length) {
        const total = aguardando.reduce((s, x) => s + x.valor, 0);
        p.fornecedores.push(alerta(`${aguardando.length} pagamento(s) aguardando aprovação do administrador — ${moeda(total)}`));
    }
    // Recusa só importa enquanto ninguém pediu de novo o mesmo pagamento.
    const reabertos = new Set(aguardando.map(x => x.registro_id));
    for (const r of aprovacoes.filter(x => x.status === 'RECUSADA' && !reabertos.has(x.registro_id)).slice(0, 5)) {
        const motivo = r.motivo_decisao ? ` · motivo: ${r.motivo_decisao}` : '';
        p.fornecedores.push(aviso(`Recusado: ${r.descricao} — ${moeda(r.valor)}${motivo}`));
    }

    // ── PO & Faturamento
    if (!pos.length) {
        p.faturamento.push(implantacao || concluida ? alerta('Nenhuma PO anexada') : aviso('Nenhuma PO anexada'));
    } else {
        if (pos.some(po => !po.numero)) p.faturamento.push(alerta('PO sem número'));
        if (pos.some(po => !po.pdf_url)) p.faturamento.push(aviso('PO sem arquivo PDF'));
    }
    if (concluida && a.status_faturamento === 'NAO_INICIADO') p.faturamento.push(alerta('Atividade concluída e faturamento não iniciado'));

    // ── Resultado: sem receita e custo previsto a margem não fecha
    if (!a.valor_contrato) p.resultado.push(alerta('Sem valor de contrato (receita) — a margem não pode ser calculada'));
    if (!a.valor_orcado) p.resultado.push(alerta('Sem custo orçado — a margem projetada fica incompleta'));

    // ── SST dos prestadores contratados: só aviso, nunca bloqueia (09/10/2026).
    const contratados = await prisma.contratacaoFornecedor.findMany({
        where: { atividade_id: a.id, status: { not: 'CANCELADA' }, supplier_id: { not: null } },
        select: { supplier_id: true, supplier: { select: { nome: true } } },
    });
    if (contratados.length) {
        const ids = [...new Set(contratados.map(c => c.supplier_id!))];
        const sst = await resumoSst(a.tenant_id, ids);
        for (const id of ids) {
            const r = sst[id];
            if (!r || r.situacao === 'EM_DIA' || r.situacao === 'NAO_SE_APLICA') continue;
            const nome = contratados.find(c => c.supplier_id === id)?.supplier?.nome || 'Prestador';
            const lista = r.itens.slice(0, 4).map(i => `${i.documento}${i.pessoa !== nome ? ` (${i.pessoa})` : ''} ${i.motivo === 'FALTANDO' ? 'não enviado' : i.motivo === 'VENCIDO' ? 'vencido' : `vence em ${i.dias} dia(s)`}`).join('; ');
            p.fornecedores.push(aviso(`Segurança do trabalho — ${nome}: ${lista}${r.itens.length > 4 ? `; e mais ${r.itens.length - 4}` : ''}`));
        }
    }

    return p;
}
