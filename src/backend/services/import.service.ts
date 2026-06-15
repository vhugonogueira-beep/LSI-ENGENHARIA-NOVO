import { prisma } from '../server';
import { PriceEngineService } from './price-engine.service';
import { PriceBookService } from './pricebook.service';
import * as XLSX from 'xlsx';

// ─── Column auto-detection mappings ────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
    descricao: ['descricao', 'descrição', 'description', 'servico', 'serviço', 'item', 'nome', 'atividade'],
    valor_unitario: ['valor_unitario', 'valor unitário', 'valor', 'preco', 'preço', 'price', 'unit_price', 'vl_unit', 'vl unitario'],
    unidade: ['unidade', 'und', 'un', 'unit', 'medida'],
    tipo_escopo: ['tipo_escopo', 'tipo', 'escopo', 'type', 'categoria', 'category', 'scope'],
    codigo_item: ['codigo', 'código', 'code', 'cod', 'item_code', 'codigo_item', 'ref'],
    subtipo: ['subtipo', 'sub_tipo', 'subtype'],
    observacoes: ['observacoes', 'observações', 'obs', 'notes', 'nota'],
};

const TIPO_ESCOPO_ALIASES: Record<string, string> = {
    'servico': 'SERVICO', 'serviço': 'SERVICO', 'servicos': 'SERVICO', 'serviços': 'SERVICO',
    's': 'SERVICO', 'service': 'SERVICO', 'srv': 'SERVICO', 'svc': 'SERVICO',
    'infra': 'INFRA', 'infraestrutura': 'INFRA', 'i': 'INFRA', 'infrastructure': 'INFRA',
    'material': 'INFRA', 'mat': 'INFRA', 'fornecimento': 'INFRA',
};

export interface ParsedRow {
    rowIndex: number;
    descricao: string;
    valor_unitario: number;
    unidade: string;
    tipo_escopo: string;
    codigo_item?: string;
    subtipo?: string;
    observacoes?: string;
    valid: boolean;
    errors: string[];
}

export interface ColumnMapping {
    [targetField: string]: string; // targetField -> sourceColumn
}

export interface ImportPreviewResult {
    batchId: string;
    detectedHeaders: string[];
    suggestedMapping: ColumnMapping;
    previewRows: ParsedRow[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    pendingTipoEscopo: number;
}

export class ImportService {

    // ─── Parsing ────────────────────────────────────────────────────

    static parseFile(buffer: Buffer, fileType: string): { headers: string[]; rows: any[][] } {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Get raw data as array of arrays
        const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (data.length < 2) {
            throw new Error('Arquivo vazio ou sem dados suficientes (mínimo: cabeçalho + 1 linha).');
        }

        const headers = data[0].map((h: any) => String(h).trim());
        const rows = data.slice(1).filter((row: any[]) =>
            row.some(cell => cell !== '' && cell !== null && cell !== undefined)
        );

        return { headers, rows };
    }

    // ─── Auto-detect column mapping ─────────────────────────────────

    static autoDetectColumns(headers: string[]): ColumnMapping {
        const mapping: ColumnMapping = {};
        const normalizedHeaders = headers.map(h =>
            h.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s_]/g, '')
                .trim()
        );

        for (const [targetField, aliases] of Object.entries(COLUMN_ALIASES)) {
            for (let i = 0; i < normalizedHeaders.length; i++) {
                const nh = normalizedHeaders[i];
                if (aliases.some(alias => nh === alias || nh.includes(alias))) {
                    mapping[targetField] = headers[i];
                    break;
                }
            }
        }

