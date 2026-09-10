// Leitura do PDF da PO. Há um reconhecedor específico para o layout "ORDEM DE COMPRA"
// da Highline (tabela Descrição | Item | Un. | Quant | Site | Cidade | Projeto | Preço
// Unit. | Valor Total) e um genérico por rótulos, para os demais vendors. O resultado é
// gravado na PO e mostrado na tela para quem recebeu conferir — a leitura nunca é
// tratada como verdade absoluta: todos os campos continuam editáveis.

export interface ItemPO {
    item: string | null;
    descricao: string;
    unidade: string | null;
    quantidade: number | null;
    site: string | null;
    cidade: string | null;
    projeto: string | null;
    valor_unitario: number | null;
    valor: number | null;
}

export interface LeituraPO {
    numero: string | null;
    valor: number | null;
    data: string | null;
    emissor: string | null;
    emissor_cnpj: string | null;
    fornecedor: string | null;
    fornecedor_cnpj: string | null;
    site: string | null;
    sites: string[];
    projeto: string | null;
    descricao: string | null;
    condicao_pagamento: string | null;
    itens: ItemPO[];
    valores_encontrados: number[];
    layout: string;
    confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
    texto_extraido: string;
}

const MESES: Record<string, string> = {
    jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
    jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
    feb: '02', apr: '04', may: '05', aug: '08', sep: '09', oct: '10', dec: '12',
};

export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
    }).promise;

    const paginas: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        // Reconstrói as linhas pela posição vertical; sem isso o texto vira uma sopa só
        // e a tabela de itens fica impossível de separar.
        const linhas = new Map<number, { x: number; s: string }[]>();
        for (const item of content.items as any[]) {
            if (!('str' in item) || !item.str.trim()) continue;
            const y = Math.round(item.transform[5]);
            const chave = [...linhas.keys()].find(k => Math.abs(k - y) <= 2) ?? y;
            if (!linhas.has(chave)) linhas.set(chave, []);
            linhas.get(chave)!.push({ x: item.transform[4], s: item.str });
        }
        const ordenadas = [...linhas.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([, partes]) => partes.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim());
        paginas.push(ordenadas.join('\n'));
    }
    await doc.destroy();
    return paginas.join('\n');
}

function parseValorBR(bruto: string): number | null {
    const limpo = bruto.replace(/\s/g, '');
    const ptBr = /^\d{1,3}(\.\d{3})*,\d{2}$/.test(limpo) || /^\d+,\d{2}$/.test(limpo);
    const normalizado = ptBr ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '');
    const n = parseFloat(normalizado);
    return Number.isFinite(n) ? n : null;
}

function normalizarData(bruto: string): string | null {
    const br = bruto.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = bruto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return iso[0];
    const ext = bruto.match(/\b(\d{1,2})[\s.-]?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)[a-z]*[\s.-]?(\d{4})\b/i);
    if (ext) return `${ext[3]}-${MESES[ext[2].toLowerCase().slice(0, 3)]}-${String(ext[1]).padStart(2, '0')}`;
    // dd/mm/aa — formato usado na PO da Highline ("19/06/26")
    const curta = bruto.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{2})\b/);
    if (curta) return `20${curta[3]}-${curta[2]}-${curta[1]}`;
    return null;
}

// Procura "Rótulo: valor". Só aceita quando o rótulo abre a linha — senão casaria com a
// palavra solta dentro do texto corrido (ex.: ...qualificada "Fornecedor".).
function valorDoRotulo(linhas: string[], rotulo: RegExp): string | null {
    const noInicio = new RegExp(`^\\s*${rotulo.source}`, rotulo.flags.replace('g', ''));
    for (let i = 0; i < linhas.length; i += 1) {
        const m = linhas[i].match(noInicio);
        if (!m) continue;
        const resto = linhas[i].slice(m[0].length).replace(/^[:\-\s]+/, '').trim();
        // corta no próximo rótulo da mesma linha (o layout tem 2-3 colunas por linha)
        const cortado = resto.split(/\s{2,}|\b(?:Cidade|UF|Cep|Tel|Cel|Contato|I\.E\.|CGC|CNPJ|E-mail)\s*:/i)[0].trim();
        if (cortado.length > 1) return cortado;
        // Valor na linha de baixo — mas pulando linhas que são só outro rótulo vazio
        // (o PDF da Highline lista "Fornecedor:", "Endereço:", "Bairro:"... em sequência,
        // com os valores todos num bloco separado mais adiante).
        for (let j = i + 1; j < Math.min(i + 4, linhas.length); j += 1) {
            const candidata = linhas[j].trim();
            if (candidata.length <= 1 || /:\s*$/.test(candidata)) continue;
            return candidata;
        }
        return null;
    }
    return null;
}

