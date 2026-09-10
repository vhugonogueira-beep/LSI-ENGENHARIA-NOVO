import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../server';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'documentacao');
const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.dwg', '.dxf', '.doc', '.docx', '.xls', '.xlsx', '.xlsm',
    '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.zip', '.rar', '.7z',
]);

function safeOriginalName(value: string): string {
    const base = path.basename(value || 'documento');
    return base.replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'documento';
}

function absoluteFromStorageKey(storageKey: string): string {
    const absolute = path.resolve(STORAGE_ROOT, ...storageKey.split('/'));
    const rootPrefix = `${STORAGE_ROOT}${path.sep}`;
    if (!absolute.startsWith(rootPrefix)) throw new Error('Caminho de arquivo inválido');
    return absolute;
}

export function validateDocumentFile(file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error(`Formato não permitido: ${extension || 'sem extensão'}`);
    }
    if (!file.buffer?.length) throw new Error('O arquivo enviado está vazio');
}

export async function storeDocumentFile(
    documentId: string,
    file: Express.Multer.File,
    uploadedBy?: string,
) {
    validateDocumentFile(file);

    const document = await prisma.documentoAtividade.findUnique({
        where: { id: documentId },
        include: { atividade: { select: { id: true } } },
    });
    if (!document) throw new Error('Documento não encontrado');
    if (!document.aplicavel) throw new Error('Este requisito não se aplica mais à Atividade');

    const originalName = safeOriginalName(file.originalname);
    const extension = path.extname(originalName).toLowerCase();
    const storageKey = `${document.atividade.id}/${documentId}/${randomUUID()}${extension}`;
    const absolutePath = absoluteFromStorageKey(storageKey);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
        return await prisma.$transaction(async tx => {
            const attachment = await tx.documentoAtividadeArquivo.create({
                data: {
                    documento_id: documentId,
                    nome_original: originalName,
                    mime_type: file.mimetype || 'application/octet-stream',
                    tamanho_bytes: file.size,
                    storage_key: storageKey,
                    sha256,
                    uploaded_by: uploadedBy || null,
                },
            });
            await tx.documentoAtividade.update({
                where: { id: documentId },
                data: {
                    status: 'RECEBIDO',
                    data_recebimento: new Date(),
                    data_validacao: null,
                },
            });
            return attachment;
        });
    } catch (error) {
        await fs.unlink(absolutePath).catch(() => undefined);
        throw error;
    }
}

export async function getStoredDocumentFile(attachmentId: string) {
    const attachment = await prisma.documentoAtividadeArquivo.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Arquivo não encontrado');
    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.access(absolutePath);
    return { attachment, absolutePath };
}

export async function deleteStoredDocumentFile(attachmentId: string) {
    const attachment = await prisma.documentoAtividadeArquivo.findUnique({
        where: { id: attachmentId },
        include: { documento: true },
    });
    if (!attachment) throw new Error('Arquivo não encontrado');

    const result = await prisma.$transaction(async tx => {
        await tx.documentoAtividadeArquivo.delete({ where: { id: attachmentId } });
        const remaining = await tx.documentoAtividadeArquivo.count({
            where: { documento_id: attachment.documento_id },
        });
        if (remaining === 0 && attachment.documento.status !== 'NAO_APLICAVEL') {
            await tx.documentoAtividade.update({
                where: { id: attachment.documento_id },
                data: {
                    status: 'NAO_INICIADO',
                    data_recebimento: null,
                    data_validacao: null,
                },
            });
        }
        return { atividadeId: attachment.documento.atividade_id };
    });

    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.unlink(absolutePath).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
    return result;
}
