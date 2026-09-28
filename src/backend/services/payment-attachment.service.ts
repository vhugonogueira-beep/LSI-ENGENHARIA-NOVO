import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../server';

const ROOT = path.resolve(process.cwd(), 'storage', 'payment-attachments');
// COMPROVANTE_PAGAMENTO e DOCUMENTO_FISCAL têm significado de conferência: o
// primeiro prova que o dinheiro saiu, o segundo é exigido em compra de material.
// OUTRO_DOCUMENTO é o resto que a obra produz e precisa ficar junto do
// pagamento — foto do serviço executado, orçamento, ordem de serviço assinada.
// Sem ele, esses arquivos eram anexados como "comprovante" e sujavam a
// conferência: o cartão dizia que havia comprovante quando havia uma foto.
export const ATTACHMENT_TYPES = ['COMPROVANTE_PAGAMENTO', 'DOCUMENTO_FISCAL', 'OUTRO_DOCUMENTO'] as const;

function absolute(storageKey: string) {
    const result = path.resolve(ROOT, ...storageKey.split('/'));
    if (!result.startsWith(`${ROOT}${path.sep}`)) throw new Error('Caminho de anexo inválido');
    return result;
}

async function owner(tenantId: string, ownerType: string, ownerId: string) {
    if (ownerType === 'PARCELA') {
        const parcela = await prisma.parcelaPagamento.findFirst({ where: { id: ownerId, contratacao: { tenant_id: tenantId } } });
        if (!parcela) throw new Error('Pagamento não encontrado');
        return { parcela_id: ownerId, reembolso_pagamento_id: null };
    }
    if (ownerType === 'DEPOSITO') {
        const deposito = await prisma.reembolsoPagamento.findFirst({ where: { id: ownerId, reembolso: { tenant_id: tenantId } } });
        if (!deposito) throw new Error('Depósito não encontrado');
        return { parcela_id: null, reembolso_pagamento_id: ownerId };
    }
    throw new Error('Origem de anexo inválida');
}

export async function listPaymentAttachments(tenantId: string, ownerType: string, ownerId: string) {
    const relation = await owner(tenantId, ownerType, ownerId);
    return prisma.paymentAttachment.findMany({ where: { tenant_id: tenantId, ...relation }, orderBy: { created_at: 'asc' } });
}

export async function storePaymentAttachments(tenantId: string, userEmail: string, ownerType: string, ownerId: string, tipo: string, files: Express.Multer.File[]) {
    if (!ATTACHMENT_TYPES.includes(tipo as any)) throw new Error('Tipo de documento financeiro inválido');
    const relation = await owner(tenantId, ownerType, ownerId);
    const saved = [];
    for (const file of files) {
        if (!file.buffer?.length) throw new Error(`Arquivo vazio: ${file.originalname}`);
        const extension = path.extname(file.originalname).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, '') || '.bin';
        const storageKey = `${tenantId}/${ownerType.toLowerCase()}/${ownerId}/${randomUUID()}${extension}`;
        const target = absolute(storageKey);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.buffer);
        try {
            saved.push(await prisma.paymentAttachment.create({
                data: {
                    tenant_id: tenantId, ...relation, tipo,
                    nome_original: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                    mime_type: file.mimetype || 'application/octet-stream',
                    tamanho_bytes: file.size,
                    storage_key: storageKey,
                    sha256: createHash('sha256').update(file.buffer).digest('hex'),
                    uploaded_by: userEmail,
                },
            }));
        } catch (error) { await fs.unlink(target).catch(() => undefined); throw error; }
    }
    return saved;
}

export async function loadPaymentAttachment(tenantId: string, id: string) {
    const record = await prisma.paymentAttachment.findFirst({ where: { id, tenant_id: tenantId } });
    if (!record) throw new Error('Anexo não encontrado');
    return { record, buffer: await fs.readFile(absolute(record.storage_key)) };
}

export async function deletePaymentAttachment(tenantId: string, id: string) {
    const loaded = await loadPaymentAttachment(tenantId, id);
    await prisma.paymentAttachment.delete({ where: { id } });
    await fs.unlink(absolute(loaded.record.storage_key)).catch(() => undefined);
}

/**
 * Anexar o comprovante fecha o ciclo do pagamento.
 *
 * Quem já estava pago passa a "comprovante recebido"; quem não estava, passa a
 * pago — e ganha data de pagamento se não tinha. `CONFERIDO` não regride: é um
 * estado à frente, já conferido pelo financeiro.
 *
 * Esta regra existia apenas no caminho legado (`pagamentos.controller.ts`).
 * Anexar pela faixa Documentos guardava o arquivo e **não mexia no status**, e
 * o pagamento continuava aparecendo como se nada tivesse sido anexado — quem
 * anexava tinha de trocar o status na mão, sem nenhuma pista de que precisava.
 * Os dois caminhos passam a chamar daqui.
 */
export async function aplicarComprovanteRecebido(ownerType: string, ownerId: string, comprovanteUrl?: string | null) {
    const tipo = String(ownerType || '').toUpperCase();
    const dados = (statusAtual: string, dataAtual: Date | null) => ({
        status: statusAtual === 'CONFERIDO' ? 'CONFERIDO' : 'COMPROVANTE_RECEBIDO',
        data_pagamento: dataAtual || new Date(),
        ...(comprovanteUrl ? { comprovante_url: comprovanteUrl } : {}),
    });

    if (tipo === 'PARCELA') {
        const atual = await prisma.parcelaPagamento.findUnique({ where: { id: ownerId } });
        if (!atual) return null;
        return prisma.parcelaPagamento.update({
            where: { id: ownerId },
            data: dados(atual.status, atual.data_pagamento),
        });
    }
    if (tipo === 'DEPOSITO') {
        const atual = await prisma.reembolsoPagamento.findUnique({ where: { id: ownerId } });
        if (!atual) return null;
        return prisma.reembolsoPagamento.update({
            where: { id: ownerId },
            data: dados(atual.status, atual.data_pagamento),
        });
    }
    return null;
}
