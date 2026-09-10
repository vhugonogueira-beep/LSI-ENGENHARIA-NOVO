import { BudgetService, calcularValorUnitarioFinal } from './budget.service';
import { prisma } from '../server';
import ExcelJS from 'exceljs';

type ExportSiteContext = {
  id: string;
  endereco: string;
  cidade: string;
  uf: string;
  localizacao: string;
};

type ExportBlockGroup = {
  id: string;
  sequence: string;
  label: string;
  items: any[];
  subtotal: number;
};

const LEGACY_BLOCK_LABELS: Record<string, string> = {
  MOBILIZACAO: 'MOBILIZAÇÃO',
  SERVICOS: 'SERVIÇOS',
  INFRA: 'INFRA - FORNECIMENTO E INSTALAÇÃO',
};

function resolveSiteContext(budget: any): ExportSiteContext {
  const atividade = budget.atividade;
  const legacySite = budget.site;
  const value = (candidate: unknown) => typeof candidate === 'string' ? candidate.trim() : '';

  const id = value(atividade?.id_site_sharing)
    || value(atividade?.id_site_operadora)
    || value(atividade?.codigo)
    || value(legacySite?.id_site)
    || 'N/A';
  const endereco = value(atividade?.endereco) || value(legacySite?.endereco);
  const cidade = value(atividade?.municipio)
    || value(atividade?.cidade)
    || value(legacySite?.cidade);
  const uf = value(atividade?.estado)
    || value(atividade?.uf)
    || value(legacySite?.uf);
  const cidadeUf = cidade && uf ? `${cidade}-${uf}` : cidade || uf;

  return {
    id,
    endereco,
    cidade,
    uf,
    localizacao: [endereco, cidadeUf].filter(Boolean).join(' - ') || 'N/A',
  };
}

function groupActiveItems(items: any[]): ExportBlockGroup[] {
  const groups = new Map<string, Omit<ExportBlockGroup, 'sequence'>>();

  for (const item of items) {
    if (!item.ativo) continue;

    const id = typeof item.bloco === 'string' && item.bloco.trim()
      ? item.bloco.trim()
      : 'OUTROS';
    let group = groups.get(id);

    if (!group) {
      group = {
        id,
        label: LEGACY_BLOCK_LABELS[id] || id,
        items: [],
        subtotal: 0,
      };
      groups.set(id, group);
    }

    group.items.push(item);
    group.subtotal = Math.round((group.subtotal + Number(item.total_linha || 0)) * 100) / 100;
  }

  return Array.from(groups.values()).map((group, index) => ({
    ...group,
    sequence: String(index + 1).padStart(2, '0'),
  }));
}

