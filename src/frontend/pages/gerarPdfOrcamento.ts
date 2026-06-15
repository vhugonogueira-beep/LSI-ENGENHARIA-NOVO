import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { calcLegacyBudgetItemTotals, hydrateLegacyBudget, type LegacyBudget, type LegacyBudgetItem } from "../budget/legacyBudgetMath";

const EMPRESA = {
  nome: "LS OFFICE SERVIÇOS DE TELECOM E CONSTRUÇÕES LTDA",
  endereco: "Travessa Barão do Triunfo, 3540, Sala 2303",
  cnpj: "19.853.545/0001-79",
  telefone: "98523-4355",
  email: "implantacao@lsoffice.com.br",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function gerarPdfOrcamento(orc: LegacyBudget, logoBase64?: string) {
  const budget = hydrateLegacyBudget(orc);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15; // margem
  const CW = W - 2 * M; // content width
  let y = M;

  const BLUE = [43, 94, 167] as [number, number, number];
  const DARK = [26, 29, 35] as [number, number, number];
  const GRAY = [107, 114, 128] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];
  const LIGHT = [245, 247, 250] as [number, number, number];
  const GREEN = [13, 158, 116] as [number, number, number];
  const statusLabel = budget.status || "Rascunho";
  const statusColors: Record<string, [number, number, number]> = {
    "Rascunho": GRAY,
    "Validado": GREEN,
    "Enviado": BLUE,
    "Aprovado": [39, 174, 96],
    "Rejeitado": [220, 38, 38],
  };
  const statusColor = statusColors[statusLabel] || GRAY;

  // ── Helper: line ──
  const hLine = (yPos: number, color = [226, 229, 234]) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.3);
    doc.line(M, yPos, W - M, yPos);
  };

  // ── HEADER (Página Resumo) ──
  // Logo
  if (logoBase64) {
    try { doc.addImage(logoBase64, "PNG", M, y, 30, 30); } catch {}
  }

  // Company info — à direita do logo
  const txtX = M + 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.text(EMPRESA.nome, txtX, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(EMPRESA.endereco, txtX, y + 13);
  doc.text(EMPRESA.cnpj, txtX, y + 17);
  doc.text(`${EMPRESA.telefone} · ${EMPRESA.email}`, txtX, y + 21);
  y += 32;
  hLine(y);
  y += 4;

  // ── TÍTULO "Orçamento" ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("Orçamento", W / 2, y + 4, { align: "center" });
  const statusBadgeWidth = Math.max(28, doc.getTextWidth(statusLabel.toUpperCase()) + 10);
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(W - M - statusBadgeWidth, y, statusBadgeWidth, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(statusLabel.toUpperCase(), W - M - (statusBadgeWidth / 2), y + 4.7, { align: "center" });
  y += 8;
  hLine(y);
  y += 3;

  // ── INFO DO ORÇAMENTO (tabela label/valor) ──
  const si = budget.siteInfo || {};
  const contratante = budget.contratante || si.nomeDetentora || si.operadora || "—";
  const objeto = budget.objeto || budget.area || "—";
  const endereco = si.endereco || `${si.municipio || ""}${si.uf ? " - " + si.uf : ""}` || "—";
  const idSite = si.siteId ? `${si.siteId}${si.operadora ? " " + si.operadora : ""}${si.nomeDetentora ? " - " + si.nomeDetentora : ""}` : "—";
  const vigencia = budget.vigencia || "10 DIAS";
  const dataOrc = budget.data || new Date().toLocaleDateString("pt-BR");

  const infoRows = [
    ["Contratante", contratante],
    ["Objeto", objeto],
    ["Endereço", endereco],
    ["ID Site", idSite],
    ["Desconto (%)", `${budget.discount || 0}%`],
    ["Desconto (R$)", fmt(budget.discountValue || 0)],
    ["Valor Bruto", fmt(budget.totalBruto || 0)],
    ["Valor Líquido", fmt(budget.totalLiquido || 0)],
    ["Valor da Proposta", fmt(budget.totalFinal || 0)],
    ["Vigência da Proposta", vigencia],
  ];

  autoTable(doc, {
    startY: y,
    body: infoRows,
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 }, textColor: DARK },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 42, textColor: GRAY },
      1: { fontStyle: "normal" },
    },
    didParseCell: (data) => {
      if (data.column.index === 0) {
        data.cell.styles.fillColor = LIGHT;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY;

  // DATA no canto direito
  doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.roundedRect(W - M - 40, y - 12, 40, 10, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text("DATA", W - M - 35, y - 7);
  doc.setFontSize(8);
  doc.text(dataOrc, W - M - 10, y - 7, { align: "right" });
  y += 4;

  hLine(y);
  y += 4;

  // ── RESUMO ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("Resumo", W / 2, y + 3, { align: "center" });
  y += 7;

  // Agrupar itens por categoria (resumo)
  const groups: Record<string, { itens: LegacyBudgetItem[]; total: number }> = {};
  (budget.itens || []).forEach(item => {
    const cat = item.resumo || "GERAL";
    if (!groups[cat]) groups[cat] = { itens: [], total: 0 };
    groups[cat].itens.push(item);
    groups[cat].total += calcLegacyBudgetItemTotals(item, budget).totalFinal;
  });

  const resumoRows = Object.entries(groups).map(([cat, g], i) => [
    String(i + 1).padStart(3, "0"),
    cat.toUpperCase(),
    fmt(g.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "DESCRIÇÃO", "VALOR"]],
    body: resumoRows,
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK, lineColor: [226, 229, 234], lineWidth: 0.3 },
    headStyles: { fillColor: LIGHT, textColor: DARK, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 15, halign: "center", fontStyle: "bold" },
      1: { fontStyle: "bold" },
      2: { cellWidth: 35, halign: "right", textColor: GREEN, fontStyle: "bold" },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 2;

  // TARJA FINAL (DESCONTO)
  autoTable(doc, {
    startY: y,
    body: [
      ["TOTAL BRUTO", fmt(budget.totalBruto || 0)],
      [`(-) DESCONTO ${budget.discount || 0}%`, fmt(budget.discountValue || 0)],
      ["TOTAL LÍQUIDO FINAL", fmt(budget.totalLiquido || 0)],
    ],
    theme: "plain",
    margin: { left: W - M - 90, right: M },
    styles: { fontSize: 9.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: DARK, fillColor: LIGHT, cellWidth: 48 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 42 },
    },
    didParseCell: (data) => {
      if (data.row.index === 1 && data.column.index === 1) {
        data.cell.styles.textColor = [220, 38, 38];
      }
      if (data.row.index === 2) {
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fillColor = BLUE;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── ASSINATURA ──
  if (y < H - 50) {
    const sigY = Math.max(y + 10, H - 55);
    hLine(sigY, [180, 180, 180]);
    doc.setDrawColor(100, 100, 100);
    doc.line(W / 2 - 30, sigY + 15, W / 2 + 30, sigY + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    doc.text("LS OFFICE", W / 2, sigY + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(`CNPJ: ${EMPRESA.cnpj}`, W / 2, sigY + 24, { align: "center" });
  }

  // ════════════════════════════════════════════════
  // PÁGINA 2 — DETALHAMENTO
  // ════════════════════════════════════════════════
  doc.addPage();
  y = M;

  // Header page 2
  if (logoBase64) {
    try { doc.addImage(logoBase64, "PNG", M, y, 26, 26); } catch {}
  }
  const txtX2 = M + 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.text(EMPRESA.nome, txtX2, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(EMPRESA.endereco, txtX2, y + 11);
  doc.text(`${EMPRESA.cnpj} · ${EMPRESA.telefone} · ${EMPRESA.email}`, txtX2, y + 15);
  y += 28;
  hLine(y);
  y += 3;

  // Info resumida
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text("Orçamento", W / 2, y + 3, { align: "center" });
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(W - M - statusBadgeWidth, y - 1, statusBadgeWidth, 6.5, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(statusLabel.toUpperCase(), W - M - (statusBadgeWidth / 2), y + 3.3, { align: "center" });
  y += 7;

  const infoRows2 = [
    ["Contratante", contratante],
    ["Assunto", objeto],
    ["Endereço", endereco],
    ["ID Site", idSite],
    ["Desconto (%)", `${budget.discount || 0}%`],
    ["Desconto (R$)", fmt(budget.discountValue || 0)],
    ["Valor Bruto", fmt(budget.totalBruto || 0)],
    ["Valor Líquido", fmt(budget.totalLiquido || 0)],
    ["Valor da Proposta", fmt(budget.totalFinal || 0)],
    ["Vigência da Proposta", vigencia],
  ];

  autoTable(doc, {
    startY: y,
    body: infoRows2,
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 4, right: 4 }, textColor: DARK },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 38, textColor: GRAY, fillColor: LIGHT },
    },
  });
  y = (doc as any).lastAutoTable.finalY;

  // DATA
  doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.roundedRect(W - M - 38, y - 10, 38, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text("DATA", W - M - 33, y - 5.5);
  doc.setFontSize(7.5);
  doc.text(dataOrc, W - M - 3, y - 5.5, { align: "right" });
  y += 3;

  // ── TABELA DETALHADA ──
  // Header da tabela
  const tableHead = [["ITEM", "CATEGORIA", "DESCRIÇÃO", "CONFIG.", "QTD", "UNID", "VL UNITÁRIO", "DESC. R$", "VL UNIT. C/DESC", "VL TOTAL"]];

  let itemCounter = 0;
  const allRows: any[] = [];

  Object.entries(groups).forEach(([cat, g]) => {
    g.itens.forEach((item) => {
      itemCounter++;
      const subNum = String(itemCounter).padStart(2, "0");
      const itemTotals = calcLegacyBudgetItemTotals(item, budget);

      allRows.push([
        subNum,
        cat.toUpperCase(),
        item.solucao || item.cod,
        item.config || "—",
        String(item.qtde || 1),
        item.unid || "vb",
        fmt(itemTotals.unitOriginal),
        fmt(itemTotals.discountUnit),
        fmt(itemTotals.unitNet),
        fmt(itemTotals.totalLiquido),
      ]);
    });
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: allRows,
    theme: "grid",
    margin: { left: M, right: M },
    styles: {
      fontSize: 7, cellPadding: 2, textColor: DARK,
      lineColor: [226, 229, 234], lineWidth: 0.2, overflow: "linebreak",
    },
    headStyles: {
      fillColor: LIGHT, textColor: DARK, fontStyle: "bold", fontSize: 6.5,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },      // ITEM
      1: { cellWidth: 20 },                      // CATEGORIA
      2: { cellWidth: "auto" },                  // DESCRIÇÃO
      3: { cellWidth: 30 },                      // CONFIG.
      4: { cellWidth: 8, halign: "center" },      // QTD
      5: { cellWidth: 10, halign: "center" },     // UNID
      6: { cellWidth: 22, halign: "right" },      // VL UNITÁRIO
      7: { cellWidth: 18, halign: "right" },      // DESC. R$
      8: { cellWidth: 22, halign: "right" },      // VL UNIT. C/DESC
      9: { cellWidth: 22, halign: "right" },      // VL TOTAL
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.section === "body") {
        data.cell.styles.textColor = [220, 38, 38];
      }
      if (data.column.index === 9 && data.section === "body") {
        data.cell.styles.textColor = GREEN;
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 6 && data.section === "body") {
        data.cell.styles.textColor = GRAY;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // TARJA FINAL (DESCONTO)
  autoTable(doc, {
    startY: y,
    body: [
      ["TOTAL BRUTO", fmt(budget.totalBruto || 0)],
      [`(-) DESCONTO ${budget.discount || 0}%`, fmt(budget.discountValue || 0)],
      ["TOTAL LÍQUIDO FINAL", fmt(budget.totalLiquido || 0)],
    ],
    theme: "plain",
    margin: { left: W - M - 90, right: M },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 48, fillColor: LIGHT, fontStyle: "bold" },
      1: { cellWidth: 42, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === 1 && data.column.index === 1) {
        data.cell.styles.textColor = [220, 38, 38];
      }
      if (data.row.index === 2) {
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fillColor = BLUE;
      }
    },
  });

  // ── Footer ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`LS Office ERP · Página ${i}/${totalPages}`, W / 2, H - 5, { align: "center" });
  }

  // ── Save ──
  const filename = `Orcamento_${(si.siteId || budget.id).replace(/\s/g, "_")}_${dataOrc.replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}
