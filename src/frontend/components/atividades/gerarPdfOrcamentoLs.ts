import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_MARCA_B64 } from '../../assets/logoMarca';

// ─────────────────────────────────────────────────────────────────────────────
// PDF do Orçamento LS no modelo executivo da LS (Orçamentos/01_executivo.pdf,
// 09/10/2026): 1) capa com dados do site e resumo por grupo, 2) composição
// item a item, 3) condições comerciais e aceite do contratante.
//
// Grupo = prefixo do código do item (01.1 → 01). O título do item guarda
// "Serviço — Descrição" (é assim que a importação junta as duas colunas);
// aqui ele volta a ser separado nas duas colunas do modelo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemOrcamentoLs { codigo_item: string; titulo: string; unidade: string; quantidade: number; valor_unitario: number }

export interface DadosPdfOrcamentoLs {
    numero: string;
    escopo: string;
    contratante: string;
    site: string;
    local: string;
    acionamento: string;
    revisao: number;
    responsavel: string;
    pagamento: string;
    prazo_execucao: string;
    validade_dias: number;
    itens: ItemOrcamentoLs[];
}

const EMPRESA = [
    'LS OFFICE SERVIÇOS DE TELECOM E CONSTRUÇÕES LTDA',
    'CNPJ 19.853.545/0001-79',
    'Travessa Barão do Triunfo, 3540, Sala 2303',
    'implantacao@lsoffice.com.br | 98523-4355',
];

/** Nomes dos grupos do modelo executivo; grupo fora da lista sai como "Grupo NN". */
const GRUPOS: Record<string, string> = {
    '01': 'Mobilização',
    '02': 'Serviços',
    '03': 'Infra elétrica - fornecimento e instalação',
};

type Cor = [number, number, number];
const NAVY: Cor = [30, 45, 66];
const TEXTO: Cor = [40, 48, 60];
const MUDO: Cor = [110, 118, 130];
const LINHA: Cor = [222, 226, 232];
const ZEBRA: Cor = [240, 244, 249];
const OURO: Cor = [196, 164, 120];

const M = 18; // margem lateral
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const valor = (v: string) => (v || '').trim() || 'A definir';
// Arredonda em dois passos: 14,75 × 315,78 = 4657,755 vira 4657,7549999… em ponto flutuante.
export const totalItem = (i: { quantidade: number; valor_unitario: number }) => Math.round(Math.round(i.quantidade * i.valor_unitario * 1e6) / 1e4) / 100;

export function grupoDoItem(codigo: string) {
    const g = (codigo || '').trim().split(/[.\s]/)[0];
    return /^\d+$/.test(g) ? g.padStart(2, '0') : '—';
}

/** "Serviço — Descrição" → [serviço, descrição]. Corta no último travessão. */
export function separarServico(titulo: string): [string, string] {
    const i = titulo.lastIndexOf(' — ');
    return i > 0 ? [titulo.slice(0, i).trim(), titulo.slice(i + 3).trim()] : [titulo.trim(), ''];
}

function cabecalho(doc: jsPDF, d: DadosPdfOrcamentoLs) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY);
    doc.text('LS OFFICE', M, 16);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...TEXTO);
    doc.text('NÚMERO DO ORÇAMENTO', 122, 12);
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NAVY);
    doc.text(valor(d.numero), 123, 18.5);
    doc.setDrawColor(...LINHA).setLineWidth(0.3).line(122, 21.5, W - M, 21.5);
    doc.setDrawColor(...NAVY).setLineWidth(0.5).line(M, 25, W - M, 25);
}

function rodape(doc: jsPDF, d: DadosPdfOrcamentoLs, pagina: number) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...NAVY).setLineWidth(0.3).line(M, H - 15, W - M, H - 15);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUDO);
    doc.text(`LS OFFICE  |  ${d.site || '—'}  |  Rev. ${String(d.revisao).padStart(2, '0')}`, M, H - 10.5);
    doc.text(`Executivo  |  Página ${pagina}`, W - M, H - 10.5, { align: 'right' });
}

/** Bloco da empresa + título da seção. Devolve o y logo abaixo do subtítulo. */
function abertura(doc: jsPDF, titulo: string, subtitulo?: string) {
    try { doc.addImage(LOGO_MARCA_B64, 'PNG', M + 3, 31, 16, 16); } catch { /* sem logo: segue só com o texto */ }
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...NAVY);
    doc.text('LS OFFICE', M + 11, 51, { align: 'center' });
    doc.setFontSize(7.5).setTextColor(...TEXTO);
    EMPRESA.forEach((l, i) => doc.text(l, M + 25, 35 + i * 3.4));
    doc.setFont('helvetica', 'bold').setFontSize(23).setTextColor(...NAVY);
    doc.text(titulo, M, 66);
    if (!subtitulo) return 72;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...TEXTO);
    doc.text(subtitulo, M, 72);
    return 75;
}

function caixaTotal(doc: jsPDF, y: number, total: number) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...ZEBRA).setDrawColor(...NAVY).setLineWidth(0.3);
    doc.rect(M - 2, y, W - 2 * M + 2, 13, 'FD');
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...TEXTO);
    doc.text('VALOR TOTAL DA PROPOSTA', M, y + 7.8);
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...NAVY);
    doc.text(moeda(total), 137, y + 8.2);
    return y + 13;
}

const finalY = (doc: jsPDF) => (doc as any).lastAutoTable.finalY as number;

