// Leitura de um orçamento pronto (Excel ou PDF) para virar o "Orçamento LS" da
// atividade (decisão de 08/10/2026). Nada é gravado aqui: a leitura devolve os
// itens para a pessoa conferir; só a confirmação na tela salva.
//
// Excel: procura, em cada aba, a linha de cabeçalho com descrição + quantidade +
// valor (unitário ou total) e lê as linhas abaixo. Cobre o Excel que o próprio
// sistema exporta (ITEM | SERVIÇO | DESCRIÇÃO | QTD | UNIDADE | VALOR UNITÁRIO |
// VALOR TOTAL) e planilhas com cabeçalhos parecidos.
//
// PDF: reconstrói as linhas do texto e reconhece as que terminam em valores em
// reais, com quantidade e unidade antes deles — o formato do PDF de orçamento
// da LS e de tabelas parecidas. PDF é menos exato: a tela sempre pede conferência.

import * as XLSX from 'xlsx';
import { extrairTextoPdf } from './po-leitura.service';

export interface ItemLido {
    codigo_item: string;
    titulo: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    total: number;
    /** Linha/página de origem, para a pessoa achar no arquivo. */
    origem: string;
    /** O total lido não bate com quantidade × unitário. */
    divergente: boolean;
}

export interface ResultadoLeitura {
    formato: 'EXCEL' | 'PDF';
    itens: ItemLido[];
    soma_itens: number;
    /** Total geral escrito no documento, quando encontrado. */
    total_documento: number | null;
    avisos: string[];
}

