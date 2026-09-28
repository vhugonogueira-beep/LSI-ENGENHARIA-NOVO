import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../server';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'email-signatures');
const MIME_EXTENSIONS: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
};

function detectImage(buffer: Buffer): { mimeType: string; extension: string } | null {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { mimeType: 'image/png', extension: '.png' };
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mimeType: 'image/jpeg', extension: '.jpg' };
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return { mimeType: 'image/webp', extension: '.webp' };
    }
    return null;
}

export type EmailUserContext = {
    userId: string;
    tenantId: string;
    nome?: string;
    email?: string;
};

export type LoadedEmailSignature = {
    id: string;
    userId: string;
    ownerName: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
    updatedAt: Date;
    buffer: Buffer;
    contentId: string;
};

function safeAbsolutePath(storageKey: string): string {
    const absolute = path.resolve(STORAGE_ROOT, storageKey);
    const prefix = `${STORAGE_ROOT}${path.sep}`;
    if (!absolute.startsWith(prefix)) throw new Error('Caminho de assinatura inválido');
    return absolute;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapBase64(buffer: Buffer | string): string {
    const base64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer, 'utf8').toString('base64');
    return base64.match(/.{1,76}/g)?.join('\r\n') || '';
}

export async function getEmailSignatureMetadata(user: EmailUserContext) {
    return prisma.userEmailSignature.findFirst({
        where: { user_id: user.userId, tenant_id: user.tenantId },
        select: { id: true, original_name: true, mime_type: true, size_bytes: true, active: true, created_at: true, updated_at: true },
    });
}

export async function saveEmailSignature(user: EmailUserContext, file: Express.Multer.File) {
    if (!file.buffer?.length) throw new Error('O arquivo da assinatura está vazio');
    const detected = detectImage(file.buffer);
    if (!detected || !MIME_EXTENSIONS[detected.mimeType]) {
        throw new Error('O conteúdo enviado não é uma imagem PNG, JPG/JPEG ou WEBP válida');
    }
    const extension = detected.extension;

    const previous = await prisma.userEmailSignature.findFirst({
        where: { user_id: user.userId, tenant_id: user.tenantId },
    });
    const storageKey = path.join(user.tenantId, user.userId, `${randomUUID()}${extension}`);
    const absolute = safeAbsolutePath(storageKey);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.buffer);

    try {
        const saved = await prisma.userEmailSignature.upsert({
            where: { user_id: user.userId },
            create: {
                tenant_id: user.tenantId,
                user_id: user.userId,
                storage_key: storageKey,
                original_name: file.originalname,
                mime_type: detected.mimeType,
                size_bytes: file.size,
                active: true,
            },
            update: {
                storage_key: storageKey,
                original_name: file.originalname,
                mime_type: detected.mimeType,
                size_bytes: file.size,
                active: true,
            },
            select: { id: true, original_name: true, mime_type: true, size_bytes: true, active: true, created_at: true, updated_at: true },
        });
        if (previous?.storage_key && previous.storage_key !== storageKey) {
            fs.rmSync(safeAbsolutePath(previous.storage_key), { force: true });
        }
        return saved;
    } catch (error) {
        fs.rmSync(absolute, { force: true });
        throw error;
    }
}

export async function removeEmailSignature(user: EmailUserContext) {
    const current = await prisma.userEmailSignature.findFirst({
        where: { user_id: user.userId, tenant_id: user.tenantId },
    });
    if (!current) return false;
    await prisma.userEmailSignature.delete({ where: { id: current.id } });
    fs.rmSync(safeAbsolutePath(current.storage_key), { force: true });
    return true;
}