        return mapping;
    }

    // ─── Apply mapping and produce preview rows ─────────────────────

    static applyMapping(
        headers: string[],
        rows: any[][],
        mapping: ColumnMapping
    ): ParsedRow[] {
        const getColIndex = (field: string) => {
            const colName = mapping[field];
            if (!colName) return -1;
            return headers.indexOf(colName);
        };

        const descIdx = getColIndex('descricao');
        const valorIdx = getColIndex('valor_unitario');
        const unidadeIdx = getColIndex('unidade');
        const tipoIdx = getColIndex('tipo_escopo');
        const codigoIdx = getColIndex('codigo_item');
        const subtipoIdx = getColIndex('subtipo');
        const obsIdx = getColIndex('observacoes');

        return rows.map((row, i) => {
            const errors: string[] = [];

            // Extract values
            const rawDescricao = descIdx >= 0 ? String(row[descIdx] || '').trim() : '';
            const rawValor = valorIdx >= 0 ? row[valorIdx] : 0;
            const rawUnidade = unidadeIdx >= 0 ? String(row[unidadeIdx] || '').trim() : '';
            const rawTipo = tipoIdx >= 0 ? String(row[tipoIdx] || '').trim().toLowerCase() : '';
            const rawCodigo = codigoIdx >= 0 ? String(row[codigoIdx] || '').trim() : undefined;
            const rawSubtipo = subtipoIdx >= 0 ? String(row[subtipoIdx] || '').trim() : undefined;
            const rawObs = obsIdx >= 0 ? String(row[obsIdx] || '').trim() : undefined;

            // Parse valor
            let valorUnitario = 0;
            if (typeof rawValor === 'number') {
                valorUnitario = rawValor;
            } else {
                // Handle Brazilian format: 1.234,56 → 1234.56
                const cleaned = String(rawValor)
                    .replace(/[R$\s]/g, '')
                    .replace(/\./g, '')
                    .replace(',', '.');
                valorUnitario = parseFloat(cleaned) || 0;
            }

            // Detect tipo_escopo
            let tipoEscopo = '';
            if (rawTipo) {
                const normalized = rawTipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                tipoEscopo = TIPO_ESCOPO_ALIASES[normalized] || rawTipo.toUpperCase();
            }

            // Validation
            if (!rawDescricao) errors.push('Descrição obrigatória');
            if (valorUnitario < 0) errors.push('Valor unitário deve ser >= 0');
            if (!rawUnidade) errors.push('Unidade obrigatória');
            if (!tipoEscopo || !['SERVICO', 'INFRA'].includes(tipoEscopo)) {
                if (tipoEscopo) {
                    errors.push(`Tipo escopo inválido: "${tipoEscopo}"`);
                }
                // Leave blank for user to fill
                tipoEscopo = '';
            }

            return {
                rowIndex: i + 1,
                descricao: rawDescricao,
                valor_unitario: valorUnitario,
                unidade: rawUnidade,
                tipo_escopo: tipoEscopo,
                codigo_item: rawCodigo,
                subtipo: rawSubtipo,
                observacoes: rawObs,
                valid: errors.length === 0 && !!tipoEscopo,
                errors
            };
        });
    }

    // ─── Start Import (upload + preview) ────────────────────────────

    static async startImport(
        tenantId: string,
        supplierId: string,
        pricebookId: string,
        fileName: string,
        fileType: string,
        buffer: Buffer,
        customMapping?: ColumnMapping
    ): Promise<ImportPreviewResult> {
        // Parse file
        const { headers, rows } = this.parseFile(buffer, fileType);

        // Auto-detect or use custom mapping
        const suggestedMapping = customMapping || this.autoDetectColumns(headers);

        // Apply mapping and validate
        const previewRows = this.applyMapping(headers, rows, suggestedMapping);

        const validCount = previewRows.filter(r => r.valid).length;
        const invalidCount = previewRows.filter(r => !r.valid && r.errors.length > 0).length;
        const pendingTipoEscopo = previewRows.filter(r => !r.tipo_escopo).length;

        // Create ImportBatch in DB
        const batch = await prisma.importBatch.create({
            data: {
                tenant_id: tenantId,
                supplier_id: supplierId,
                pricebook_id: pricebookId,
                arquivo_nome: fileName,
                arquivo_tipo: fileType.toUpperCase(),
                status: 'AGUARDANDO_MAPEAMENTO',
                total_linhas_lidas: rows.length,
                mapping_json: JSON.stringify(suggestedMapping),
                preview_json: JSON.stringify(previewRows.slice(0, 50)), // save first 50 for preview
            }
        });

        return {
            batchId: batch.id,
            detectedHeaders: headers,
            suggestedMapping,
            previewRows: previewRows.slice(0, 50),
            totalRows: rows.length,
            validCount,
            invalidCount,
            pendingTipoEscopo,
        };
    }

    // ─── Confirm Import (write to DB) ───────────────────────────────

    static async confirmImport(
        batchId: string,
        confirmedRows: ParsedRow[]
    ) {
        const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
        if (!batch) throw new Error('Import batch não encontrado');
        if (!batch.pricebook_id || !batch.supplier_id) {
            throw new Error('Batch sem pricebook_id ou supplier_id');
        }

        // Get the pricebook to extract regiao
        const pricebook = await prisma.priceBook.findUnique({ where: { id: batch.pricebook_id } });
        if (!pricebook) throw new Error('PriceBook não encontrado');

        // Filter only valid rows
        const validRows = confirmedRows.filter(r =>
            r.descricao && r.unidade && r.tipo_escopo && r.valor_unitario >= 0
        );

        if (validRows.length === 0) {
            await prisma.importBatch.update({
                where: { id: batchId },
                data: { status: 'ERRO', erros_json: JSON.stringify([{ error: 'Nenhuma linha válida para importar' }]) }
            });
            throw new Error('Nenhuma linha válida para importar');
        }

        // Build PriceBookItems
        const items = validRows.map(row => ({
            tenant_id: batch.tenant_id,
            pricebook_id: batch.pricebook_id!,
            supplier_id: batch.supplier_id!,
            regiao: pricebook.regiao,
            tipo_escopo: row.tipo_escopo,
            subtipo: row.subtipo || null,
            codigo_item: row.codigo_item || null,
            descricao: row.descricao,
            descricao_normalizada: PriceEngineService.normalizarDescricao(row.descricao),
            unidade: row.unidade,
            valor_unitario: row.valor_unitario,
            observacoes: row.observacoes || null,
            origem_importacao_id: batchId,
        }));

        // Insert in batch
        const result = await PriceBookService.createPriceBookItemsBatch(items);

        // Update batch status
        await prisma.importBatch.update({
            where: { id: batchId },
            data: {
                status: 'CONCLUIDO',
                total_linhas_importadas: validRows.length,
                erros_json: null,
            }
        });

        return {
            imported: validRows.length,
            skipped: confirmedRows.length - validRows.length,
            batchId,
        };
    }

    // ─── Get Batch Status ───────────────────────────────────────────

    static async getImportBatch(id: string) {
        return prisma.importBatch.findUnique({
            where: { id },
            include: {
                supplier: { select: { nome: true } },
                pricebook: { select: { nome_lpu: true } }
            }
        });
    }
}