const arred = (v: number) => Math.round(v * 100) / 100;
const chave = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** "R$ 1.234,56", "1234.56", 1234.56 → 1234.56. Vazio/sem número → null. */
export function lerNumero(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v ?? '').replace(/R\$|\s/g, '').replace(/[^\d.,-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    const ultVirgula = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.');
    if (ultVirgula > ultPonto) s = s.replace(/\./g, '').replace(',', '.');           // 1.234,56
    else if (ultPonto > ultVirgula && ultVirgula >= 0) s = s.replace(/,/g, '');       // 1,234.56
    else if (ultVirgula >= 0) s = s.replace(',', '.');                                // 12,5
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');            // 1.234.567
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function montarItem(p: { codigo?: string; titulo: string; unidade?: string; quantidade: number | null; unitario: number | null; total: number | null; origem: string }): ItemLido | null {
    const quantidade = p.quantidade && p.quantidade > 0 ? p.quantidade : (p.total && p.unitario ? arred(p.total / p.unitario) : 1);
    let unitario = p.unitario ?? (p.total != null ? arred(p.total / quantidade) : null);
    if (unitario == null || unitario < 0) return null;
    const total = p.total ?? arred(quantidade * unitario);
    if (!p.titulo.trim() || (total === 0 && unitario === 0)) return null;
    const divergente = Math.abs(arred(quantidade * unitario) - total) > Math.max(0.05, total * 0.001);
    unitario = arred(unitario);
    return {
        codigo_item: (p.codigo || '').trim().slice(0, 40),
        titulo: p.titulo.replace(/\s+/g, ' ').replace(/\s+[—–-]\s*$/, '').trim().slice(0, 300),
        unidade: (p.unidade || 'un').trim().slice(0, 12) || 'un',
        quantidade, valor_unitario: unitario, total: arred(total), origem: p.origem, divergente,
    };
}

// ── Excel ───────────────────────────────────────────────────────────────────

const COLUNA: Record<string, RegExp> = {
    codigo: /^(ITEM|COD|CODIGO|CODIGO DO ITEM|REF|#|Nº|N)$/,
    titulo: /^(SERVICO|SERVICOS|DESCRICAO|DESCRICAO DO SERVICO|DESCRICAO DOS SERVICOS|ITEM DESCRICAO|ESPECIFICACAO|SOLUCAO|ATIVIDADE)$/,
    descricao: /^(DESCRICAO|DETALHAMENTO|CONFIGURACAO|OBSERVACAO|COMPLEMENTO)$/,
    quantidade: /^(QTD|QTDE|QUANT|QUANTIDADE|QTD\.)$/,
    unidade: /^(UN|UND|UNID|UNIDADE|UNID\.)$/,
    unitario: /^(VALOR UNITARIO|VL UNIT|VL\. UNIT\.|V\. UNIT|PRECO UNITARIO|PRECO UNIT|UNITARIO|VALOR UNIT|VALOR UNIT\.|VLR UNIT|UNIT\. LIQUIDO|VALOR UNITARIO LIQUIDO)$/,
    total: /^(VALOR TOTAL|TOTAL|VL TOTAL|VLR TOTAL|PRECO TOTAL|SUBTOTAL|TOTAL LIQUIDO|VALOR)$/,
};

function acharCabecalho(linhas: unknown[][]) {
    for (let i = 0; i < Math.min(linhas.length, 40); i++) {
        const cols: Record<string, number> = {};
        linhas[i].forEach((c, j) => {
            const k = chave(c).replace(/[:]/g, '');
            if (!k) return;
            for (const [nome, re] of Object.entries(COLUNA)) {
                if (cols[nome] === undefined && re.test(k)) {
                    // "DESCRIÇÃO" serve de título se ainda não houver; senão é detalhe.
                    if (nome === 'descricao' && cols.titulo === undefined) { cols.titulo = j; return; }
                    if (nome === 'titulo' && cols.titulo !== undefined && COLUNA.descricao.test(k)) { cols.descricao = j; return; }
                    cols[nome] = j; return;
                }
            }
        });
        if (cols.titulo !== undefined && cols.quantidade !== undefined && (cols.unitario !== undefined || cols.total !== undefined)) return { linha: i, cols };
    }
    return null;
}

export function lerOrcamentoExcel(buffer: Buffer): ResultadoLeitura {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const avisos: string[] = [];
    let melhor: { aba: string; itens: ItemLido[]; total: number | null } | null = null;
    for (const aba of wb.SheetNames) {
        const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: '', raw: true });
        const cab = acharCabecalho(linhas);
        if (!cab) continue;
        const { cols } = cab;
        const itens: ItemLido[] = [];
        let total: number | null = null;
        let vazias = 0;
        for (let i = cab.linha + 1; i < linhas.length; i++) {
            const l = linhas[i];
            const texto = l.map(c => String(c ?? '').trim()).join(' ').trim();
            if (!texto) { if (++vazias > 15) break; continue; }
            vazias = 0;
            const titulo = String(l[cols.titulo] ?? '').trim();
            const qtd = lerNumero(l[cols.quantidade]);
            const unit = cols.unitario !== undefined ? lerNumero(l[cols.unitario]) : null;
            const tot = cols.total !== undefined ? lerNumero(l[cols.total]) : null;
            // Linha de total geral: guarda e segue (pode haver BDI/impostos abaixo).
            if (/^(VALOR )?TOTAL( GERAL)?$/.test(chave(texto.replace(/[\d.,R$\s]+$/g, ''))) || (!titulo && qtd == null && /TOTAL/.test(chave(texto)))) {
                const n = lerNumero(l[cols.total ?? cols.unitario!]) ?? lerNumero(texto.match(/[\d.]+,\d{2}|\d+\.\d{2}/g)?.pop());
                if (n != null) total = n;
                continue;
            }
            // Cabeçalho de bloco ("1 - MOBILIZAÇÃO"): sem quantidade nem preço.
            if (qtd == null && unit == null) continue;
            const detalhe = cols.descricao !== undefined ? String(l[cols.descricao] ?? '').trim() : '';
            const item = montarItem({
                codigo: cols.codigo !== undefined ? String(l[cols.codigo] ?? '') : '',
                titulo: titulo + (detalhe && detalhe !== titulo ? ` — ${detalhe}` : ''),
                unidade: cols.unidade !== undefined ? String(l[cols.unidade] ?? '') : '',
                quantidade: qtd, unitario: unit, total: tot, origem: `${aba}, linha ${i + 1}`,
            });
            if (item) itens.push(item);
        }
        if (itens.length && (!melhor || itens.length > melhor.itens.length)) melhor = { aba, itens, total };
    }
    if (!melhor) {
        return { formato: 'EXCEL', itens: [], soma_itens: 0, total_documento: null,
            avisos: ['Não encontrei uma tabela de itens. A planilha precisa de colunas de descrição, quantidade e valor (unitário ou total).'] };
    }
    if (wb.SheetNames.length > 1) avisos.push(`Itens lidos da aba "${melhor.aba}".`);
    return finalizar('EXCEL', melhor.itens, melhor.total, avisos);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const DINHEIRO = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+,\d{2}/g;
const UNIDADES = /^(UN|UND|UNID|VB|VERBA|M|M2|M²|M3|M³|ML|KG|T|TON|H|HR|HS|DIA|DIAS|MES|MÊS|PC|PÇ|PCT|CJ|CONJ|JG|KIT|L|LT|SV|SERV|GL|CX|PAR|ROLO|BR|KM)$/i;

export async function lerOrcamentoPdf(buffer: Buffer): Promise<ResultadoLeitura> {
    const texto = await extrairTextoPdf(buffer);
    const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const itens: ItemLido[] = [];
    let total: number | null = null;
    let ultimo: ItemLido | null = null;
    let dentroDaTabela = false;
    linhas.forEach((linha, idx) => {
        const valores = [...linha.matchAll(DINHEIRO)].map(m => ({ v: lerNumero(m[0])!, ini: m.index! }));
        const k = chave(linha);
        if (/(^| )TOTAL( GERAL| LIQUIDO| DO ORCAMENTO)?( |:|$)/.test(k) && valores.length && !/QTD|UNID/.test(k)) {
            const antes = chave(linha.slice(0, valores[0].ini));
            if (/TOTAL/.test(antes) && antes.split(' ').length <= 5) { total = valores[valores.length - 1].v; ultimo = null; return; }
        }
        if (/QTD|QUANTIDADE/.test(k) && /(VALOR|UNIT|TOTAL)/.test(k)) { dentroDaTabela = true; ultimo = null; return; }
        if (valores.length < 1) {
            // Linha quebrada da descrição (a tabela quebra o texto na coluna).
            if (dentroDaTabela && ultimo && linha.length < 120 && !/^PAGINA|^PÁGINA|^\d+\s*\/\s*\d+$/i.test(linha)) ultimo.titulo = `${ultimo.titulo} ${linha}`.slice(0, 300);
            return;
        }
        // Antes dos valores: "... descrição ... QTD UNID" (ou "UNID QTD").
        const antes = linha.slice(0, valores[0].ini).trim().split(/\s+/);
        let qtd: number | null = null, unid = '';
        for (let tentativa = 0; tentativa < 2 && antes.length; tentativa++) {
            const tk = antes[antes.length - 1];
            if (qtd == null && /^\d+(?:[.,]\d+)?$/.test(tk)) { qtd = lerNumero(tk); antes.pop(); continue; }
            if (!unid && UNIDADES.test(tk)) { unid = tk; antes.pop(); continue; }
            break;
        }
        if (qtd == null) { ultimo = null; return; }
        // Descrição: o que sobrou, sem o número de ordem do começo.
        let palavras = antes;
        let codigo = '';
        if (palavras.length && /^\d{1,4}$/.test(palavras[0])) codigo = palavras.shift()!;
        const titulo = palavras.join(' ');
        if (!titulo) { ultimo = null; return; }
        const vs = valores.map(v => v.v);
        const tot = vs[vs.length - 1];
        // Unitário: o valor que vezes a quantidade dá o total (o PDF da LS traz
        // unitário original, desconto e líquido); sem par, total ÷ quantidade.
        const unit = vs.slice(0, -1).reverse().find(u => Math.abs(arred(u * qtd!) - tot) <= 0.05) ?? (vs.length > 1 ? vs[vs.length - 2] : null);
        const item = montarItem({ codigo, titulo, unidade: unid, quantidade: qtd, unitario: unit, total: tot, origem: `linha ${idx + 1} do texto` });
        if (item) { itens.push(item); ultimo = item; dentroDaTabela = true; }
    });
    const avisos: string[] = ['PDF lido pelo texto: confira descrições, quantidades e valores antes de confirmar.'];
    if (!itens.length) avisos.unshift('Não reconheci linhas de itens neste PDF. Se ele for uma imagem (escaneado), use o Excel ou digite os itens.');
    return finalizar('PDF', itens, total, avisos);
}

function finalizar(formato: 'EXCEL' | 'PDF', itens: ItemLido[], total: number | null, avisos: string[]): ResultadoLeitura {
    const soma = arred(itens.reduce((a, i) => a + i.total, 0));
    const divergentes = itens.filter(i => i.divergente).length;
    if (divergentes) avisos.push(`${divergentes} item(ns) com total diferente de quantidade × unitário — marcados para conferir.`);
    if (total != null && Math.abs(total - soma) > 0.05) {
        avisos.push(`A soma dos itens (${soma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) é diferente do total do documento (${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Pode haver BDI, impostos ou desconto fora dos itens.`);
    }
    return { formato, itens, soma_itens: soma, total_documento: total, avisos };
}

export async function lerOrcamentoArquivo(buffer: Buffer, nome: string, mime?: string): Promise<ResultadoLeitura> {
    const ehPdf = /\.pdf$/i.test(nome) || mime === 'application/pdf' || buffer.subarray(0, 4).toString() === '%PDF';
    if (ehPdf) return lerOrcamentoPdf(buffer);
    if (/\.(xlsx|xlsm|xls|csv)$/i.test(nome)) return lerOrcamentoExcel(buffer);
    throw new Error('Formato não suportado. Envie o orçamento em Excel (.xlsx, .xls) ou PDF.');
}