export async function loadEmailSignature(user: EmailUserContext): Promise<LoadedEmailSignature | null> {
    const record = await prisma.userEmailSignature.findFirst({
        where: { user_id: user.userId, tenant_id: user.tenantId, active: true },
        include: { user: { select: { nome: true } } },
    });
    if (!record) return null;
    const absolute = safeAbsolutePath(record.storage_key);
    if (!fs.existsSync(absolute)) return null;
    return {
        id: record.id,
        userId: record.user_id,
        ownerName: record.user.nome,
        mimeType: record.mime_type,
        originalName: record.original_name,
        sizeBytes: record.size_bytes,
        updatedAt: record.updated_at,
        buffer: fs.readFileSync(absolute),
        contentId: `lsi-user-email-signature-${record.user_id}`,
    };
}

function signatureHtml(signature: LoadedEmailSignature, source: string): string {
    return `<!-- LSI:USER_EMAIL_SIGNATURE --><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td><img src="${source}" width="590" alt="Assinatura de ${escapeHtml(signature.ownerName)}" style="display:block;width:100%;max-width:590px;height:auto;border:0;outline:none;text-decoration:none"></td></tr></table>`;
}

// Exportada para o validador de acabamento conferir onde a assinatura cai.
export function appendSignature(html: string, block: string): string {
    const semAnterior = html.replace(/<!-- LSI:USER_EMAIL_SIGNATURE -->[\s\S]*?<\/table>/i, '');

    // O template financeiro traz uma assinatura institucional textual entre os
    // marcadores ASSINATURA e FOOTER. Havendo assinatura pessoal, ela toma o
    // lugar daquele bloco — não se soma a ele, senão o e-mail sai com duas
    // assinaturas.
    //
    // A troca acontece NO LUGAR do bloco institucional, e não no fim do
    // documento. Antes a assinatura era apenas anexada ao final: como o
    // template é uma tabela centralizada e não tem </body>, a imagem de 590px
    // caía fora do cartão, alinhada à esquerda da página e abaixo do rodapé.
    // Por isso o bloco entra embrulhado numa linha de tabela — é para dentro de
    // um <table> que ele vai.
    const inicio = semAnterior.search(/<!-- ASSINATURA -->/i);
    const fim = semAnterior.search(/<!-- FOOTER -->/i);
    if (inicio >= 0 && fim > inicio) {
        const naLinha = `<!-- ASSINATURA -->
        <tr>
          <td style="padding:16px 24px 24px;">${block}</td>
        </tr>
        `;
        return semAnterior.slice(0, inicio) + naLinha + semAnterior.slice(fim);
    }

    // Demais e-mails (faturamento, por exemplo) montam o HTML sem esses
    // marcadores: para eles nada muda.
    const closingBody = semAnterior.toLowerCase().lastIndexOf('</body>');
    return closingBody >= 0 ? `${semAnterior.slice(0, closingBody)}${block}${semAnterior.slice(closingBody)}` : `${semAnterior}${block}`;
}

export async function composeEmailForUser(html: string, user: EmailUserContext, mode: 'preview' | 'cid') {
    const signature = await loadEmailSignature(user);
    if (!signature) return { html, signature: null as LoadedEmailSignature | null };
    const source = mode === 'cid'
        ? `cid:${signature.contentId}`
        : `data:${signature.mimeType};base64,${signature.buffer.toString('base64')}`;
    return { html: appendSignature(html, signatureHtml(signature, source)), signature };
}

export interface OutlookAttachment { filename: string; mimeType: string; buffer: Buffer }

type ImagemEmbutida = { cid: string; mimeType: string; nome: string; buffer: Buffer };

/**
 * Troca `<img src="data:image/...;base64,...">` por `cid:` e devolve as imagens
 * como partes MIME.
 *
 * A logo da LS saía embutida como data URI e sozinha respondia por 82% do peso
 * do e-mail (95 KB de 117 KB). Pior: Outlook e Gmail bloqueiam `data:` em
 * mensagem recebida por padrão, então havia chance real de o cabeçalho chegar
 * sem a marca. Por CID a imagem vira uma parte inline, que todo cliente
 * renderiza — o mesmo caminho que a assinatura do usuário já usava.
 *
 * Vale para qualquer imagem embutida, em qualquer um dos tipos de e-mail.
 */
