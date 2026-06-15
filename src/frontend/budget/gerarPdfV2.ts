import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Budget, calcItemFinancials } from "./types";

// ══════════════════════════════════════════════════════════════
// DESIGN SYSTEM — CORES E CONSTANTES CORPORATIVAS
// ══════════════════════════════════════════════════════════════
const C = {
  primary:    [26, 43, 74] as [number, number, number],     // #1A2B4A
  accent:     [46, 109, 180] as [number, number, number],   // #2E6DB4
  headerBg:   [52, 78, 110] as [number, number, number],    // #344E6E
  dark:       [30, 30, 35] as [number, number, number],
  text:       [55, 65, 81] as [number, number, number],     // #374151
  muted:      [107, 114, 128] as [number, number, number],  // #6B7280
  border:     [203, 213, 224] as [number, number, number],  // #CBD5E0
  lightBg:    [247, 249, 252] as [number, number, number],  // #F7F9FC
  infoBg:     [240, 244, 250] as [number, number, number],  // #F0F4FA
  white:      [255, 255, 255] as [number, number, number],
  capex:      [46, 109, 180] as [number, number, number],   // blue
  opex:       [230, 126, 34] as [number, number, number],   // #E67E22
  total:      [39, 174, 96] as [number, number, number],    // #27AE60
  red:        [220, 38, 38] as [number, number, number],    // #DC2626
  subtotalBg: [232, 239, 248] as [number, number, number],  // #E8EFF8
};

