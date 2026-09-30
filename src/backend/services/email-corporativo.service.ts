// Gerador do e-mail corporativo da LS Office para as seis modalidades
// financeiras: programação e formalização de pagamento, formalização de compra
// no cartão, compra de material, reembolso e adiantamento.
//
// O HTML mora em templates/email-corporativo-ls.html — TABLE + CSS inline, para
// renderizar no Outlook Desktop (motor do Word): sem JavaScript, sem CSS
// externo, sem variáveis CSS, sem flex nem grid. Aqui só entram os dados.
//
// Regra que atravessa tudo: campo sem valor não aparece. Um e-mail financeiro
// com "Contrato: —" espalhado pede conferência que não existe.
//
// POR QUE ESTA DOCUMENTAÇÃO ESTÁ AQUI E NÃO NO .html
// Comentário HTML não aninha: o primeiro `-->` encerra o comentário inteiro e
// todo o resto vira texto visível no corpo do e-mail. Já aconteceu — bastou
// citar por extenso a sintaxe dos marcadores dentro do bloco de documentação
// para a paleta e as notas internas saírem impressas para o financeiro.
// Prosa sobre o template mora neste arquivo, onde o comentário é de TypeScript
// e não pode vazar. No .html ficam apenas os marcadores funcionais, e
// `removerComentariosNaoFuncionais()` apaga qualquer outro antes do envio.
//
// MARCADORES FUNCIONAIS DO TEMPLATE (os únicos que sobrevivem ao envio)
//   · blocos condicionais de linha, processados por `aplicarCondicionais()`,
//     no formato SE:NOME e FIM:NOME — o bloco sai inteiro quando a condição
//     é falsa;
//   · ASSINATURA e FOOTER, usados por email-signature.service.ts: quando o
//     usuário tem assinatura pessoal, o compositor troca o bloco institucional
//     entre os dois pela assinatura da pessoa. Sem os dois marcadores, as duas
//     assinaturas apareceriam juntas;
//   · comentários condicionais do Outlook (`[if mso]`), que montam a tabela
//     fantasma do par favorecido/prazo. Sem eles o Outlook não empilha.
//
// ORDEM DE LEITURA: valor → chave PIX → demanda → condições. Quem recebe tem
// uma tarefa só, pagar, e os dois dados que ela exige são quanto e para qual
// chave. O resto é conferência e vem depois.
//
// PALETA (única fonte; não introduzir tons fora desta lista)
//   marinho #08213F · azul de ação #1F6FE0 · risco #E2231A
//   fundo da página #EDF1F6 · superfície #FFFFFF · painel claro #EDF4FD
//   borda de linha #EEF2F7 · rótulo #8B99AB · texto #46566B
//   atenção #C08A12 sobre #FDF6E7
// A lista completa, incluindo os tons do cabeçalho marinho, está em
// validar-acabamento-email.ts, que reprova qualquer cor fora dela.

import fs from 'fs';
import path from 'path';
import { EMBLEMA_LS_TRANSPARENTE } from '../assets/marca-ls';

const TEMPLATE = path.resolve(process.cwd(), 'src', 'backend', 'templates', 'email-corporativo-ls.html');

// Uma família só no e-mail inteiro. Antes conviviam 'Segoe UI' no template e
// Arial nos componentes de linha, o que trocava a fonte no meio do documento.
// Nada é carregado remotamente: Outlook e Gmail bloqueiam webfont, e o que
// chegaria seria a fonte de fallback de qualquer jeito.
const FONTE = "-apple-system,'Segoe UI',Roboto,Arial,Helvetica,sans-serif";

export type TipoSolicitacao = 'PROGRAMACAO_PAGAMENTO' | 'REEMBOLSO' | 'ADIANTAMENTO' | 'COMPRA_MATERIAL' | 'FORMALIZACAO_PAGAMENTO' | 'FORMALIZACAO_CARTAO';

const ROTULO_TIPO: Record<TipoSolicitacao, string> = {
    PROGRAMACAO_PAGAMENTO: 'Programação de Pagamento',
    REEMBOLSO: 'Reembolso',
    ADIANTAMENTO: 'Adiantamento',
    COMPRA_MATERIAL: 'Compra de Material',
    FORMALIZACAO_PAGAMENTO: 'Formalização de Pagamento',
    FORMALIZACAO_CARTAO: 'Formalização de Compra no Cartão',
};

