import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { prisma } from '../server';
import { HIGHLINE_PV_CATALOG, HIGHLINE_PV_QUANTITY_RULES } from '../data/highline-pv-catalog';
import { calcularTotalLinha, calcularValorUnitarioFinal } from './budget.service';
import { normalizarUf, regiaoPorUf } from '../utils/uf';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'assets', 'templates', 'pv-highline-padrao.xlsm');
const TEMPLATE_SHA256 = 'bce23fe9a56965506f8a8ee3c234242ceebdc5c812b861b6f4de313d5b3b9c4b';
const HIGHLINE_SITE_TYPES = new Set(['BTS', 'Roof Top', 'Collo - BTS', 'Collo RT', 'Reforço']);

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function cellStyle(existingCell: string): string {
    const style = existingCell.match(/\ss="([^"]+)"/);
    return style ? ` s="${style[1]}"` : '';
}

function replaceCell(xml: string, ref: string, content: (style: string) => string): string {
    const refGuard = `(?=[^>]*\\br="${ref}"(?:\\s|/?>))`;
    const selfClosing = new RegExp(`<c\\b${refGuard}[^>]*/>`).exec(xml);
    const paired = selfClosing ? null : new RegExp(`<c\\b${refGuard}[^>]*>[\\s\\S]*?<\\/c>`).exec(xml);
    const match = selfClosing || paired;
    if (!match || match.index == null) throw new Error(`Célula ${ref} não encontrada no template PV Highline`);
    const replacement = content(cellStyle(match[0]));
    return `${xml.slice(0, match.index)}${replacement}${xml.slice(match.index + match[0].length)}`;
}

function setEmptyCell(xml: string, ref: string): string {
    return replaceCell(xml, ref, style => `<c r="${ref}"${style}/>`);
}

