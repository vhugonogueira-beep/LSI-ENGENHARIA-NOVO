// Gerador do e-mail corporativo da LS Office para as três modalidades
// financeiras: programação de pagamento, reembolso e compra de material.
//
// O HTML mora em templates/email-corporativo-ls.html — TABLE + CSS inline, para
// renderizar no Outlook Desktop. Aqui só entram os dados.
//
// Regra que atravessa tudo: campo sem valor não aparece. Um e-mail financeiro
// com "Contrato: —" espalhado pede conferência que não existe.

import fs from 'fs';
import path from 'path';

const TEMPLATE = path.resolve(process.cwd(), 'src', 'backend', 'templates', 'email-corporativo-ls.html');

export type TipoSolicitacao = 'PROGRAMACAO_PAGAMENTO' | 'REEMBOLSO' | 'ADIANTAMENTO' | 'COMPRA_MATERIAL' | 'FORMALIZACAO_CARTAO';

const ROTULO_TIPO: Record<TipoSolicitacao, string> = {
    PROGRAMACAO_PAGAMENTO: 'Programação de Pagamento',
    REEMBOLSO: 'Reembolso',
    ADIANTAMENTO: 'Adiantamento',
    COMPRA_MATERIAL: 'Compra de Material',
    FORMALIZACAO_CARTAO: 'Formalização de Compra no Cartão',
};

const ROTULO_CATEGORIA: Record<string, string> = {
    ALIMENTACAO: 'Alimentação', HOSPEDAGEM: 'Hospedagem', COMBUSTIVEL: 'Combustível',
    PEDAGIO: 'Pedágio', TRANSPORTE: 'Transporte', MATERIAL: 'Material',
    SERVICO: 'Serviço', FRETE: 'Frete', OUTROS: 'Outros',
};

export interface ItemMaterial {
    descricao: string;
    quantidade?: number | null;
    unidade?: string | null;
    valor_unitario?: number | null;
    valor_total?: number | null;
}

export interface ItemDespesa {
    data?: Date | string | null;
    descricao: string;
    categoria?: string | null;
    valor: number;
}

export interface DadosEmail {
    tipo: TipoSolicitacao;

    // Identidade visual
    logo_url?: string | null;

    // Demanda
    site?: string | null;
    nome_site?: string | null;
    cliente?: string | null;
    sharing?: string | null;
    area?: string | null;
    responsavel_solicitacao?: string | null;
    fornecedor?: string | null;
    cpf_cnpj?: string | null;
    descricao?: string | null;
    centro_custo?: string | null;
    po?: string | null;
    contrato?: string | null;
    nome_colaborador?: string | null;

    // Financeiro
    valor_total?: number | null;
    valor_pago?: number | null;
    valor_pagamento?: number | null;
    saldo?: number | null;
    condicao_pagamento?: string | null;
    condicao_liberacao_saldo?: string | null;
    data_pagamento?: Date | string | null;
    competencia?: string | null;

    // Compra
    itens_materiais?: ItemMaterial[];
    frete?: number | null;
    outras_despesas?: number | null;
    local_entrega?: string | null;
    prazo_entrega?: string | null;
    responsavel_recebimento?: string | null;

    // Reembolso
    itens_reembolso?: ItemDespesa[];
    data_despesa?: Date | string | null;
    motivo_reembolso?: string | null;
    cpf_colaborador?: string | null;

    // Pagamento
    favorecido?: string | null;
    razao_social?: string | null;
    cpf_cnpj_pagamento?: string | null;
    banco?: string | null;
    agencia?: string | null;
    conta?: string | null;
    tipo_conta?: string | null;
    pix?: string | null;
    tipo_pix?: string | null;
    /** PIX | TED | CARTAO_CREDITO | BOLETO | DINHEIRO */
    forma_pagamento?: string | null;
    /** Cartao corporativo usado, quando a forma for cartao. */
    cartao?: { bandeira: string; final: string; apelido?: string | null } | null;