function extrairImagensEmbutidas(html: string): { html: string; imagens: ImagemEmbutida[] } {
    const imagens: ImagemEmbutida[] = [];
    const vistas = new Map<string, string>();
    const EXTENSAO: Record<string, string> = {
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
        'image/webp': 'webp', 'image/svg+xml': 'svg',
    };

    const novoHtml = html.replace(
        /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)(?=["')])/g,
        (inteiro: string, mimeType: string, dados: string) => {
            const limpo = dados.replace(/\s+/g, '');
            // A mesma imagem repetida vira uma parte só, referenciada duas vezes.
            const jaVista = vistas.get(limpo);
            if (jaVista) return `cid:${jaVista}`;
            let buffer: Buffer;
            try { buffer = Buffer.from(limpo, 'base64'); } catch { return inteiro; }
            if (buffer.length === 0) return inteiro;
            const cid = `lsi-img-${randomUUID()}`;
            vistas.set(limpo, cid);
            imagens.push({ cid, mimeType, nome: `imagem-${imagens.length + 1}.${EXTENSAO[mimeType] || 'bin'}`, buffer });
            return `cid:${cid}`;
        },
    );
    return { html: novoHtml, imagens };
}

export function buildOutlookEml({ assunto, para, cc, html: htmlOriginal, signature, attachments = [] }: {
    assunto: string;
    para?: string | null;
    cc?: string | null;
    html: string;
    signature: LoadedEmailSignature | null;
    attachments?: OutlookAttachment[];
}): string {
    const { html, imagens } = extrairImagensEmbutidas(htmlOriginal);
    const subject = `=?UTF-8?B?${Buffer.from(assunto, 'utf8').toString('base64')}?=`;
    const common = ['MIME-Version: 1.0', 'X-Unsent: 1', para ? `To: ${para}` : 'To: ', cc ? `Cc: ${cc}` : null, `Subject: ${subject}`].filter(Boolean) as string[];
    const temInline = Boolean(signature) || imagens.length > 0;
    if (!temInline && attachments.length === 0) {
        return [...common, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(html), ''].join('\r\n');
    }

    const mixedBoundary = `----=_LSI_MIXED_${randomUUID().replace(/-/g, '')}`;
    const relatedBoundary = `----=_LSI_RELATED_${randomUUID().replace(/-/g, '')}`;
    // Tudo que é inline — a assinatura e as imagens do corpo — entra no mesmo
    // multipart/related, que é o que faz o cliente casar `cid:` com a parte.
    const parteInline = (cid: string, mimeType: string, nome: string, buffer: Buffer) => {
        const seguro = nome.replace(/[^a-zA-Z0-9._-]/g, '_') || 'imagem.png';
        return [
            `--${relatedBoundary}`,
            `Content-Type: ${mimeType}; name="${seguro}"`,
            'Content-Transfer-Encoding: base64',
            `Content-ID: <${cid}>`,
            `Content-Disposition: inline; filename="${seguro}"`,
            '', wrapBase64(buffer),
        ];
    };
    const bodyParts = temInline ? [
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`, '',
        `--${relatedBoundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(html),
        ...(signature ? parteInline(signature.contentId, signature.mimeType, signature.originalName || 'assinatura.png', signature.buffer) : []),
        ...imagens.flatMap(img => parteInline(img.cid, img.mimeType, img.nome, img.buffer)),
        `--${relatedBoundary}--`,
    ] : ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(html)];
    if (attachments.length === 0) return [...common, ...bodyParts, ''].join('\r\n');
    const fileParts = attachments.flatMap(file => {
        const name = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'anexo.bin';
        return [`--${mixedBoundary}`, `Content-Type: ${file.mimeType}; name="${name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${name}"`, '', wrapBase64(file.buffer)];
    });
    return [
        ...common,
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, '',
        `--${mixedBoundary}`, ...bodyParts, ...fileParts, `--${mixedBoundary}--`, '',
    ].join('\r\n');
}
