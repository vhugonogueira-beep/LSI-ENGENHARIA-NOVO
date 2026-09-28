export const PAYMENT_PROCESS_TYPES = ['PAYMENT_REQUEST', 'PAYMENT_FORMALIZATION'] as const;
export const EMAIL_ROUTING_TYPES = ['PAYMENT_REQUEST', 'PAYMENT_FORMALIZATION', 'BILLING'] as const;

export type PaymentProcessType = typeof PAYMENT_PROCESS_TYPES[number];
export type EmailRoutingType = typeof EMAIL_ROUTING_TYPES[number];

export interface PaymentPurposeDefinition {
    value: string;
    label: string;
    natureza: 'MATERIAL' | 'SERVICO' | 'LOGISTICA' | 'PESSOAL' | 'OUTRO';
    exige_comprovante: boolean;
    exige_documento_fiscal: boolean;
}

export const PAYMENT_PURPOSES: PaymentPurposeDefinition[] = [
    { value: 'CABO', label: 'Cabo', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'METALICO', label: 'Metálico', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'QTM', label: 'QTM', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'ETM', label: 'ETM', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'MAO_DE_OBRA', label: 'Mão de obra', natureza: 'SERVICO', exige_comprovante: true, exige_documento_fiscal: false },
    { value: 'LOCACAO', label: 'Locação', natureza: 'SERVICO', exige_comprovante: true, exige_documento_fiscal: false },
    { value: 'MATERIAL_CIVIL', label: 'Material civil', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'MATERIAL_ELETRICO', label: 'Material elétrico', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'EQUIPAMENTO', label: 'Equipamento', natureza: 'MATERIAL', exige_comprovante: true, exige_documento_fiscal: true },
    { value: 'TRANSPORTE', label: 'Transporte', natureza: 'LOGISTICA', exige_comprovante: true, exige_documento_fiscal: false },
    { value: 'REEMBOLSO', label: 'Reembolso', natureza: 'PESSOAL', exige_comprovante: true, exige_documento_fiscal: false },
    { value: 'ADIANTAMENTO_VIAGEM', label: 'Adiantamento de viagem', natureza: 'PESSOAL', exige_comprovante: true, exige_documento_fiscal: false },
    { value: 'OUTROS', label: 'Outros', natureza: 'OUTRO', exige_comprovante: true, exige_documento_fiscal: false },
];

export function normalizePaymentProcessType(value: unknown, legacyFormalization = false): PaymentProcessType {
    if (value === 'PAYMENT_FORMALIZATION' || legacyFormalization) return 'PAYMENT_FORMALIZATION';
    return 'PAYMENT_REQUEST';
}

/**
 * Uma formalização registra dinheiro que JÁ saiu do caixa. Ela nasce PENDENTE
 * porque ainda faltam comprovante e documento fiscal, mas isso é pendência
 * documental — não desembolso. Somar formalizações em "a pagar" faria o
 * financeiro cobrar duas vezes o mesmo gasto.
 */
export function isDesembolsoPendente(
    parcela: { status: string; processo_tipo?: string | null; formalizacao_posterior?: boolean | null },
    statusPagos: string[] = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'],
): boolean {
    const processo = normalizePaymentProcessType(parcela.processo_tipo, Boolean(parcela.formalizacao_posterior));
    if (processo === 'PAYMENT_FORMALIZATION') return false;
    return !statusPagos.includes(parcela.status);
}

export function getPaymentPurpose(value: string | null | undefined) {
    return PAYMENT_PURPOSES.find(item => item.value === String(value || '').toUpperCase()) || null;
}

export function validateFormalizationDocuments(finalidade: string | null | undefined, attachmentTypes: string[]) {
    const purpose = getPaymentPurpose(finalidade);
    const missing: string[] = [];
    if (!attachmentTypes.includes('COMPROVANTE_PAGAMENTO')) missing.push('Comprovante de pagamento');
    if (purpose?.exige_documento_fiscal && !attachmentTypes.includes('DOCUMENTO_FISCAL')) missing.push('Nota Fiscal / Documento fiscal');
    return { complete: missing.length === 0, missing, purpose };
}