// ── Layout Highline: "ORDEM DE COMPRA" com tabela de itens por site ──────────
// Linha real (a descrição estoura a coluna e cola no nº do item, e o final dela cai na
// linha de baixo):
//   CONSTRUCAO DE SITE COLLO GF - MATERI0001 UN 1,00 PACCH004 CACHOEIRA DO PIRIA SKYCOVERAGE 66.712,99 66.713,00
//   AL
const RE_ITEM_HIGHLINE = /^(.+?)\s*(\d{4})\s+([A-Z]{2,4})\s+([\d.,]+)\s+([A-Z]{2}[A-Z0-9]{3,10})\s+(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*$/;

// Sobra da descrição que caiu na linha seguinte: pedaço curto, sem números nem rótulos.
function ehSobraDeDescricao(linha: string): boolean {
    return !!linha
        && linha.length <= 20
        && !/\d/.test(linha)
        && /^[A-ZÀ-Ú][A-ZÀ-Ú\s-]*$/.test(linha.trim());
}

// "CACHOEIRA DO PIRIA SKYCOVERAGE" → cidade + projeto: o projeto é o último token em
// caixa alta. No PDF as duas colunas se sobrepõem e às vezes saem coladas
// ("PIRIASKYCOVERAGE"); nesse caso não há como cortar com segurança, então o bloco
// inteiro fica como cidade e o projeto vazio — melhor mostrar o texto cru do documento
// do que inventar uma divisão errada.
function separarCidadeProjeto(bloco: string): { cidade: string | null; projeto: string | null } {
    const partes = bloco.trim().split(/\s+/);
    if (partes.length < 2) return { cidade: bloco.trim() || null, projeto: null };
    const ultimo = partes[partes.length - 1];
    const pareceProjeto = ultimo.length >= 4 && ultimo.length <= 14 && /^[A-ZÀ-Ú0-9]+$/.test(ultimo);
    if (!pareceProjeto) return { cidade: bloco.trim(), projeto: null };
    return { cidade: partes.slice(0, -1).join(' '), projeto: ultimo };
}

function lerItensHighline(linhas: string[]): ItemPO[] {
    const itens: ItemPO[] = [];
    for (let i = 0; i < linhas.length; i += 1) {
        const m = linhas[i].match(RE_ITEM_HIGHLINE);
        if (!m) continue;

        const [, descBruta, item, unidade, quant, site, cidadeProjeto, unit, total] = m;

        // Completa a descrição com a sobra da linha seguinte ("MATERI" + "AL").
        let descricao = descBruta.replace(/\s+/g, ' ').trim();
        if (i + 1 < linhas.length && ehSobraDeDescricao(linhas[i + 1])) {
            descricao += linhas[i + 1].trim();
            i += 1;
        }

        const { cidade, projeto } = separarCidadeProjeto(cidadeProjeto);
        itens.push({
            item,
            descricao,
            unidade,
            quantidade: parseValorBR(quant),
            site,
            cidade,
            projeto,
            valor_unitario: parseValorBR(unit),
            valor: parseValorBR(total),
        });
        if (itens.length >= 60) break;
    }
    return itens;
}

// Rodapé da tabela: "Sub-total / Desconto / Total" com os valores logo abaixo (o PDF
// separa rótulos e valores em blocos distintos) ou na mesma linha.
function totalDoRodape(linhas: string[]): number | null {
    for (let i = 0; i < linhas.length; i += 1) {
        if (!/^sub-?total\b/i.test(linhas[i])) continue;
        // valores na mesma linha dos rótulos
        const naLinha = linhas.slice(i, i + 4).join(' ').match(/([\d.]+,\d{2})\D+([\d.]+,\d{2})\D+([\d.]+,\d{2})/);
        if (naLinha) return parseValorBR(naLinha[3]);
        // valores em linhas soltas depois do bloco de rótulos
        const numeros = linhas.slice(i, i + 8)
            .map(l => l.match(/^\s*([\d.]+,\d{2})\s*$/)?.[1])
            .filter((v): v is string => !!v);
        if (numeros.length >= 3) return parseValorBR(numeros[2]);
        if (numeros.length) return parseValorBR(numeros[numeros.length - 1]);
    }
    const mTotal = linhas.join(' \n ').match(/(?:^|\n)\s*total\s*[:\-]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
    return mTotal ? parseValorBR(mTotal[1]) : null;
}

// ── Fallback genérico: linha que termina em valor monetário ──────────────────
function lerItensGenerico(linhas: string[]): ItemPO[] {
    const itens: ItemPO[] = [];
    for (const linha of linhas) {
        const m = linha.match(/^(.{6,90}?)\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})\s*$/);
        if (!m) continue;
        const desc = m[1].replace(/[.\s|_-]+$/, '').trim();
        if (/^(valor\s*total|total|subtotal|impostos?|desconto|frete)/i.test(desc) || desc.length < 6) continue;
        itens.push({
            item: null, descricao: desc, unidade: null, quantidade: null,
            site: null, cidade: null, projeto: null, valor_unitario: null,
            valor: parseValorBR(m[2]),
        });
        if (itens.length >= 40) break;
    }
    return itens;
}