// Códigos de catálogo que não acrescentam nada escritos no corpo do e-mail.
const FINALIDADES_GENERICAS = new Set(['OUTROS', 'OUTRO', 'DIVERSOS', 'GERAL', 'N/A']);

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
    // Classificacao da atividade que originou a solicitacao. Nunca inferir pelo
    // tipo do e-mail: reembolso e pagamento existem tanto em implantacao quanto
    // em operacao.
    tipo_demanda?: 'IMPLANTACAO' | 'OPERACAO' | string | null;
    area?: string | null;
    responsavel_solicitacao?: string | null;
    fornecedor?: string | null;
    cpf_cnpj?: string | null;
    descricao?: string | null;
    /**
     * O que foi feito, em palavras de quem contratou.
     *
     * `descricao` nasce do catálogo — "Mão de obra — Implantação Collo" — e por
     * isso serve para qualquer contratação de mão de obra da obra inteira. Quem
     * confere o pagamento precisa saber que o prestador era o serralheiro e o
     * que ele fez. É esse texto livre.
     */
    detalhamento?: string | null;
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

// Marcadores de "vazio" que aparecem digitados no cadastro. Sem isto o e-mail
// sai com "Agência: N/A", que ocupa espaço e não informa nada.
const VAZIOS = new Set(['n/a', 'na', 'n.a.', '-', '--', 'nao informado', 'não informado', 'nao possui', 'não possui', 'sem', 'x']);

const temValor = (v: any): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return !Number.isNaN(v);
    const texto = String(v).trim();
    return texto !== '' && !VAZIOS.has(texto.toLowerCase());
};

/** CPF e CNPJ mascarados: quem opera no banco copia o número à mão. */
function mascararDocumento(valor: any): string | null {
    if (!temValor(valor)) return null;
    const n = String(valor).replace(/\D/g, '');
    if (n.length === 11) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
    if (n.length === 14) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
    return String(valor).trim();
}

/**
 * Chave PIX como vai ser usada. Telefone sai só com dígitos (DDD + número,
 * sem parênteses nem hífen), que é o que se cola direto no app do banco;
 * documento ganha máscara; e-mail e chave aleatória saem como estão, porque
 * qualquer formatação inventada ali quebraria a chave.
 */
function mascararChavePix(chave: any, tipo?: string | null): string | null {
    if (!temValor(chave)) return null;
    const bruto = String(chave).trim();
    const t = String(tipo || '').toUpperCase();
    let n = bruto.replace(/\D/g, '');
    // Sem tipo cadastrado, só trata como telefone quando a chave é puro
    // dígito com 10 ou 11 casas — e-mail e chave aleatória nunca são.
    const soDigitos = /^\d+$/.test(bruto.replace(/[\s()+-]/g, ''));
    if (t === 'TELEFONE' || (!t && soDigitos && (n.length === 10 || n.length === 11))) {
        // "+55 31 97185-5446" também vira DDD + número: o 55 é do país.
        if ((n.length === 12 || n.length === 13) && n.startsWith('55')) n = n.slice(2);
        if (n.length === 10 || n.length === 11) return n;
    }
    if (t === 'CPF' || t === 'CNPJ') return mascararDocumento(bruto);
    return bruto;
}

/** Dois textos são "o mesmo" ignorando caixa, acento e espaço sobrando. */
function mesmoTexto(a: any, b: any): boolean {
    const normal = (v: any) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ').trim().toLowerCase();
    const x = normal(a);
    return x !== '' && x === normal(b);
}

/** Saudação pela hora em que o e-mail é gerado — era "Bom dia!" fixo. */
function saudacao(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia!';
    if (h < 18) return 'Boa tarde!';
    return 'Boa noite!';
}

/** Linha rótulo/valor da tabela cinza. Só é gerada quando há conteúdo. */
/** Igual a `linha`, mas sai mesmo sem valor: deixa o campo em branco para preencher. */