function setStringCell(xml: string, ref: string, value: string): string {
    return replaceCell(xml, ref, style =>
        `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
    );
}

function setNumberCell(xml: string, ref: string, value: number): string {
    if (!Number.isFinite(value)) throw new Error(`Valor numérico inválido para ${ref}`);
    return replaceCell(xml, ref, style => `<c r="${ref}"${style}><v>${value}</v></c>`);
}

function setNumberFormulaCell(xml: string, ref: string, formula: string, cachedValue: number): string {
    if (!Number.isFinite(cachedValue)) throw new Error(`Resultado numérico inválido para ${ref}`);
    return replaceCell(xml, ref, style =>
        `<c r="${ref}"${style}><f>${escapeXml(formula)}</f><v>${cachedValue}</v></c>`
    );
}

function setStringFormulaCell(xml: string, ref: string, formula: string, cachedValue = ''): string {
    return replaceCell(xml, ref, style =>
        `<c r="${ref}"${style} t="str"><f>${escapeXml(formula)}</f><v>${escapeXml(cachedValue)}</v></c>`
    );
}

function setRowHidden(xml: string, row: number, hidden: boolean): string {
    const pattern = new RegExp(`<row\\b([^>]*\\br="${row}"[^>]*)>`);
    const match = xml.match(pattern);
    if (!match) throw new Error(`Linha ${row} não encontrada no template PV Highline`);
    let attrs = match[1].replace(/\shidden="(?:1|true)"/g, '');
    if (hidden) attrs += ' hidden="1"';
    return xml.replace(pattern, `<row${attrs}>`);
}

function excelDateSerial(date: Date): number {
    return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        - Date.UTC(1899, 11, 30)) / 86400000);
}

function sanitizedFilePart(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function sumRows(totals: Map<number, number>, start: number, end: number): number {
    let total = 0;
    for (let row = start; row <= end; row += 1) total += totals.get(row) || 0;
    return Math.round(total * 100) / 100;
}

export function listHighlinePvCatalog() {
    return HIGHLINE_PV_CATALOG.map(item => ({
        ...item,
        quantityRule: HIGHLINE_PV_QUANTITY_RULES[item.templateRow] || null,
    }));
}

export async function generateHighlinePv(budgetId: string): Promise<{ buffer: Buffer; filename: string }> {
    const budget = await prisma.budget.findUnique({
        where: { id: budgetId },
        include: {
            atividade: true,
            items: { orderBy: { ordem: 'asc' } },
        },
    });
    if (!budget) throw new Error('Orçamento não encontrado');
    const atividade = budget.atividade;
    if (!atividade) throw new Error('O orçamento precisa estar vinculado a uma Atividade');
    if (atividade.sharing.trim().toUpperCase() !== 'HIGHLINE' || atividade.tipo_demanda !== 'IMPLANTACAO') {
        throw new Error('A PV está disponível apenas para Atividades de implantação Highline');
    }

    const siteId = atividade.id_site_sharing?.trim();
    const operatorSiteId = atividade.id_site_operadora?.trim();
    const uf = normalizarUf(atividade.estado);
    const operator = atividade.operadora?.trim();
    const responsible = atividade.responsavel?.trim();
    const siteType = atividade.tipo_site_highline?.trim();
    if (!siteId) throw new Error('Preencha o Site ID Sharing na Identificação da Atividade');
    if (!operatorSiteId) throw new Error('Preencha o Site ID Operadora na Identificação da Atividade');
    if (!uf) throw new Error('Preencha uma UF válida na Identificação da Atividade');
    if (!operator) throw new Error('Preencha a Operadora na Identificação da Atividade');
    if (!responsible) throw new Error('Preencha o Responsável na Identificação da Atividade');
    if (!siteType || !HIGHLINE_SITE_TYPES.has(siteType)) {
        throw new Error('Selecione o Tipo de Site Highline na Identificação da Atividade');
    }
    const region = regiaoPorUf(uf)!;

    const mappedItems = budget.items.filter(item =>
        item.ativo && item.highline_template_row != null && item.quantidade > 0
    );
    if (mappedItems.length === 0) {
        throw new Error('Selecione ao menos um item do catálogo Highline com quantidade maior que zero');
    }

    const template = await fs.readFile(TEMPLATE_PATH);
    const templateHash = createHash('sha256').update(template).digest('hex');
    if (templateHash !== TEMPLATE_SHA256) {
        throw new Error('O template PV Highline foi alterado sem atualização do catálogo mapeado');
    }

    const zip = await JSZip.loadAsync(template, { checkCRC32: true, createFolders: false });
    const layoutEntry = zip.file('xl/worksheets/sheet1.xml');
    const quantEntry = zip.file('xl/worksheets/sheet2.xml');
    const summaryEntry = zip.file('xl/worksheets/sheet3.xml');
    const workbookEntry = zip.file('xl/workbook.xml');
    const tableEntry = zip.file('xl/tables/table1.xml');
    if (!layoutEntry || !quantEntry || !summaryEntry || !workbookEntry || !tableEntry
        || !zip.file('xl/vbaProject.bin')) {
        throw new Error('Template PV Highline inválido ou sem macro VBA');
    }

    let layoutXml = await layoutEntry.async('string');
    let quantXml = await quantEntry.async('string');
    let summaryXml = await summaryEntry.async('string');
    let workbookXml = await workbookEntry.async('string');
    let tableXml = await tableEntry.async('string');

    layoutXml = setNumberCell(layoutXml, 'E7', excelDateSerial(new Date()));
    layoutXml = setStringCell(layoutXml, 'E8', siteId);
    layoutXml = setStringCell(layoutXml, 'E9', region);
    layoutXml = setStringCell(layoutXml, 'E10', responsible);
    layoutXml = setStringCell(layoutXml, 'E11', operator);
    layoutXml = setStringCell(layoutXml, 'E12', siteType);

    quantXml = setStringCell(quantXml, 'C7', 'LS OFFICE');
    quantXml = setStringCell(quantXml, 'C8', siteId);
    quantXml = setStringCell(quantXml, 'C9', uf);

    const itemByRow = new Map(mappedItems.map(item => [item.highline_template_row as number, item]));
    const totalsByRow = new Map<number, number>();
    for (const catalogItem of HIGHLINE_PV_CATALOG) {
        const selected = itemByRow.get(catalogItem.templateRow);
        const quantity = selected?.quantidade || 0;
        const finalUnitValue = selected ? calcularValorUnitarioFinal(selected) : 0;
        const total = selected ? calcularTotalLinha(selected) : 0;
        totalsByRow.set(catalogItem.templateRow, total);

        quantXml = selected
            ? setNumberCell(quantXml, `F${catalogItem.templateRow}`, quantity)
            : setEmptyCell(quantXml, `F${catalogItem.templateRow}`);
        quantXml = setNumberCell(quantXml, `G${catalogItem.templateRow}`, finalUnitValue);
        quantXml = setNumberFormulaCell(
            quantXml,
            `H${catalogItem.templateRow}`,
            `G${catalogItem.templateRow}*F${catalogItem.templateRow}`,
            total,
        );
        quantXml = setRowHidden(quantXml, catalogItem.templateRow, !selected);
    }

    // The source workbook omits this first observation lookup.
    quantXml = setStringFormulaCell(
        quantXml,
        'D283',
        'IFERROR(VLOOKUP(C283,Quantitativos!$C$12:$E$277,2,0),"")',
    );

    const summaryRanges: Array<[string, number, number]> = [
        ['B7', 12, 23], ['B8', 24, 47], ['B9', 48, 59], ['B10', 60, 71],
        ['B11', 72, 103], ['B12', 126, 161], ['B13', 162, 163], ['B14', 104, 115],
        ['B15', 184, 189], ['B16', 164, 183], ['B17', 116, 125], ['B18', 252, 277],
        ['B19', 190, 251],
    ];
    summaryXml = setStringFormulaCell(summaryXml, 'B1', 'Layout!E8', siteId);
    summaryXml = setStringFormulaCell(summaryXml, 'B2', 'LEFT(B1,2)', siteId.slice(0, 2));
    summaryXml = setStringCell(summaryXml, 'B3', region.toUpperCase());
    for (const [ref, start, end] of summaryRanges) {
        summaryXml = setNumberFormulaCell(
            summaryXml,
            ref,
            `SUM(Quantitativos!H${start}:H${end})`,
            sumRows(totalsByRow, start, end),
        );
    }
    const grandTotal = Math.round(Array.from(totalsByRow.values()).reduce((sum, value) => sum + value, 0) * 100) / 100;
    summaryXml = setNumberFormulaCell(summaryXml, 'B20', 'SUM(B7:B19)', grandTotal);

    const openFilter = '<autoFilter ref="B11:H277"><filterColumn colId="4"><customFilters>'
        + '<customFilter operator="greaterThan" val="0"/></customFilters></filterColumn></autoFilter>';
    tableXml = tableXml.replace(/<autoFilter\b[\s\S]*?<\/autoFilter>|<autoFilter\b[^>]*\/>/, openFilter);

    if (/<calcPr\b[^>]*\/>/.test(workbookXml)) {
        workbookXml = workbookXml.replace(/<calcPr\b([^>]*)\/>/, (_match, attrs: string) => {
            const clean = attrs
                .replace(/\sfullCalcOnLoad="[^"]*"/g, '')
                .replace(/\sforceFullCalc="[^"]*"/g, '')
                .replace(/\scalcMode="[^"]*"/g, '');
            return `<calcPr${clean} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
        });
    } else {
        workbookXml = workbookXml.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
    }

    const fileOptions = { createFolders: false };
    zip.file('xl/worksheets/sheet1.xml', layoutXml, fileOptions);
    zip.file('xl/worksheets/sheet2.xml', quantXml, fileOptions);
    zip.file('xl/worksheets/sheet3.xml', summaryXml, fileOptions);
    zip.file('xl/tables/table1.xml', tableXml, fileOptions);
    zip.file('xl/workbook.xml', workbookXml, fileOptions);

    const output = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
    });
    return {
        buffer: output,
        filename: `PV_HIGHLINE_${sanitizedFilePart(siteId)}.xlsm`,
    };
}