    // Documentação
    orcamento?: string | null;
    proposta?: string | null;
    nota_fiscal?: string | null;
    pedido?: string | null;
    diretorio?: string | null;
    link_diretorio?: string | null;
    anexos?: string[];

    observacoes?: string | null;

    // Assinatura
    nome_solicitante?: string | null;
    cargo_solicitante?: string | null;
    email_solicitante?: string | null;
    telefone_solicitante?: string | null;

    referencia?: string | null;   // rodapé de rastreabilidade
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const escapar = (v: any): string =>
    String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const moeda = (v: number | null | undefined): string =>
    v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const data = (v: Date | string | null | undefined): string => {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const temValor = (v: any): boolean =>
    v !== null && v !== undefined && String(v).trim() !== '' && !(typeof v === 'number' && Number.isNaN(v));

/** Linha rótulo/valor da tabela cinza. Só é gerada quando há conteúdo. */
/** Igual a `linha`, mas sai mesmo sem valor: deixa o campo em branco para preencher. */
function linhaEmBranco(rotulo: string, valor: any): string {
    const conteudo = temValor(valor) ? escapar(valor) : '&nbsp;';
    return `
              <tr>
                <td width="200" valign="top" style="padding:9px 14px;border-bottom:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.4px;text-transform:uppercase;color:#607080;">${escapar(rotulo)}</td>
                <td valign="top" style="padding:9px 14px;border-bottom:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#2B3A4A;">${conteudo}</td>
              </tr>`;
}

function linha(rotulo: string, valor: any, destaque = false): string {
    if (!temValor(valor)) return '';
    const cor = destaque ? '#0B2342' : '#2B3A4A';
    const peso = destaque ? 'bold' : 'normal';
    return `
              <tr>
                <td width="200" valign="top" style="padding:9px 14px;border-bottom:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.4px;text-transform:uppercase;color:#607080;">${escapar(rotulo)}</td>
                <td valign="top" style="padding:9px 14px;border-bottom:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${cor};font-weight:${peso};">${escapar(valor)}</td>
              </tr>`;
}

/** Remove a última borda para a tabela não terminar com um traço solto. */
function fecharTabela(html: string): string {
    const i = html.lastIndexOf('border-bottom:1px solid #E9EEF3;');
    if (i < 0) return html;
    const j = html.lastIndexOf('border-bottom:1px solid #E9EEF3;', i - 1);
    return html.slice(0, j >= 0 ? j : i).concat(
        html.slice(j >= 0 ? j : i).split('border-bottom:1px solid #E9EEF3;').join(''),
    );
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

function introducao(d: DadosEmail): string {
    const site = escapar(d.site || d.nome_site || 'o site');
    if (d.tipo === 'REEMBOLSO') {
        return `Bom dia!<br><br>Favor realizar o reembolso referente às despesas realizadas por <strong style="color:#0B2342;">${escapar(d.nome_colaborador || d.favorecido || d.fornecedor || '')}</strong>, para atendimento ao <strong style="color:#0B2342;">${site}</strong>, conforme informações abaixo.`;
    }
    if (d.tipo === 'ADIANTAMENTO') {
        return `Bom dia!<br><br>Favor realizar o adiantamento para <strong style="color:#0B2342;">${escapar(d.nome_colaborador || d.favorecido || '')}</strong>, referente ao atendimento do <strong style="color:#0B2342;">${site}</strong>, conforme informações abaixo.`;
    }
    if (d.tipo === 'FORMALIZACAO_CARTAO') {
        return `Bom dia!<br><br>Formalizamos abaixo a compra já realizada no cartão corporativo para atendimento ao <strong style="color:#0B2342;">${site}</strong>. Este registro não solicita nova transferência ao fornecedor.`;
    }
    if (d.tipo === 'COMPRA_MATERIAL') {
        return `Bom dia!<br><br>Favor prosseguir com a compra dos materiais relacionados abaixo, necessários para atendimento ao <strong style="color:#0B2342;">${site}</strong>, conforme informações apresentadas.`;
    }
    return `Bom dia!<br><br>Favor realizar a programação de pagamento referente a <strong style="color:#0B2342;">${escapar(d.descricao || '')}</strong>, para atendimento ao <strong style="color:#0B2342;">${site}</strong>, conforme informações abaixo.`;
}

function itensMateriais(itens: ItemMaterial[]): string {
    return itens.map((it, i) => {
        const total = it.valor_total ?? ((it.quantidade || 0) * (it.valor_unitario || 0));
        const fundo = i % 2 === 0 ? '#FFFFFF' : '#F7F9FA';
        return `
              <tr style="background-color:${fundo};">
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#607080;">${String(i + 1).padStart(2, '0')}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#2B3A4A;">${escapar(it.descricao)}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#2B3A4A;">${it.quantidade ?? ''}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#607080;">${escapar(it.unidade || '')}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#2B3A4A;">${moeda(it.valor_unitario)}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:bold;color:#0B2342;">${moeda(total)}</td>
              </tr>`;
    }).join('');
}

function totalLinha(rotulo: string, valor: number | null | undefined, destaque = false): string {
    if (!temValor(valor)) return '';
    const tam = destaque ? '15px' : '12.5px';
    const cor = destaque ? '#0B2342' : '#607080';
    return `
              <tr>
                <td align="right" style="padding:${destaque ? '9px' : '4px'} 10px;font-family:Arial,Helvetica,sans-serif;font-size:${tam};font-weight:bold;color:${cor};text-transform:uppercase;letter-spacing:0.4px;">${escapar(rotulo)}</td>
                <td align="right" width="140" style="padding:${destaque ? '9px' : '4px'} 10px;font-family:Arial,Helvetica,sans-serif;font-size:${tam};font-weight:bold;color:${destaque ? '#0B2342' : '#2B3A4A'};${destaque ? 'border-top:2px solid #123B6D;' : ''}">${moeda(valor)}</td>
              </tr>`;
}

function itensReembolso(itens: ItemDespesa[]): string {
    const linhas = itens.map((it, i) => {
        const fundo = i % 2 === 0 ? '#FFFFFF' : '#F7F9FA';
        return `
              <tr style="background-color:${fundo};">
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#607080;">${escapar(data(it.data))}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#2B3A4A;">${escapar(it.descricao)}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#607080;">${escapar(ROTULO_CATEGORIA[String(it.categoria || 'OUTROS').toUpperCase()] || it.categoria || '')}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #E9EEF3;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:bold;color:#0B2342;">${moeda(it.valor)}</td>
              </tr>`;
    }).join('');

    const total = itens.reduce((s, i) => s + (i.valor || 0), 0);
    return linhas + `
              <tr style="background-color:#EEF3F9;">
                <td colspan="3" align="right" style="padding:11px 10px;border-top:2px solid #123B6D;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#123B6D;">Total do reembolso</td>
                <td align="right" style="padding:11px 10px;border-top:2px solid #123B6D;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#0B2342;">${moeda(total)}</td>
              </tr>`;
}

function anexos(lista: string[]): string {
    return lista.map(a => `
              <tr>
                <td width="20" valign="top" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#123B6D;">&#10003;</td>
                <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#2B3A4A;">${escapar(a)}</td>
              </tr>`).join('');
}

/** Remove os blocos <!--#SE:X--> ... <!--#FIM:X--> cuja condição é falsa. */
function aplicarCondicionais(html: string, condicoes: Record<string, boolean>): string {
    let saida = html;
    for (const [nome, ativo] of Object.entries(condicoes)) {
        const bloco = new RegExp(`<!--#SE:${nome}-->[\\s\\S]*?<!--#FIM:${nome}-->`, 'g');
        saida = ativo
            ? saida.replace(new RegExp(`<!--#(SE|FIM):${nome}-->`, 'g'), '')
            : saida.replace(bloco, '');
    }
    // Qualquer marcador remanescente sai, para não vazar comentário no e-mail.
    return saida.replace(/<!--#(SE|FIM):[A-Z_]+-->/g, '');
}

// ─── Assunto ─────────────────────────────────────────────────────────────────

export function montarAssunto(d: DadosEmail): string {
    const partes = (...v: (string | null | undefined)[]) => v.filter(x => temValor(x)).map(x => String(x).trim()).join(' | ');
    const resumo = (d.descricao || '').trim().slice(0, 70);
    // Area de origem no assunto: o financeiro recebe pagamento de varias frentes
    // e precisa saber de qual esta falando antes de abrir.
    const origem = 'OPERAÇÕES';
    if (d.tipo === 'REEMBOLSO') {
        return `[LS OFFICE] REEMBOLSO · ${origem} | ${partes(d.nome_colaborador || d.favorecido, d.site, d.sharing)}`;
    }
    if (d.tipo === 'ADIANTAMENTO') {
        return `[LS OFFICE] ADIANTAMENTO · ${origem} | ${partes(d.nome_colaborador || d.favorecido, d.site, d.sharing)}`;
    }
    if (d.tipo === 'FORMALIZACAO_CARTAO') {
        return `[LS OFFICE] FORMALIZAÇÃO DE COMPRA NO CARTÃO · ${origem} | ${partes(resumo, d.favorecido || d.fornecedor, d.site, d.sharing)}`;
    }
    // O favorecido entra no assunto: e por ele que o financeiro identifica o
    // pagamento na caixa de entrada, mais do que pelo site.
    if (d.tipo === 'COMPRA_MATERIAL') {
        return `[LS OFFICE] COMPRA DE MATERIAL · ${origem} | ${partes(resumo, d.favorecido || d.fornecedor, d.site, d.sharing)}`;
    }
    return `[LS OFFICE] PROGRAMAÇÃO DE PAGAMENTO · ${origem} | ${partes(resumo, d.favorecido || d.fornecedor, d.site, d.sharing)}`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function gerarEmailCorporativo(d: DadosEmail): { assunto: string; html: string } {
    let html = fs.readFileSync(TEMPLATE, 'utf8');

    const materiais = d.itens_materiais || [];
    const despesas = d.itens_reembolso || [];
    const listaAnexos = (d.anexos || []).filter(a => temValor(a));

    // Compra: o total sai dos itens quando não vier pronto.
    const subtotalMateriais = materiais.reduce(
        (s, i) => s + (i.valor_total ?? ((i.quantidade || 0) * (i.valor_unitario || 0))), 0);
    const totalReembolso = despesas.reduce((s, i) => s + (i.valor || 0), 0);

    const valorTotal = d.tipo === 'COMPRA_MATERIAL'
        ? (d.valor_total ?? (subtotalMateriais + (d.frete || 0) + (d.outras_despesas || 0)))
        : d.tipo === 'REEMBOLSO' ? (d.valor_total ?? totalReembolso) : d.valor_total;

    const valorPagamento = d.valor_pagamento ?? valorTotal ?? null;
    const saldo = d.saldo ?? (temValor(valorTotal) && temValor(valorPagamento)
        ? Math.round(((valorTotal as number) - (d.valor_pago || 0) - (valorPagamento as number)) * 100) / 100
        : null);

    const identificacao = [
        linha('Site / Projeto', d.site, true),
        linha('Nome do site', d.nome_site),
        linha('Operadora', d.cliente),
        linha('Sharing / Contratante', d.sharing),
        // "Área responsável" saiu: a resposta e sempre Engenharia, entao o campo
        // nao informava nada. O que interessa ali e o produto/serviço pago.
        linha('Produto / Serviço', d.area),
        linha('Responsável pela solicitação', d.responsavel_solicitacao),
        linha(['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? 'Colaborador / Favorecido' : 'Fornecedor / Prestador',
            ['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? (d.nome_colaborador || d.fornecedor) : d.fornecedor),
        linha('CPF / CNPJ', ['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? (d.cpf_colaborador || d.cpf_cnpj) : d.cpf_cnpj),
        linha('Descrição', d.descricao),
        linha('Data da despesa', data(d.data_despesa)),
        linha('Motivo', d.motivo_reembolso),
        linha('Centro de custo', d.centro_custo),
        linha('PO / Pedido', d.po),
        linha('Contrato', d.contrato),
    ].join('');

    const financeiras = [
        linha('Valor total contratado', moeda(valorTotal)),
        linha('Valor já pago', moeda(d.valor_pago)),
        linha('Saldo remanescente', moeda(saldo)),
        linha('Condição de pagamento', d.condicao_pagamento),
        linha('Data prevista para pagamento', data(d.data_pagamento)),
        linha('Competência', d.competencia),
    ].join('');

    const ROTULO_FORMA: Record<string, string> = {
        PIX: 'PIX', TED: 'Transferência (TED/DOC)', CARTAO_CREDITO: 'Cartão de crédito corporativo',
        BOLETO: 'Boleto', DINHEIRO: 'Dinheiro',
    };
    const noCartao = d.forma_pagamento === 'CARTAO_CREDITO';

    const bancarias = [
        linha('Forma de pagamento', d.forma_pagamento ? (ROTULO_FORMA[d.forma_pagamento] || d.forma_pagamento) : null, true),
        // No cartao a compra sai pelo cartao da LS; conta do fornecedor nao entra.
        noCartao ? linha('Cartão utilizado', d.cartao
            ? `${d.cartao.bandeira} •••• ${d.cartao.final}${d.cartao.apelido ? ` — ${d.cartao.apelido}` : ''}`
            : 'A definir pelo financeiro', true) : '',
        linha('Favorecido', d.favorecido, true),
        linha('Razão social', d.razao_social),
        linha('CPF / CNPJ', d.cpf_cnpj_pagamento),
        // Em negrito porque sao os campos que o financeiro copia para o banco.
        noCartao ? '' : linha('Banco', d.banco, true),
        noCartao ? '' : linha('Agência', d.agencia, true),
        noCartao ? '' : linha('Conta', d.conta, true),
        linha('Tipo da conta', d.tipo_conta),
    ].join('');

    const documentacao = [
        linha('Orçamento', d.orcamento),
        linha('Proposta', d.proposta),
        linha('Nota fiscal', d.nota_fiscal),
        linha('Pedido', d.pedido),
        linha('PO', d.po),
        linha('Diretório LS Office', d.diretorio),
        // A linha do link aparece SEMPRE na programacao de pagamento, mesmo vazia:
        // quem envia preenche no proprio Outlook antes de disparar.
        // Na programacao de pagamento a linha existe mesmo vazia — e o espaco em
      // branco que quem envia preenche no Outlook.
        ['PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO'].includes(d.tipo)
            ? linhaEmBranco('Caminho', d.link_diretorio)
            : linha('Link do Diretório no Servidor', d.link_diretorio),
    ].join('');

    const entrega = [
        linha('Local de entrega', d.local_entrega),
        linha('Prazo de entrega', d.prazo_entrega),
        linha('Responsável pelo recebimento', d.responsavel_recebimento),
    ].join('');

    const totaisMateriais = [
        totalLinha('Subtotal', subtotalMateriais || null),
        totalLinha('Frete', d.frete),
        totalLinha('Outras despesas', d.outras_despesas),
        totalLinha('Valor total', valorTotal, true),
    ].join('');

    const contato = [d.email_solicitante, d.telefone_solicitante].filter(temValor).join(' &bull; ');

    const operacional = d.tipo === 'COMPRA_MATERIAL'
        ? 'Favor prosseguir com a compra conforme as informações acima e registrar a despesa no respectivo site/projeto e centro de custo. Após o recebimento, favor anexar a nota fiscal ao processo/diretório financeiro.'
        : d.tipo === 'FORMALIZACAO_CARTAO'
            ? 'Favor conferir os documentos da compra, vincular o lançamento à fatura do cartão e ao respectivo site/projeto e centro de custo. A quitação da fatura é o evento de saída financeira; esta formalização não deve ser paga novamente ao fornecedor.'
            : 'Favor realizar a programação conforme as informações acima e registrar a despesa no respectivo site/projeto e centro de custo. Após a realização do pagamento, favor anexar o comprovante ao respectivo processo/diretório financeiro.';

    const condicoes = {
        FINANCEIRO: temValor(valorPagamento),
        PARCIAL: temValor(saldo) && (saldo as number) > 0,
        CONDICAO_SALDO: temValor(d.condicao_liberacao_saldo),
        MATERIAIS: d.tipo === 'COMPRA_MATERIAL' && materiais.length > 0,
        ENTREGA: d.tipo === 'COMPRA_MATERIAL' && entrega.trim() !== '',
        REEMBOLSO: d.tipo === 'REEMBOLSO' && despesas.length > 0,
        BANCARIOS: bancarias.trim() !== '' || temValor(d.pix),
        PIX: temValor(d.pix) && d.forma_pagamento !== 'CARTAO_CREDITO',
        DOCUMENTACAO: documentacao.trim() !== '' || ['PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO'].includes(d.tipo),
        ANEXOS: listaAnexos.length > 0,
        OBSERVACOES: temValor(d.observacoes),
        CONTATO_SOLICITANTE: temValor(contato),
    };

    const valores: Record<string, string> = {
        LOGO_LS_OFFICE: d.logo_url || '',
        TIPO_SOLICITACAO_FORMATADO: ROTULO_TIPO[d.tipo],
        TEXTO_INTRODUCAO: introducao(d),
        LINHAS_IDENTIFICACAO: fecharTabela(identificacao),
        LINHAS_FINANCEIRAS: fecharTabela(financeiras),
        ROTULO_VALOR_DESTAQUE: d.tipo === 'REEMBOLSO' ? 'Valor deste reembolso'
            : d.tipo === 'ADIANTAMENTO' ? 'Valor deste adiantamento'
                : ['COMPRA_MATERIAL', 'FORMALIZACAO_CARTAO'].includes(d.tipo) ? 'Valor desta compra' : 'Valor desta programação',
        VALOR_PAGAMENTO: moeda(valorPagamento),
        SALDO: moeda(saldo),
        CONDICAO_LIBERACAO_SALDO: escapar(d.condicao_liberacao_saldo),
        ITENS_MATERIAIS: itensMateriais(materiais),
        TOTAIS_MATERIAIS: totaisMateriais,
        LINHAS_ENTREGA: fecharTabela(entrega),
        ITENS_REEMBOLSO: itensReembolso(despesas),
        LINHAS_BANCARIAS: fecharTabela(bancarias),
        PIX: escapar(d.pix),
        TIPO_PIX: d.tipo_pix ? `(${escapar(d.tipo_pix)})` : '',
        LINHAS_DOCUMENTACAO: fecharTabela(documentacao),
        LISTA_ANEXOS: anexos(listaAnexos),
        OBSERVACOES: escapar(d.observacoes).replace(/\n/g, '<br>'),
        TEXTO_OPERACIONAL: operacional,
        // Assinatura institucional. Quem envia acrescenta a propria assinatura no
        // cliente de e-mail — o sistema nao assina por ninguem.
        NOME_SOLICITANTE: escapar(d.nome_solicitante || 'LS Office'),
        CARGO_SOLICITANTE: escapar(d.cargo_solicitante || 'Engenharia'),
        CONTATO_SOLICITANTE: contato,
        RODAPE_REFERENCIA: escapar(d.referencia || ''),
    };

    html = aplicarCondicionais(html, condicoes);
    for (const [chave, valor] of Object.entries(valores)) {
        html = html.split(`{{${chave}}}`).join(valor);
    }
    // Variável não prevista não pode vazar como texto no e-mail.
    html = html.replace(/\{\{[A-Z_]+\}\}/g, '');

    return { assunto: montarAssunto(d), html };
}

/** O template cru, com as variáveis, para quem quiser usar fora do sistema. */
export function lerTemplateCru(): string {
    return fs.readFileSync(TEMPLATE, 'utf8');
}