export class ExportService {
  static async genterateHTML(budgetId: string): Promise<string> {
    const budget: any = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: {
        contratante: true,
        site: true,
        atividade: true,
        items: { orderBy: { ordem: 'asc' } },
        versions: true,
        supplier: true,
      }
    });
    if (!budget) throw new Error("Budget not found");

    const totals = BudgetService.calcularOrcamento(budget.items);
    const blockGroups = groupActiveItems(totals.itensDelineados);

    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const formatRow = (item: any) => `
      <tr class="block-row">
        <td style="width: 50px; text-align: center;">${item.codigo_item}</td>
        <td style="padding-left: 10px; font-weight: 600;">${item.titulo}</td>
        <td style="width: 250px;">${item.descricao || ''}</td>
        <td style="width: 40px; text-align: center; font-weight: bold;">${item.quantidade}</td>
        <td style="width: 50px; text-align: center; font-weight: bold;">${item.unidade}</td>
        <td style="width: 90px; text-align: right;">R$ <span style="float: right;">${formatter.format(calcularValorUnitarioFinal(item)).replace('R$', '').trim()}</span></td>
        <td style="width: 90px; text-align: right; padding-right: 5px;">R$ <span style="float: right;">${formatter.format(item.total_linha).replace('R$', '').trim()}</span></td>
      </tr>
    `;

    const renderBlock = (block: ExportBlockGroup) => `
          <table class="block-table">
            <thead>
              <tr class="block-header">
                <th style="width: 50px; text-align: center;">${block.sequence}</th>
                <th colspan="3" style="text-align: center;">${block.label}</th>
                <th colspan="3" style="text-align: right; background-color: #b91c1c; color: white;">R$ ${formatter.format(block.subtotal).replace('R$', '').trim()}</th>
              </tr>
            </thead>
            <tbody>
              ${block.items.map(formatRow).join('')}
            </tbody>
          </table>
          <div style="height: 12px;"></div>
        `;

    const dataEntrega = new Date(budget.updated_at);
    dataEntrega.setDate(dataEntrega.getDate() + budget.vigencia_dias);

    const contratante = budget.contratante as any;
    const supplier = budget.supplier as any;
    const siteContext = resolveSiteContext(budget);

    // Build supplier logo HTML
    const supplierLogoHtml = supplier?.logo_url
      ? `<div class="logo-supplier"><img src="${supplier.logo_url}" alt="${supplier.nome}"></div>`
      : '';

    // Build supplier info for header if available
    const supplierInfoHtml = supplier
      ? `<tr>
            <td class="info-label">Fornecedor</td>
            <td class="info-value" colspan="2">${supplier.nome}${supplier.cnpj ? ' - ' + supplier.cnpj : ''}</td>
            <td style="width: 120px; background: white; border: none;"></td>
          </tr>`
      : '';

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Orçamento - ${contratante.nome}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: Arial, sans-serif; color: #000; line-height: 1.3; margin: 0; padding: 20px; background-color: #fff; font-size: 11px; }
          .container { max-width: 800px; margin: 0 auto; border: 1px solid #ccc; padding: 15px; }
          
          /* Header Logos */
          .header-logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
          .logo-ls { width: 160px; }
          .logo-ls img { max-width: 100%; height: auto; }
          .header-text { text-align: center; flex-grow: 1; }
          .header-text h1 { font-size: 16px; margin: 0; padding: 0; font-weight: bold; }
          .header-text p { margin: 2px 0; font-size: 11px; }
          .logo-client { width: 140px; text-align: right; }
          .logo-client img { max-width: 100%; max-height: 80px; object-fit: contain; }
          .logo-supplier { width: 120px; text-align: center; }
          .logo-supplier img { max-width: 100%; max-height: 60px; object-fit: contain; }

          /* Generic title strip */
          .title-strip { background-color: #002060; color: #fff; text-align: center; font-weight: bold; padding: 4px; font-size: 13px; margin-bottom: 10px; }

          /* Info Table */
          .info-table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 10px; font-weight: bold; }
          .info-table td { padding: 4px 8px; border: 1px solid #fff; }
          .info-label { background-color: #4b6b9e; color: #fff; width: 140px; text-align: center; border-right: 2px solid white; border-bottom: 2px solid white; }
          .info-value { text-align: center; background-color: #e2e8f0; border-bottom: 2px solid white; }
          .info-value-dark { background-color: #002060; color: white; border: 1px solid #fff; text-align: center; width: 120px; }
          .info-value-red { background-color: #b91c1c; color: white; border: 1px solid #fff; text-align: center; width: 120px; }

          /* Main items table header */
          .main-table-header { border-collapse: collapse; width: 100%; border: 1px solid #000; font-size: 10px; font-weight: bold; margin-bottom: 5px; }
          .main-table-header th { padding: 4px; text-align: center; border: 1px solid #000; }

          /* Block table */
          .block-table { border-collapse: collapse; width: 100%; border: 1px solid #999; font-size: 10px; }
          .block-header th { background-color: #002060; color: #fff; padding: 4px; font-weight: bold; border: 1px solid #999; text-transform: uppercase; }
          .block-row td { border: 1px solid #999; padding: 4px; border-bottom: 1px solid #000; }
          .block-row:nth-child(even) { background-color: #f8fafc; }

          /* Footer Total */
          .footer-total { display: flex; justify-content: flex-end; margin-top: 10px; }
          .total-box { display: flex; font-size: 11px; font-weight: bold; }
          .total-label { background-color: #002060; color: #fff; padding: 6px 30px; border: 1px solid white;}
          .total-value { background-color: #b91c1c; color: #fff; padding: 6px 20px; min-width: 100px; text-align: right; border: 1px solid white;}
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Top Header -->
          <div class="header-logos">
            <div class="logo-ls">
               <div style="font-size: 24px; font-weight: 900; color: #002060; line-height: 1; text-align: center;">LS OFFICE<br><span style="font-size: 8px; font-weight: normal; color: #666;">SERVIÇOS DE TELECOM E CONSTRUÇÕES</span></div>
            </div>
            <div class="header-text">
              <h1>LS OFFICE SERVIÇOS DE TELECOM E<br>CONSTRUÇÕES LTDA</h1>
              <p>Travessa Barão do Triunfo, 3540, Sala 2303</p>
              <p>19.853.545/0001-79</p>
              <p>98523-4355</p>
              <p>implantacao@lsoffice.com.br</p>
            </div>
            ${supplierLogoHtml}
            <div class="logo-client">
              ${contratante.logo_url ? `<img src="${contratante.logo_url}" alt="Logo">` : `<span style="font-size: 18px; font-weight: bold; color: #333;">${contratante.nome}</span>`}
            </div>
          </div>

          <div class="title-strip">Orçamento</div>

          <!-- Info Grid -->
          <table class="info-table">
            ${supplierInfoHtml}
            <tr>
              <td class="info-label">Contratante</td>
              <td class="info-value" colspan="2">${contratante.nome}</td>
              <td style="width: 120px; background: white; border: none;"></td>
            </tr>
            <tr>
              <td class="info-label">Assunto</td>
              <td class="info-value">${budget.assunto || 'VISTORIA E MEDIÇÕES DE RF'}</td>
              <td style="text-align: right; width: 60px; background: white; border: none;"></td>
              <td class="info-value-red">ACIONAMENTO</td>
            </tr>
            <tr>
              <td class="info-label">Endereço</td>
              <td class="info-value" style="background: white;">${siteContext.localizacao}</td>
              <td style="background: white; border: none;"></td>
              <td class="info-value" style="font-weight: bold; font-size: 11px; background: white; color: black; border: none;">${budget.updated_at.toLocaleDateString('pt-BR')}</td>
            </tr>
            <tr>
              <td class="info-label">ID Site</td>
              <td class="info-value">${siteContext.id}</td>
              <td colspan="2" style="background: white; border: none;"></td>
            </tr>
            <tr>
              <td class="info-label">Valor da Proposta</td>
              <td class="info-value" style="background: white;">R$ ${formatter.format(totals.totalGeral).replace('R$', '').trim()}</td>
              <td style="background: white; border: none;"></td>
              <td class="info-value-dark">DATA</td>
            </tr>
            <tr>
              <td class="info-label">Vigência da Proposta</td>
              <td class="info-value">${budget.vigencia_dias} DIAS</td>
              <td style="background: white; border: none;"></td>
              <td class="info-value" style="font-weight: bold; font-size: 11px; background: white; color: black; border: none;">${dataEntrega.toLocaleDateString('pt-BR')}</td>
            </tr>
          </table>

          <!-- Main Table Headers -->
          <table class="main-table-header">
            <tr>
              <th style="width: 50px;">ITEM</th>
              <th style="text-align: left; padding-left: 10px;">SERVIÇO</th>
              <th style="width: 250px;">DESCRIÇÃO</th>
              <th style="width: 40px;">QTD</th>
              <th style="width: 50px;">UNIDADE</th>
              <th style="width: 90px; text-align: right;">VALOR UNITÁRIO</th>
              <th style="width: 90px; text-align: right; padding-right: 5px;">VALOR TOTAL</th>
            </tr>
          </table>

          <!-- Blocks -->
          ${blockGroups.map(renderBlock).join('')}

          <!-- Footer Total -->
          <div class="footer-total">
             <div class="total-box">
                <div class="total-label">VALOR TOTAL</div>
                <div class="total-value">R$ ${formatter.format(totals.totalGeral).replace('R$', '').trim()}</div>
             </div>
          </div>

        </div>
      </body>
      </html>
    `;
  }

  // ─── Excel Export ─────────────────────────────────────────────────

  static async generateExcel(budgetId: string): Promise<Buffer> {
    const budget: any = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: {
        contratante: true,
        site: true,
        atividade: true,
        items: { orderBy: { ordem: 'asc' } },
        supplier: true,
      }
    });
    if (!budget) throw new Error("Budget not found");

    const totals = BudgetService.calcularOrcamento(budget.items);
    const blockGroups = groupActiveItems(totals.itensDelineados);
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const contratante = budget.contratante as any;
    const supplier = budget.supplier as any;
    const siteContext = resolveSiteContext(budget);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LS Orçamento';
    workbook.created = new Date();

    // ─── RESUMO Sheet ───────────────────────────────────────────

    const resumoSheet = workbook.addWorksheet('RESUMO', {
      properties: { defaultColWidth: 20 }
    });

    // Header
    resumoSheet.mergeCells('A1:F1');
    const titleCell = resumoSheet.getCell('A1');
    titleCell.value = 'LS OFFICE SERVIÇOS DE TELECOM E CONSTRUÇÕES LTDA';
    titleCell.font = { size: 14, bold: true, color: { argb: 'FF002060' } };
    titleCell.alignment = { horizontal: 'center' };

    resumoSheet.mergeCells('A2:F2');
    resumoSheet.getCell('A2').value = '19.853.545/0001-79 | implantacao@lsoffice.com.br';
    resumoSheet.getCell('A2').alignment = { horizontal: 'center' };
    resumoSheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };

    // Info rows
    const infoStart = 4;
    const infoData = [
      ['Contratante', contratante.nome],
      ['Fornecedor', supplier?.nome || 'N/A'],
      ['Assunto', budget.assunto || ''],
      ['Site', `${siteContext.id} - ${siteContext.localizacao}`],
      ['Vigência', `${budget.vigencia_dias} dias`],
      ['Versão', `v${budget.versao_atual}`],
    ];

    infoData.forEach((row, i) => {
      const r = resumoSheet.getRow(infoStart + i);
      r.getCell(1).value = row[0];
      r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B6B9E' } };
      r.getCell(2).value = row[1];
      r.getCell(2).font = { bold: true };
    });

    // Summary table
    const summaryStart = infoStart + infoData.length + 2;
    resumoSheet.mergeCells(`A${summaryStart}:F${summaryStart}`);
    const summaryHeader = resumoSheet.getCell(`A${summaryStart}`);
    summaryHeader.value = 'RESUMO DO ORÇAMENTO';
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    summaryHeader.alignment = { horizontal: 'center' };

    let sRow = summaryStart + 1;
    for (const block of blockGroups) {
      const r = resumoSheet.getRow(sRow);
      r.getCell(1).value = `${block.sequence} - ${block.label}`;
      r.getCell(1).font = { bold: true };
      r.getCell(3).value = block.subtotal;
      r.getCell(3).numFmt = 'R$ #,##0.00';
      r.getCell(3).font = { bold: true };
      sRow++;
    }

    // Total
    const totalRow = resumoSheet.getRow(sRow + 1);
    totalRow.getCell(1).value = 'VALOR TOTAL';
    totalRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    totalRow.getCell(3).value = totals.totalGeral;
    totalRow.getCell(3).numFmt = 'R$ #,##0.00';
    totalRow.getCell(3).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    totalRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };

    // ─── DETALHADO Sheet ────────────────────────────────────────

    const detalhadoSheet = workbook.addWorksheet('ORÇAMENTO DETALHADO');

    // Header row
    detalhadoSheet.columns = [
      { header: 'ITEM', key: 'codigo_item', width: 10 },
      { header: 'SERVIÇO', key: 'titulo', width: 35 },
      { header: 'DESCRIÇÃO', key: 'descricao', width: 40 },
      { header: 'QTD', key: 'quantidade', width: 10 },
      { header: 'UNIDADE', key: 'unidade', width: 10 },
      { header: 'VALOR UNITÁRIO', key: 'valor_unitario', width: 18 },
      { header: 'VALOR TOTAL', key: 'total_linha', width: 18 },
    ];

    // Style header row
    const headerRow = detalhadoSheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // Add active items grouped in their first-occurrence order.
    for (const block of blockGroups) {
      // Block header
      const blockRow = detalhadoSheet.addRow([`${block.sequence} - ${block.label}`, '', '', '', '', '', formatter.format(block.subtotal)]);
      blockRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
      });

      // Items
      for (const item of block.items) {
        const row = detalhadoSheet.addRow({
          codigo_item: item.codigo_item,
          titulo: item.titulo,
          descricao: item.descricao || '',
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_unitario: calcularValorUnitarioFinal(item),
          total_linha: item.total_linha,
        });

        row.getCell('valor_unitario').numFmt = 'R$ #,##0.00';
        row.getCell('total_linha').numFmt = 'R$ #,##0.00';
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
        });
      }
    }

    // Total row
    const excelTotalRow = detalhadoSheet.addRow(['', '', '', '', '', 'VALOR TOTAL', totals.totalGeral]);
    excelTotalRow.getCell(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    excelTotalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    excelTotalRow.getCell(7).numFmt = 'R$ #,##0.00';
    excelTotalRow.getCell(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    excelTotalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };

    // Generate buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