export function interpretarTextoPO(texto: string): LeituraPO {
    const linhas = texto.split(/\n+/).map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
    const plano = linhas.join(' \n ');
    const ehHighline = /ordem\s*de\s*compra/i.test(plano) || /highline/i.test(plano);

    // ── Número ──────────────────────────────────────────────────────
    let numero: string | null = null;
    const padroesNumero = [
        /N[ºo°]?\s*PO\s*[:\-]?\s*(\d{4,12})/i,
        /(?:purchase\s*order|pedido\s*de\s*compra|ordem\s*de\s*compra|n[ºo°]?\s*do\s*pedido|pedido|PO|RC)\s*(?:n[ºo°.]?|number|nr\.?|num\.?)?\s*[:\-]?\s*([A-Z]{0,4}[-/]?\d{5,12})/i,
        /\b(45\d{8})\b/,
        /\b(\d{10})\b/,
        /\b(\d{6})\b/,
    ];
    for (const re of padroesNumero) {
        const m = plano.match(re);
        if (m) { numero = m[1].replace(/\s+/g, ''); break; }
    }

    // ── Data ────────────────────────────────────────────────────────
    const linhaData = linhas.find(l => /^data\s*[:\-]/i.test(l)) || '';
    let data = normalizarData(linhaData) || normalizarData(plano);

    // ── Partes ──────────────────────────────────────────────────────
    let fornecedor = valorDoRotulo(linhas, /\bfornecedor\b\s*:?/i);
    // Alguns PDFs colocam os rótulos num bloco e os valores em outro ("Fornecedor:" numa
    // linha e o nome só bem depois). Nesse caso o nome do fornecedor é a linha logo antes
    // do endereço, na vizinhança do CNPJ dele.
    if (!fornecedor) {
        const idxCnpjFornecedor = linhas.findIndex(l => /^\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*$/.test(l));
        if (idxCnpjFornecedor > 0) {
            const candidatas = linhas.slice(Math.max(0, idxCnpjFornecedor - 4), idxCnpjFornecedor)
                .filter(l => l.length > 12 && /[a-z]/.test(l) && !/^(rua|av\.|avenida|travessa|tv\b|cep|tel|fone)/i.test(l));
            fornecedor = candidatas[0] || null;
        }
    }
    const cnpjs = [...plano.matchAll(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g)].map(m => m[1]);
    // No layout Highline o CGC do emitente vem no cabeçalho (primeiro) e o do fornecedor
    // logo abaixo do bloco "Fornecedor:" (segundo).
    const emissorCnpj = cnpjs[0] || null;
    const fornecedorCnpj = cnpjs.find(c => c !== emissorCnpj) || null;

    let emissor: string | null = valorDoRotulo(linhas, /\b(cliente|comprador|emitente|contratante|bill\s*to)\b\s*:?/i);
    if (!emissor) {
        // Cabeçalho: as primeiras linhas até o título do documento. A reconstrução por
        // posição mistura colunas da direita na mesma linha (Nº PO, Data, o próprio
        // título), então esses trechos são removidos antes de montar a razão social.
        const idxTitulo = linhas.findIndex(l => /ordem\s*de\s*compra|purchase\s*order|pedido\s*de\s*compra/i.test(l));
        const cabecalho = linhas.slice(0, idxTitulo >= 0 ? idxTitulo + 1 : 3)
            .map(l => l
                .replace(/\bN[ºo°]?\s*PO\s*[:\-]?\s*\d+/i, '')
                .replace(/\bdata\s*[:\-]?\s*[\d/.-]+/i, '')
                .replace(/ordem\s*de\s*compra|purchase\s*order|pedido\s*de\s*compra/i, '')
                .replace(/\s+/g, ' ').trim())
            .filter(l => !/^(cgc|cnpj|fone|tel|cep|rua|av\.|avenida|travessa|tv\b|\d)/i.test(l) && l.length > 8);
        emissor = cabecalho.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim() || null;
    }

    // ── Itens ───────────────────────────────────────────────────────
    let itens = ehHighline ? lerItensHighline(linhas) : [];
    let layout = itens.length ? 'HIGHLINE_ORDEM_DE_COMPRA' : 'GENERICO';
    if (itens.length === 0) itens = lerItensGenerico(linhas);

    // ── Sites / projeto / descrição ─────────────────────────────────
    const sites = [...new Set(itens.map(i => i.site).filter((s): s is string => !!s))];
    const site = sites[0] || valorDoRotulo(linhas, /\b(site|esta[çc][ãa]o|site\s*id)\b\s*:?/i);
    const projeto = itens.find(i => i.projeto)?.projeto || null;
    const descricao = itens.length
        ? [...new Set(itens.map(i => i.descricao.split(' - ')[0]))].slice(0, 2).join(' / ')
        : valorDoRotulo(linhas, /\b(descri[çc][ãa]o|objeto|escopo|servi[çc]o|texto\s*breve|short\s*text|description)\b\s*:?/i);

    // ── Valor total ─────────────────────────────────────────────────
    const valoresEncontrados = [...plano.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/g)]
        .map(m => parseValorBR(m[1]))
        .filter((v): v is number => v != null && v > 0);

    // 1º) o "Total" do rodapé da tabela (Sub-total / Desconto / Total) — é o valor oficial
    // do pedido, já com desconto. 2º) a soma das linhas de item. 3º) rótulo genérico.
    let valor: number | null = totalDoRodape(linhas);
    if (valor == null) {
        const mTotal = plano.match(/(?:valor\s*total\s*(?:do\s*pedido|geral)?|total\s*geral|total\s*do\s*pedido|net\s*value|total\s*amount|valor\s*l[íi]quido)\s*(?:\(?\s*R\$\s*\)?)?\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
        if (mTotal) valor = parseValorBR(mTotal[1]);
    }
    if (valor == null && itens.length > 0) {
        const soma = Math.round(itens.reduce((acc, i) => acc + (i.valor || 0), 0) * 100) / 100;
        if (soma > 0) valor = soma;
    }
    if (valor == null && valoresEncontrados.length) valor = Math.max(...valoresEncontrados);

    // Condição de pagamento aparece nas observações ("100% A 45 DIAS") e define o prazo
    // de vencimento da NF.
    // O bloco de observações se repete no documento, então o trecho capturado pode vir
    // com a própria etiqueta de novo colada no fim — corta no primeiro reaparecimento.
    const mCondicao = plano.match(/condi[çc][ãa]o\s*de\s*pagamento\s*:?\s*([^\n]{3,80})/i);
    const condicaoPagamento = mCondicao
        ? mCondicao[1]
            .split(/condi[çc][ãa]o\s*de\s*pagamento|important|caso\s+a\s+compradora|o\s+n[úu]mero\s+desta/i)[0]
            .trim().replace(/\s+/g, ' ').replace(/[.;,]$/, '') || null
        : null;

    const achados = [numero, valor, data, itens.length ? 'x' : null, fornecedor].filter(Boolean).length;
    const confianca = achados >= 4 ? 'ALTA' : achados >= 2 ? 'MEDIA' : 'BAIXA';

    return {
        numero, valor, data,
        emissor, emissor_cnpj: emissorCnpj,
        fornecedor, fornecedor_cnpj: fornecedorCnpj,
        site, sites, projeto, descricao, condicao_pagamento: condicaoPagamento, itens,
        valores_encontrados: [...new Set(valoresEncontrados)].sort((a, b) => b - a).slice(0, 10),
        layout,
        confianca,
        texto_extraido: texto.slice(0, 6000),
    };
}

export async function lerPO(buffer: Buffer): Promise<LeituraPO> {
    const vazio = (texto: string): LeituraPO => ({
        numero: null, valor: null, data: null, emissor: null, emissor_cnpj: null,
        fornecedor: null, fornecedor_cnpj: null, site: null, sites: [], projeto: null,
        descricao: null, condicao_pagamento: null, itens: [], valores_encontrados: [], layout: 'DESCONHECIDO',
        confianca: 'BAIXA', texto_extraido: texto,
    });
    try {
        const texto = await extrairTextoPdf(buffer);
        if (!texto.trim()) {
            return vazio('(PDF sem texto selecionável — provavelmente digitalizado. Preencha os dados manualmente.)');
        }
        return interpretarTextoPO(texto);
    } catch (e: any) {
        return vazio(`(Não foi possível ler o PDF: ${e.message})`);
    }
}