export function gerarPdfOrcamentoLs(d: DadosPdfOrcamentoLs) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const total = Math.round(d.itens.reduce((s, i) => s + totalItem(i), 0) * 100) / 100;
    const escopo = d.escopo.trim();
    const hoje = new Date().toLocaleDateString('pt-BR');

    // ── Página 1: capa e resumo
    let y = abertura(doc, 'Orçamento comercial', escopo || undefined);
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, textColor: TEXTO, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 }, lineColor: LINHA, lineWidth: { bottom: 0.25 } },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 70 }, 2: { cellWidth: 25 } },
        body: [
            ['CONTRATANTE', valor(d.contratante).toUpperCase(), 'SITE', valor(d.site)],
            ['LOCAL', valor(d.local).toUpperCase(), 'EMISSÃO', hoje],
            ['ACIONAMENTO', valor(d.acionamento), 'REVISÃO', String(d.revisao).padStart(2, '0')],
        ],
    });
    y = finalY(doc) + 12;
    if (escopo) {
        doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(...NAVY);
        const linhas = doc.splitTextToSize(escopo.toUpperCase(), W - 2 * M);
        doc.text(linhas, M, y);
        y += linhas.length * 5.5 + 6;
    }
    y = caixaTotal(doc, y, total) + 10;
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NAVY);
    doc.text('Resumo do investimento', M, y);

    const grupos = new Map<string, number>();
    d.itens.forEach(i => { const g = grupoDoItem(i.codigo_item); grupos.set(g, (grupos.get(g) || 0) + totalItem(i)); });
    const tabelaBase = {
        margin: { left: M, right: M, top: 32, bottom: 22 },
        theme: 'plain' as const,
        styles: { font: 'helvetica', fontSize: 8, textColor: TEXTO, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 }, lineColor: LINHA, lineWidth: { bottom: 0.25 }, valign: 'top' as const },
        headStyles: { fillColor: NAVY, textColor: [255, 255, 255] as Cor, fontStyle: 'bold' as const, fontSize: 7.5, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 } },
        alternateRowStyles: { fillColor: ZEBRA },
    };
    autoTable(doc, {
        ...tabelaBase,
        startY: y + 4,
        columnStyles: { 0: { cellWidth: 25 }, 2: { cellWidth: 40, halign: 'right' } },
        head: [['GRUPO', 'ESCOPO', 'VALOR']],
        body: [...grupos.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
            .map(([g, v]) => [g, GRUPOS[g] || (g === '—' ? 'Itens sem grupo' : `Grupo ${g}`), moeda(v)]),
    });

    // ── Página 2: composição
    doc.addPage();
    y = abertura(doc, 'Composição do orçamento', 'Itens, serviços e descrições');
    autoTable(doc, {
        ...tabelaBase,
        startY: y,
        showHead: 'everyPage',
        columnStyles: {
            0: { cellWidth: 13 }, 1: { cellWidth: 33 }, 2: { cellWidth: 48 },
            3: { cellWidth: 13 }, 4: { cellWidth: 12 }, 5: { cellWidth: 27, halign: 'right' }, 6: { halign: 'right' },
        },
        head: [['ITEM', 'SERVIÇO', 'DESCRIÇÃO', 'QTD.', 'UN.', 'UNITÁRIO', 'TOTAL']],
        body: d.itens.map(i => {
            const [servico, descricao] = separarServico(i.titulo);
            return [i.codigo_item || '—', servico, descricao, num(i.quantidade), i.unidade, moeda(i.valor_unitario), moeda(totalItem(i))];
        }),
    });
    y = finalY(doc) + 8;
    if (y + 13 > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); y = 34; }
    caixaTotal(doc, y, total);

    // ── Página 3: condições e aceite
    doc.addPage();
    y = abertura(doc, 'Condições e aceite') + 2;
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NAVY);
    doc.text('Condições comerciais', M, y);
    const campo = (rotulo: string, texto: string, x: number, yy: number, largura: number) => {
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUDO);
        doc.text(rotulo, x, yy);
        doc.setFontSize(9).setTextColor(...TEXTO);
        const linhas = doc.splitTextToSize(valor(texto), largura - 2);
        doc.text(linhas, x + 1, yy + 5);
        const base = yy + 5 + (linhas.length - 1) * 4 + 3;
        doc.setDrawColor(...OURO).setLineWidth(0.3).line(x, base, x + largura, base);
        return base;
    };
    const meia = (W - 2 * M - 8) / 2;
    const b1 = campo('Responsável LS Office', d.responsavel, M, y + 9, meia);
    const b2 = campo('Pagamento', d.pagamento, M + meia + 8, y + 9, meia);
    y = campo('Prazo de execução', d.prazo_execucao, M, Math.max(b1, b2) + 6, meia) + 6;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...TEXTO);
    doc.text(`Validade: ${d.validade_dias} DIAS. Pagamento e prazo de execução sujeitos ao preenchimento dos campos acima.`, M, y);
    autoTable(doc, {
        startY: y + 7,
        margin: { left: M, right: M },
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, textColor: TEXTO, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 }, lineColor: LINHA, lineWidth: { bottom: 0.25 } },
        body: [
            ['LS OFFICE', 'ACEITE DO CONTRATANTE'],
            ['Responsável: __________________________', 'Nome: _________________________________'],
            ['Assinatura: ___________________________', 'Data: ____/____/________'],
        ],
    });

    // Cabeçalho e rodapé em todas as páginas, já sabendo a numeração.
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
        doc.setPage(p);
        cabecalho(doc, d);
        rodape(doc, d, p);
    }

    const nomeArquivo = `Orcamento-LS-${(d.site || 'site').replace(/[^\w-]+/g, '_')}-Rev${String(d.revisao).padStart(2, '0')}.pdf`;
    doc.save(nomeArquivo);
    return doc;
}