const EMPRESA = {
  nome: "LS OFFICE SERVIÇOS DE TELECOM E CONSTRUÇÕES LTDA",
  marca: "LSI Engenharia",
  subtitulo: "Sistema de Gestão ERP",
  endereco: "Travessa Barão do Triunfo, 3540, Sala 2303",
  cnpj: "19.853.545/0001-79",
  telefone: "(98) 98523-4355",
  email: "implantacao@lsoffice.com.br",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v}%`;

const formatProjectLabel = (value?: string) => {
  if (!value) return "—";
  const labelMap: Record<string, string> = {
    manutencao: "Manutenção",
    implantacao: "Implantação",
    manutencao_preventiva: "Manutenção Preventiva",
    manutencao_corretiva: "Manutenção Corretiva",
    manutencao_emergencial: "Manutenção Emergencial",
    vistoria_tecnica: "Vistoria Técnica",
    manutencao_geral: "Manutenção Geral",
    bts: "BTS",
    rt: "RT",
    collo: "Collo",
    sls: "SLS",
    adequacao_infra: "Adequação de Infra",
  };
  return labelMap[value] || value.charAt(0).toUpperCase() + value.slice(1);
};

// ══════════════════════════════════════════════════════════════
// HELPER: Cabeçalho corporativo (35mm)
// ══════════════════════════════════════════════════════════════
function drawCorporateHeader(
  doc: jsPDF, logo: string | undefined, budget: Budget,
  M: number, isFirstPage: boolean
): number {
  const W = doc.internal.pageSize.getWidth();
  const CW = W - 2 * M;
  let y = M;
  const headerH = isFirstPage ? 35 : 18;

  if (isFirstPage) {
    // ── PRIMEIRA PÁGINA: Header completo ──

    // Fundo sutil do cabeçalho
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.rect(M, y, CW, headerH, "F");

    // COLUNA ESQUERDA (40%): Logo + marca
    const leftW = CW * 0.38;
    if (logo) {
      try { doc.addImage(logo, "PNG", M + 4, y + 3, 22, 22); } catch {}
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text(EMPRESA.marca, M + 28, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(EMPRESA.subtitulo, M + 28, y + 17);

    // Linha vertical separadora
    const divX = M + leftW;
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.4);
    doc.line(divX, y + 4, divX, y + headerH - 4);

    // COLUNA DIREITA (60%): Título do documento
    const rightX = divX + 8;
    const rightW = CW - leftW - 8;
    const rightCenter = rightX + rightW / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text("ORÇAMENTO TÉCNICO", rightCenter, y + 10, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(C.text[0], C.text[1], C.text[2]);
    doc.text(budget.id, rightCenter, y + 16, { align: "center" });

    doc.setFontSize(8);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`Emitido em: ${budget.data || new Date().toLocaleDateString("pt-BR")}`, rightCenter, y + 21, { align: "center" });

    // Status badge
    const st = budget.status || "Rascunho";
    const stColors: Record<string, [number, number, number]> = {
      "Rascunho": [107, 114, 128], "Validado": [13, 158, 116], "Enviado": [46, 109, 180],
      "Aprovado": [39, 174, 96], "Rejeitado": [220, 38, 38],
    };
    const stC = stColors[st] || stColors["Rascunho"];
    const stW = doc.getTextWidth(st) + 10;
    doc.setFillColor(stC[0], stC[1], stC[2]);
    doc.roundedRect(rightCenter - stW / 2, y + 24, stW, 6, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(st.toUpperCase(), rightCenter, y + 28.2, { align: "center" });

    y += headerH;
  } else {
    // ── PÁGINAS SEGUINTES: Header compacto ──
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.rect(M, y, CW, headerH, "F");

    if (logo) {
      try { doc.addImage(logo, "PNG", M + 3, y + 2, 14, 14); } catch {}
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text(EMPRESA.marca, M + 19, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`${EMPRESA.cnpj} · ${EMPRESA.telefone}`, M + 19, y + 12);

    // ID do orçamento à direita
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text(budget.id, W - M - 2, y + 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(budget.data || "", W - M - 2, y + 12, { align: "right" });

    y += headerH;
  }

  // Linha divisória primária
  doc.setDrawColor(C.primary[0], C.primary[1], C.primary[2]);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);

  return y + 4;
}

// ══════════════════════════════════════════════════════════════
// HELPER: Footer
// ══════════════════════════════════════════════════════════════
function drawFooter(doc: jsPDF, M: number) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const tp = doc.getNumberOfPages();
  for (let i = 1; i <= tp; i++) {
    doc.setPage(i);
    // Linha
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.3);
    doc.line(M, H - 12, W - M, H - 12);
    // Texto esquerda
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`${EMPRESA.nome} · CNPJ: ${EMPRESA.cnpj} · ${EMPRESA.email}`, M, H - 8);
    // Página direita
    doc.text(`Página ${i} de ${tp}`, W - M, H - 8, { align: "right" });
  }
}

// ══════════════════════════════════════════════════════════════
// GERADOR PRINCIPAL
// ══════════════════════════════════════════════════════════════
export function gerarPdfBudgetV2(budget: Budget, logoBase64?: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const CW = W - 2 * M;
  let y = M;

  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

  const calcItemValues = (item) => {
    const financials = calcItemFinancials(item);
    return {
      unitBase: round2(financials.unitBase),
      unitDesc: round2(financials.discountUnit),
      unitNet: round2(financials.unitNet),
      totalBase: round2(financials.totalBase),
      totalDesc: round2(financials.totalDiscount),
      totalNet: round2(financials.totalNet),
      descPct: round2(financials.discountPct),
    };
  };

  const calcBlocoTotalsPdf = (bl) => {
    return bl.itens.reduce(
      (acc, item) => {
        const v = calcItemValues(item);
        acc.gross += v.totalBase;
        acc.discount += v.totalDesc;
        acc.net += v.totalNet;
        return acc;
      },
      { gross: 0, discount: 0, net: 0 }
    );
  };

  const getBlocoDiscountLabel = (bl) => {
    if (!bl.itens || bl.itens.length === 0) return "0%";
    const firstPct = round2(calcItemValues(bl.itens[0]).descPct);
    const samePct = bl.itens.every(item => round2(calcItemValues(item).descPct) === firstPct);
    return samePct ? `${firstPct}%` : "Variável por item";
  };

  const totals = budget.blocos.reduce(
    (acc, bl) => {
      const t = calcBlocoTotalsPdf(bl);
      if (bl.tipo === "implantacao") acc.totalCapex += t.net;
      else acc.totalOpex += t.net;
      acc.totalGeral += t.net;
      acc.totalBruto += t.gross;
      acc.totalDesconto += t.discount;
      return acc;
    },
    { totalCapex: 0, totalOpex: 0, totalGeral: 0, totalBruto: 0, totalDesconto: 0 }
  );
  const si = budget.siteInfo || {} as any;

  // ══════════════════════════════════════════
  // PÁGINA 1 — CAPA E RESUMO
  // ══════════════════════════════════════════
  y = drawCorporateHeader(doc, logoBase64, budget, M, true);

  // ── BLOCO DE IDENTIFICAÇÃO DO CLIENTE/SITE ──
  doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
  doc.setLineWidth(0.5);
  doc.setFillColor(C.infoBg[0], C.infoBg[1], C.infoBg[2]);
  doc.roundedRect(M, y, CW, 44, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
  doc.text("CLIENTE:", M + 5, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(C.text[0], C.text[1], C.text[2]);
  doc.text(budget.contratante || si.sharingNome || si.operadora || "—", M + 42, y + 6);

  // Info em 2 colunas
  const col1X = M + 5;
  const col2X = M + CW / 2 + 5;
  const infoY = y + 12;

  const infoItems = [
    { l: "Assunto:", v: budget.objeto || "—", x: col1X },
    { l: "ID Interno:", v: si.siteId || "—", x: col2X },
    { l: "Endereço:", v: si.endereco || `${si.municipio || ""} - ${si.uf || ""}`.trim() || "—", x: col1X },
    { l: "ID Sharing:", v: si.siteIdSharing || "—", x: col2X },
    { l: "Categoria:", v: formatProjectLabel(si.categoriaProjeto), x: col1X },
    { l: "ID Operadora:", v: si.siteIdOperadora || "—", x: col2X },
    { l: "Tipo:", v: formatProjectLabel(si.tipoProjeto), x: col1X },
    { l: "Vigência:", v: budget.vigencia || "10 dias", x: col2X },
    { l: "Latitude:", v: si.latitude || "—", x: col1X },
    { l: "Longitude:", v: si.longitude || "—", x: col2X },
  ];

  doc.setFontSize(7.5);
  const colMaxW = CW / 2 - 12; // largura máxima do valor por coluna
  infoItems.forEach((item, i) => {
    const row = Math.floor(i / 2);
    const iy = infoY + row * 5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(item.l, item.x, iy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C.text[0], C.text[1], C.text[2]);
    const labelW = doc.getTextWidth(item.l) + 2;
    const availW = colMaxW - labelW;
    const val = doc.splitTextToSize(item.v, availW)[0] as string; // apenas 1 linha
    doc.text(val, item.x + labelW, iy);
  });

  y += 49;

  // ── BLOCO DE RESUMO FINANCEIRO (TOTAL BRUTO / DESCONTO / TOTAL LÍQUIDO) ──
  const resumoX = W - M - 70;
  const resumoW = 70;
  const resumoH = 28;
  doc.setFillColor(C.white[0], C.white[1], C.white[2]);
  doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(resumoX, y, resumoW, resumoH, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  doc.text("TOTAL BRUTO", resumoX + 4, y + 8);
  doc.setTextColor(C.text[0], C.text[1], C.text[2]);
  doc.text(fmt(totals.totalBruto), resumoX + resumoW - 4, y + 8, { align: "right" });

  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  doc.text("(-) DESCONTO", resumoX + 4, y + 16);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  doc.text(`-${fmt(totals.totalDesconto)}`, resumoX + resumoW - 4, y + 16, { align: "right" });

  doc.setFillColor(C.total[0], C.total[1], C.total[2]);
  doc.rect(resumoX + 0.5, y + resumoH - 5.2, resumoW - 1, 4.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL LÍQUIDO", resumoX + 4, y + resumoH - 1.5);
  doc.text(fmt(totals.totalGeral), resumoX + resumoW - 4, y + resumoH - 1.5, { align: "right" });

  y += resumoH + 6;

  // ── TABELA DE RESUMO POR SHARING ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
  doc.text("RESUMO POR SHARING", M, y + 3);
  y += 6;

  const resumoHead = [["SHARING", "TIPO", "CUSTO DIRETO", "DESCONTO", "TOTAL"]];
  const resumoBody: any[] = budget.blocos.map(bl => {
    const t = calcBlocoTotalsPdf(bl);
    return [
      bl.sharingNome,
      bl.tipo === "implantacao" ? "Implantação" : "Operação",
      fmt(t.gross),
      fmt(t.discount),
      fmt(t.net),
    ];
  });

  // Total geral
  resumoBody.push(["", "", "", "TOTAL GERAL", fmt(totals.totalGeral)]);

  const nBlocos = budget.blocos.length;

  autoTable(doc, {
    startY: y,
    head: resumoHead,
    body: resumoBody,
    theme: "grid",
    margin: { left: M, right: M },
    styles: {
      fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: C.text, lineColor: C.border, lineWidth: 0.3,
    },
    headStyles: {
      fillColor: C.primary, textColor: C.white, fontStyle: "bold",
      fontSize: 7.5, halign: "center", cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold" },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const ri = data.row.index;
      // Linhas de dados alternadas
      if (ri < nBlocos && ri % 2 === 1) {
        data.cell.styles.fillColor = C.lightBg;
      }
      // TOTAL GERAL (última linha)
      if (ri === resumoBody.length - 1) {
        data.cell.styles.fillColor = C.primary;
        data.cell.styles.textColor = C.white;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
      }
    },
    tableLineColor: C.primary,
    tableLineWidth: 0.6,
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── ASSINATURA ──
  const sigY = Math.max(y + 15, H - 45);
  if (sigY < H - 20) {
    doc.setDrawColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.setLineWidth(0.4);
    doc.line(W / 2 - 28, sigY, W / 2 + 28, sigY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.text("LS OFFICE", W / 2, sigY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`CNPJ: ${EMPRESA.cnpj}`, W / 2, sigY + 9, { align: "center" });
    doc.text(EMPRESA.endereco, W / 2, sigY + 13, { align: "center" });
  }

  // ══════════════════════════════════════════
  // PÁGINAS SEGUINTES — DETALHAMENTO POR BLOCO
  // ══════════════════════════════════════════
  budget.blocos.forEach((bl) => {
    doc.addPage();
    y = drawCorporateHeader(doc, logoBase64, budget, M, false);

    // ── Título do bloco ──
    doc.setFillColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.roundedRect(M, y, CW, 9, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${bl.sharingNome}  ·  ${bl.tipo === "implantacao" ? "IMPLANTAÇÃO (CAPEX)" : "OPERAÇÃO (OPEX)"}  ·  ${bl.itens.length} ITENS`,
      M + 5, y + 6
    );
    y += 13;

    // ── Info do bloco ──
    const totalsBl = calcBlocoTotalsPdf(bl);
    const blInfo = [
      ["Contratante", budget.contratante || si.sharingNome || "—"],
      ["Site ID Sharing", si.siteIdSharing || "—"],
      ["Site ID Operada", si.siteIdOperadora || "—"],
      ["Desconto (%)", getBlocoDiscountLabel(bl)],
      ["Desconto (R$)", fmt(totalsBl.discount)],
    ];

    autoTable(doc, {
      startY: y,
      body: blInfo,
      theme: "plain",
      margin: { left: M, right: M + 80 },
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, textColor: C.text },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 34, textColor: C.muted, fillColor: C.lightBg },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // ── Tabela única de itens ──
    // \u00a0 = espaço não-quebrável — impede quebra de linha nos cabeçalhos compostos
    const itemHead = [["ITEM", "CATEGORIA", "DESCRIÇÃO", "CONFIG.", "QTD", "UN", "VLM", "DESC.\u00a0R$", "VL\u00a0LIQ.", "VL\u00a0TOTAL"]];
    let itemCounter = 0;
    const itemBody = bl.itens.map(item => {
      itemCounter++;
      const v = calcItemValues(item);
      return [
        String(itemCounter).padStart(2, "0"),
        (item.categoria || "GERAL").toUpperCase(),
        item.descricao.substring(0, 60) + (item.descricao.length > 60 ? "…" : ""),
        (item.config || "—").substring(0, 24),
        String(item.qtde),
        item.unid,
        fmt(v.unitBase),
        fmt(v.unitDesc),
        fmt(v.unitNet),
        fmt(v.totalNet),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: itemHead,
      body: itemBody,
      theme: "grid",
      margin: { left: M, right: M },
      tableWidth: CW,
      styles: {
        fontSize: 6.2, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: C.text, lineColor: C.border, lineWidth: 0.15,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: C.primary, textColor: C.white, fontStyle: "bold",
        fontSize: 6.2, halign: "center",
      },
      columnStyles: {
        // Total fixo: 8+20+24+8+8+22+18+20+22 = 150mm → auto (DESCRIÇÃO) = 30mm → total 180mm
        0: { cellWidth: 10, halign: "center", fontStyle: "bold", textColor: C.accent }, // ITEM
        1: { cellWidth: 20, halign: "center" },  // CATEGORIA
        2: { cellWidth: "auto", halign: "left" }, // DESCRIÇÃO
        3: { cellWidth: 24, halign: "center" },   // CONFIG.
        4: { cellWidth: 10, halign: "center" },  // QTD
        5: { cellWidth: 10, halign: "center" },  // UN
        6: { cellWidth: 18, halign: "center" },  // VLM
        7: { cellWidth: 18, halign: "center", textColor: C.red }, // DESC. R$
        8: { cellWidth: 20, halign: "center" },  // VL LIQ.
        9: { cellWidth: 22, halign: "center", fontStyle: "bold", textColor: C.primary }, // VL TOTAL
      },
      didParseCell: (data) => {
        if (data.column.index === 2) {
          data.cell.styles.halign = "left";
        } else {
          data.cell.styles.halign = "center";
        }
        if (data.section === "body" && data.row.index % 2 === 1) {
          data.cell.styles.fillColor = C.lightBg;
        }
      },
      tableLineColor: C.primary,
      tableLineWidth: 0.4,
    });
    y = (doc as any).lastAutoTable.finalY;

    // ── TOTAL DO BLOCO ──
    const totalBrutoBloco = totalsBl.gross;
    const totalBloco = totalsBl.net;

    y += 2;
    // Total bruto — largura total, label esquerda, valor direita
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.roundedRect(M, y, CW, 7, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text("Total Bruto:", M + 5, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(C.text[0], C.text[1], C.text[2]);
    doc.text(fmt(totalBrutoBloco), W - M - 5, y + 5, { align: "right" });
    y += 8;

    // Total com desconto — largura total, label esquerda, valor direita
    doc.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
    doc.roundedRect(M, y, CW, 9, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C.white[0], C.white[1], C.white[2]);
    const totalLabel = "TOTAL FINAL";
    doc.text(totalLabel, M + 5, y + 6);
    doc.setFontSize(10);
    doc.text(fmt(totalBloco), W - M - 5, y + 6, { align: "right" });
  });

  // ── FOOTER em todas as páginas ──
  drawFooter(doc, M);

  // ── SALVAR ──
  const filename = `Orcamento_${(si.siteId || budget.id).replace(/[^a-zA-Z0-9_-]/g, "_")}_${(budget.data || "").replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}