/**
 * Uma linha rótulo/valor do cartão.
 *
 * O rótulo ocupa um terço e o valor começa exatamente no terço seguinte,
 * alinhado à ESQUERDA. Antes o valor ia encostado na borda direita: com um
 * rótulo curto como "Operadora" e um valor curto como "CLARO", abria-se um vão
 * de meia largura no meio da linha e o olho tinha de atravessar o vazio para
 * ligar um ao outro. Alinhados no terço, os valores ainda formam coluna — o que
 * permite comparar cifras — mas a informação ocupa o espaço em vez de fugir
 * para os extremos.
 *
 * O rótulo é `#46566B`, não o cinza claro de antes: era secundário demais para
 * um documento que o financeiro confere campo a campo.
 *
 * A célula do valor precisa de `word-break` além de `overflow-wrap`: só o
 * primeiro reduz o min-content da tabela. Com `overflow-wrap` sozinho, um token
 * sem espaço — um caminho UNC, o nome de um anexo — vira a largura mínima da
 * tabela inteira e o cartão estoura no celular.
 */
function celulaRotuloValor(rotulo: string, valorHtml: string, cor: string, peso: string, _borda: boolean): string {
    return `
              <tr>
                <td class="row-label" width="33%" valign="top" style="width:33%;padding:12px 16px 12px 0;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;line-height:20px;color:#46566B;">${escapar(rotulo)}</td>
                <td class="row-value" align="left" valign="top" style="padding:12px 0;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:15px;line-height:22px;font-weight:${peso};color:${cor};word-break:break-word;overflow-wrap:break-word;">${valorHtml}</td>
              </tr>`;
}




function linhaEmBranco(rotulo: string, valor: any): string {
    const conteudo = temValor(valor) ? escapar(valor) : '&nbsp;';
    return celulaRotuloValor(rotulo, conteudo, '#08213F', 'bold', true);
}
function linha(rotulo: string, valor: any, destaque = false): string {
    if (!temValor(valor)) return '';
    return celulaRotuloValor(rotulo, escapar(valor), '#08213F', 'bold', false);
}

/** Remove a última borda para a tabela não terminar com um traço solto. */
function fecharTabela(html: string): string {
    const i = html.lastIndexOf('border-bottom:1px solid #EEF2F7;');
    if (i < 0) return html;
    const j = html.lastIndexOf('border-bottom:1px solid #EEF2F7;', i - 1);
    return html.slice(0, j >= 0 ? j : i).concat(
        html.slice(j >= 0 ? j : i).split('border-bottom:1px solid #EEF2F7;').join(''),
    );
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

/**
 * Abertura curta.
 *
 * Antes era um parágrafo que repetia o favorecido, o site e a descrição — todos
 * já visíveis logo abaixo, na faixa de resumo e nos cartões. Repetir o dado
 * afasta o olho do que é único e alonga o e-mail sem acrescentar nada. Aqui
 * fica só a saudação e a frase que diz o que se pede; o que fazer depois do
 * pagamento está no fecho operacional.
 */
function introducao(d: DadosEmail): string {
    const pedido: Record<TipoSolicitacao, string> = {
        REEMBOLSO: 'Segue solicitação de reembolso para programação.',
        ADIANTAMENTO: 'Segue solicitação de adiantamento para programação.',
        FORMALIZACAO_CARTAO: 'Formalização de compra já realizada no cartão corporativo. Não representa nova transferência ao fornecedor.',
        FORMALIZACAO_PAGAMENTO: 'Formalização de pagamento já realizado. Não representa nova transferência ao fornecedor.',
        COMPRA_MATERIAL: 'Segue solicitação de compra dos materiais relacionados abaixo.',
        PROGRAMACAO_PAGAMENTO: 'Segue solicitação de pagamento para programação.',
    };
    return `${saudacao()}<br><br>${pedido[d.tipo] || pedido.PROGRAMACAO_PAGAMENTO}`;
}

function itensMateriais(itens: ItemMaterial[]): string {
    return itens.map((it, i) => {
        const total = it.valor_total ?? ((it.quantidade || 0) * (it.valor_unitario || 0));
        const fundo = i % 2 === 0 ? '#FFFFFF' : '#F6F9FC';
        return `
              <tr style="background-color:${fundo};">
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13px;color:#46566B;">${String(i + 1).padStart(2, '0')}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;word-break:break-word;overflow-wrap:break-word;">${escapar(it.descricao)}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;">${it.quantidade ?? ''}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;">${escapar(it.unidade || '')}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;">${moeda(it.valor_unitario)}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;font-weight:700;color:#08213F;">${moeda(total)}</td>
              </tr>`;
    }).join('');
}

function totalLinha(rotulo: string, valor: number | null | undefined, destaque = false): string {
    if (!temValor(valor)) return '';
    const tam = destaque ? '15px' : '12.5px';
    const cor = destaque ? '#08213F' : '#8B99AB';
    return `
              <tr>
                <td align="right" style="padding:${destaque ? '9px' : '4px'} 10px;font-family:${FONTE};font-size:${tam};font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:0.4px;">${escapar(rotulo)}</td>
                <td align="right" width="140" style="padding:${destaque ? '9px' : '4px'} 10px;font-family:${FONTE};font-size:${tam};font-weight:700;color:${destaque ? '#08213F' : '#46566B'};${destaque ? 'border-top:2px solid #08213F;' : ''}">${moeda(valor)}</td>
              </tr>`;
}

function itensReembolso(itens: ItemDespesa[]): string {
    const linhas = itens.map((it, i) => {
        const fundo = i % 2 === 0 ? '#FFFFFF' : '#F6F9FC';
        return `
              <tr style="background-color:${fundo};">
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;">${escapar(data(it.data))}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;color:#46566B;word-break:break-word;overflow-wrap:break-word;">${escapar(it.descricao)}</td>
                <td align="left" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13px;color:#46566B;">${escapar(ROTULO_CATEGORIA[String(it.categoria || 'OUTROS').toUpperCase()] || it.categoria || '')}</td>
                <td align="right" style="padding:9px 10px;border-top:1px solid #EEF2F7;font-family:${FONTE};font-size:13.5px;font-weight:700;color:#08213F;">${moeda(it.valor)}</td>
              </tr>`;
    }).join('');

    const total = itens.reduce((s, i) => s + (i.valor || 0), 0);
    return linhas + `
              <tr style="background-color:#EDF4FD;">
                <td colspan="3" align="right" style="padding:11px 10px;border-top:2px solid #08213F;font-family:${FONTE};font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#08213F;">Total do reembolso</td>
                <td align="right" style="padding:11px 10px;border-top:2px solid #08213F;font-family:${FONTE};font-size:16px;font-weight:700;color:#08213F;">${moeda(total)}</td>
              </tr>`;
}

function anexos(lista: string[]): string {
    return lista.map(a => `
              <tr>
                <td width="20" valign="top" style="padding:4px 0;font-family:${FONTE};font-size:13px;font-weight:700;color:#08213F;">&#10003;</td>
                <td style="padding:4px 0;font-family:${FONTE};font-size:14px;color:#46566B;word-break:break-word;overflow-wrap:break-word;">${escapar(a)}</td>
              </tr>`).join('');
}

/**
 * Apaga todo comentário HTML que não seja funcional.
 *
 * Esta é a barreira contra a classe de defeito que já vazou para o financeiro:
 * comentário HTML não aninha, então qualquer `-->` escrito dentro de um bloco
 * de documentação encerra o comentário ali e joga o resto da prosa — paleta,
 * notas de arquitetura, nomes de arquivo — no corpo do e-mail.
 *
 * Em vez de confiar em quem edita o template lembrar da regra, nenhuma prosa
 * sai daqui: só sobrevivem os marcadores de que o pipeline precisa.
 *   · SE:/FIM: — consumidos logo a seguir por `aplicarCondicionais()`;
 *   · ASSINATURA e FOOTER — consumidos depois por email-signature.service.ts;
 *   · `[if ...]`/`[endif]` — comentários condicionais do Outlook, que são
 *     marcação de verdade e não comentário.
 *
 * Roda antes das condicionais, para que um comentário mal fechado no meio de um
 * bloco condicional não atrapalhe a remoção do bloco.
 */
function removerComentariosNaoFuncionais(html: string): string {
    const funcional = (corpo: string): boolean => {
        const c = corpo.trim();
        return /^#(SE|FIM):[A-Z_]+$/.test(c) || c === 'ASSINATURA' || c === 'FOOTER' || /^\[if/i.test(c);
    };

    let saida = '';
    let i = 0;
    while (i < html.length) {
        const abre = html.indexOf('<!--', i);
        if (abre < 0) { saida += html.slice(i); break; }
        saida += html.slice(i, abre);

        // Consome fechamentos até equilibrar as aberturas encontradas dentro.
        // Um bloco bem formado fecha no primeiro `-->`. Um bloco que cita a
        // sintaxe de outro marcador por extenso tem `<!--` no meio: aí o
        // primeiro `-->` é o do marcador citado, não o do bloco, e parar nele
        // deixaria a prosa seguinte solta no corpo — que é exatamente o defeito
        // que chegou impresso ao financeiro. Contando as aberturas, o bloco
        // inteiro é consumido de uma vez.
        let cursor = abre + 4;
        let pendentes = 1;
        let fim = -1;
        while (pendentes > 0) {
            const fecha = html.indexOf('-->', cursor);
            if (fecha < 0) break;
            pendentes += (html.slice(cursor, fecha).match(/<!--/g) || []).length - 1;
            cursor = fecha + 3;
            fim = cursor;
        }
        // Sem fechamento nenhum o documento já está quebrado: descarta o resto,
        // que é melhor do que despejar prosa no corpo do e-mail.
        if (fim < 0) break;

        const inteiro = html.slice(abre, fim);
        const corpo = inteiro.slice(4, -3);
        if (funcional(corpo)) saida += inteiro;
        i = fim;
    }
    return saida;
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

/**
 * Área de origem da demanda: o financeiro recebe pagamento de várias frentes e
 * precisa saber de qual se trata antes de abrir.
 *
 * Usada no assunto E no cabeçalho do e-mail — os dois lêem daqui para não se
 * contradizerem.
 */
function areaOrigem(d: DadosEmail): string {
    const tipoDemanda = String(d.tipo_demanda || '').trim().toUpperCase();
    if (tipoDemanda === 'IMPLANTACAO') return 'IMPLANTAÇÃO';
    if (tipoDemanda === 'OPERACAO') return 'OPERAÇÕES';
    return 'ENGENHARIA';
}

export function montarAssunto(d: DadosEmail): string {
    const partes = (...v: (string | null | undefined)[]) => v.filter(x => temValor(x)).map(x => String(x).trim()).join(' | ');
    const resumo = (d.descricao || '').trim().slice(0, 70);
    const origem = areaOrigem(d);
    if (d.tipo === 'REEMBOLSO') return `[${origem}] REEMBOLSO | ${partes(d.nome_colaborador || d.favorecido, d.site, d.sharing)}`;
    if (d.tipo === 'ADIANTAMENTO') {
        return `[${origem}] ADIANTAMENTO | ${partes(d.nome_colaborador || d.favorecido, d.site, d.sharing)}`;
    }
    if (d.tipo === 'FORMALIZACAO_PAGAMENTO' || d.tipo === 'FORMALIZACAO_CARTAO') {
        return `[${origem}] FORMALIZAÇÃO DE PAGAMENTO | ${partes(d.favorecido || d.fornecedor, d.site, resumo)}`;
    }
    // O favorecido entra no assunto: e por ele que o financeiro identifica o
    // pagamento na caixa de entrada, mais do que pelo site.
    if (d.tipo === 'COMPRA_MATERIAL') {
        return `[${origem}] COMPRA DE MATERIAL | ${partes(d.favorecido || d.fornecedor, d.site, resumo)}`;
    }
    return `[${origem}] SOLICITAÇÃO DE PAGAMENTO | ${partes(d.favorecido || d.fornecedor, d.site, resumo)}`;
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

    // Faixa de resumo do topo: valor, favorecido e prazo lado a lado. São os
    // três dados que decidem se quem abre o e-mail precisa agir agora.
    const resumoFavorecido = d.nome_colaborador || d.favorecido || d.fornecedor || null;
    const prazo = d.data_pagamento ? new Date(d.data_pagamento) : null;
    const prazoValido = prazo && !Number.isNaN(prazo.getTime()) ? prazo : null;
    const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

    const identificacao = [
        linha('Site / Projeto', d.site, true),
        linha('Nome do site', d.nome_site),
        linha('Operadora', d.cliente),
        linha('Sharing / Contratante', d.sharing),
        // "Área responsável" saiu: a resposta e sempre Engenharia, entao o campo
        // nao informava nada. O que interessa ali e o produto/serviço pago —
        // mas só quando ele diz alguma coisa: "OUTROS" é o código genérico do
        // catálogo e no corpo do e-mail vira ruído.
        FINALIDADES_GENERICAS.has(String(d.area || '').toUpperCase()) ? '' : linha('Produto / Serviço', d.area),
        linha('Responsável pela solicitação', d.responsavel_solicitacao),
        // O favorecido já está na faixa de resumo. Aqui só entra quando é OUTRA
        // pessoa — o fornecedor que prestou o serviço, num reembolso pago a
        // quem adiantou o dinheiro.
        mesmoTexto(d.nome_colaborador || d.fornecedor, resumoFavorecido)
            ? ''
            : linha(['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? 'Colaborador / Favorecido' : 'Fornecedor / Prestador',
                ['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? (d.nome_colaborador || d.fornecedor) : d.fornecedor),
        // No reembolso o colaborador é o próprio favorecido, então este CPF é o
        // mesmo que sai em "Dados para pagamento". Só aparece aqui quando for
        // de outra pessoa — o prestador do serviço, por exemplo.
        (() => {
            const doc = mascararDocumento(['REEMBOLSO', 'ADIANTAMENTO'].includes(d.tipo) ? (d.cpf_colaborador || d.cpf_cnpj) : d.cpf_cnpj);
            return mesmoTexto(doc, mascararDocumento(d.cpf_cnpj_pagamento)) ? '' : linha('CPF / CNPJ', doc);
        })(),
        // O que se está pagando. Sai SEMPRE que houver texto.
        //
        // Esta linha já foi suprimida quando era igual ao motivo, e a linha do
        // motivo é suprimida quando é igual à descrição — as duas se apagavam
        // uma à outra. No reembolso isso era garantido, porque o controller
        // manda o mesmo `r.motivo` nos dois campos: o e-mail saía sem dizer o
        // que estava sendo pago, e foi assim que o financeiro recebeu.
        //
        // A justificativa original — "a descrição já é o texto de abertura" —
        // valia quando `introducao()` repetia a descrição. Hoje a abertura é uma
        // frase fixa por modalidade e não repete nada.
        linha('Descrição', d.descricao),
        // Vem logo abaixo da descrição, e só quando acrescenta: repetir o que o
        // catálogo já disse não ajuda ninguém a conferir.
        mesmoTexto(d.detalhamento, d.descricao) ? '' : linha('Detalhamento', d.detalhamento),
        linha('Data da despesa', data(d.data_despesa)),
        // Repetir a descrição palavra por palavra não informa nada: só sai
        // quando o motivo de fato acrescenta.
        mesmoTexto(d.motivo_reembolso, d.descricao) ? '' : linha('Motivo', d.motivo_reembolso),
        linha('Centro de custo', d.centro_custo),
        linha('PO / Pedido', d.po),
        linha('Contrato', d.contrato),
    ].join('');

    const financeiras = [
        // O total contratado virou o complemento sob o valor em destaque
        // (VALOR_COMPLEMENTO). Aqui ele seria o mesmo número outra vez.

        linha('Valor já pago', moeda(d.valor_pago)),
        // Com saldo a pagar, o aviso de pagamento parcial já o destaca; repetir
        // aqui seria o terceiro lugar com o mesmo número.
        temValor(saldo) && (saldo as number) > 0 ? '' : linha('Saldo remanescente', moeda(saldo)),
        linha('Condição de pagamento', d.condicao_pagamento),
        linha('Competência', d.competencia),
    ].join('');

    const ROTULO_FORMA: Record<string, string> = {
        PIX: 'PIX', TED: 'Transferência (TED/DOC)', CARTAO_CREDITO: 'Cartão de crédito corporativo',
        BOLETO: 'Boleto', DINHEIRO: 'Dinheiro',
    };
    const noCartao = d.forma_pagamento === 'CARTAO_CREDITO';
    // Pagamento por PIX não usa banco/agência/conta: quem paga só precisa da
    // chave. Mantê-los ali só dá o que conferir sem necessidade.
    const porPix = d.forma_pagamento === 'PIX' && temValor(d.pix);

    const bancarias = [
        linha('Forma de pagamento', d.forma_pagamento ? (ROTULO_FORMA[d.forma_pagamento] || d.forma_pagamento) : null, true),
        // No cartao a compra sai pelo cartao da LS; conta do fornecedor nao entra.
        noCartao ? linha('Cartão utilizado', d.cartao
            ? `${d.cartao.bandeira} •••• ${d.cartao.final}${d.cartao.apelido ? ` — ${d.cartao.apelido}` : ''}`
            : 'A definir pelo financeiro', true) : '',
        // Favorecido e data prevista não se repetem aqui: os dois já estão na
        // faixa de resumo do topo. Repetir rouba atenção do que é único.
        linha('Razão social', d.razao_social),
        // O documento subiu para a caixa de destaque do favorecido; repetir
        // aqui seria o mesmo número em dois lugares da mesma tela.

        // Em negrito porque sao os campos que o financeiro copia para o banco.
        noCartao || porPix ? '' : linha('Banco', d.banco, true),  // no PIX o banco vai junto da chave, no destaque
        noCartao || porPix ? '' : linha('Agência', d.agencia, true),
        noCartao || porPix ? '' : linha('Conta', d.conta, true),
        porPix ? '' : linha('Tipo da conta', d.tipo_conta),
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
        RESUMO_FAVORECIDO: temValor(resumoFavorecido),
        RESUMO_PRAZO: Boolean(prazoValido),
        FINANCEIRO: temValor(valorPagamento),
        // A faixa de resumo depende só de haver um valor; a seção de condições
        // depende de haver o que dizer nela. Compartilhando a mesma condicional,
        // um pagamento simples — sem total contratado diferente, sem saldo, sem
        // condição de pagamento — imprimia o título "Condições financeiras" com
        // uma moldura vazia embaixo.
        CONDICOES: financeiras.trim() !== '',
        PARCIAL: temValor(saldo) && (saldo as number) > 0,
        CONDICAO_SALDO: temValor(d.condicao_liberacao_saldo),
        MATERIAIS: d.tipo === 'COMPRA_MATERIAL' && materiais.length > 0,
        ENTREGA: d.tipo === 'COMPRA_MATERIAL' && entrega.trim() !== '',
        // Uma despesa só não precisa de tabela: a descrição já está no corpo e
        // o valor está no resumo. Tabela de uma linha é moldura sem quadro.
        REEMBOLSO: d.tipo === 'REEMBOLSO' && despesas.length > 1,
        BANCARIOS: bancarias.trim() !== '' || temValor(d.pix),
        PIX: temValor(d.pix) && d.forma_pagamento !== 'CARTAO_CREDITO',
        DOCUMENTACAO: documentacao.trim() !== '' || ['PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO'].includes(d.tipo),
        ANEXOS: listaAnexos.length > 0,
        OBSERVACOES: temValor(d.observacoes),
        CONTATO_SOLICITANTE: temValor(contato),
    };

    const valores: Record<string, string> = {
        // O cabeçalho é marinho #08213F. A logo do cadastro é o lockup quadrado
        // com o fundo BRANCO gravado no arquivo: sobre o marinho vira um
        // quadrado branco. Entra o mesmo símbolo com fundo transparente, que é
        // a marca sem recorte, deformação nem recoloração.
        LOGO_LS_OFFICE: EMBLEMA_LS_TRANSPARENTE,
        TIPO_SOLICITACAO_FORMATADO: ROTULO_TIPO[d.tipo],
        // Texto de pré-visualização da caixa de entrada: fica escondido no
        // corpo e é o que o cliente mostra ao lado do assunto na lista.
        PREVIA_CAIXA_ENTRADA: [
            ROTULO_TIPO[d.tipo],
            temValor(valorPagamento) ? moeda(valorPagamento) : null,
            resumoFavorecido ? escapar(resumoFavorecido) : null,
        ].filter(Boolean).join(' · '),
        // Mesma origem que o assunto usa, para o cabeçalho não contradizer a
        // linha de assunto.
        AREA_ORIGEM: areaOrigem(d),
        // Complemento sob o valor: diz que este não é o total do processo.
        VALOR_COMPLEMENTO: temValor(valorTotal) && valorTotal !== valorPagamento
            ? `de ${moeda(valorTotal)} contratados`
            : '',
        DOC_FAVORECIDO: temValor(d.cpf_cnpj_pagamento)
            ? `${String(d.cpf_cnpj_pagamento).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'} ${escapar(mascararDocumento(d.cpf_cnpj_pagamento))}`
            : '',
        RESUMO_ANEXOS: listaAnexos.length
            ? ` &bull; ${listaAnexos.length} arquivo${listaAnexos.length > 1 ? 's' : ''} da despesa`
            : '',
        TEXTO_INTRODUCAO: introducao(d),
        LINHAS_IDENTIFICACAO: fecharTabela(identificacao),
        LINHAS_FINANCEIRAS: fecharTabela(financeiras),
        ROTULO_VALOR_DESTAQUE: d.tipo === 'REEMBOLSO' ? 'Valor deste reembolso'
            : d.tipo === 'ADIANTAMENTO' ? 'Valor deste adiantamento'
                : ['COMPRA_MATERIAL', 'FORMALIZACAO_CARTAO'].includes(d.tipo) ? 'Valor desta compra' : 'Valor desta programação',
        VALOR_PAGAMENTO: moeda(valorPagamento),
        RESUMO_FAVORECIDO: escapar(resumoFavorecido),
        // Instituição do recebedor, logo abaixo da chave. É o que permite
        // conferir se a chave é a certa ANTES de transferir — quem paga não
        // tem outro jeito de saber para onde o dinheiro vai. O nome do
        // favorecido não se repete aqui: ele está no resumo imediatamente
        // acima, e repetir tira o olho do que é único.
        // Sai prefixado com separador porque o template concatena
        // TIPO_PIX + RESUMO_PIX_INFO e qualquer um dos dois pode faltar.
        RESUMO_PIX_INFO: temValor(d.banco)
            ? `${d.tipo_pix ? ' &middot; ' : ''}${escapar(d.banco)}`
            : '',
        RESUMO_PRAZO: prazoValido ? prazoValido.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
        // O dia da semana ajuda quem monta a fila de pagamentos do dia.
        RESUMO_PRAZO_DIA: prazoValido ? DIAS[new Date(prazoValido.getTime() + prazoValido.getTimezoneOffset() * 60000).getDay()] : '',
        SALDO: moeda(saldo),
        CONDICAO_LIBERACAO_SALDO: escapar(d.condicao_liberacao_saldo),
        ITENS_MATERIAIS: itensMateriais(materiais),
        TOTAIS_MATERIAIS: totaisMateriais,
        LINHAS_ENTREGA: fecharTabela(entrega),
        ITENS_REEMBOLSO: itensReembolso(despesas),
        LINHAS_BANCARIAS: fecharTabela(bancarias),
        PIX: escapar(mascararChavePix(d.pix, d.tipo_pix)),
        // O tipo da chave é o primeiro item da legenda sob o número.
        TIPO_PIX: d.tipo_pix ? `Chave do tipo ${escapar(String(d.tipo_pix).toLowerCase())}` : '',
        LINHAS_DOCUMENTACAO: fecharTabela(documentacao),
        LISTA_ANEXOS: anexos(listaAnexos),
        OBSERVACOES: escapar(d.observacoes).replace(/\n/g, '<br>'),
        TEXTO_OPERACIONAL: operacional,
        // Fallback institucional do template. O compositor global substitui este
        // bloco pela assinatura visual do usuario quando houver uma ativa.
        NOME_SOLICITANTE: escapar(d.nome_solicitante || 'LS Office'),
        CARGO_SOLICITANTE: escapar(d.cargo_solicitante || 'Engenharia'),
        CONTATO_SOLICITANTE: contato,
        RODAPE_REFERENCIA: escapar(d.referencia || ''),
    };

    html = removerComentariosNaoFuncionais(html);
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
