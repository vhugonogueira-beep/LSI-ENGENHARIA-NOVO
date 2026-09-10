import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../server';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'reembolsos');

function nomeSeguro(valor: string): string {
    // Busboy/Multer pode entregar nomes UTF-8 interpretados como latin1 no
    // multipart (ex.: JOSÉ vira JOSÃ‰). Corrige apenas quando a conversao
    // elimina os marcadores tipicos de texto corrompido.
    const recebido = valor || 'memoria-calculo';
    const pareceMojibake = [...recebido].some(caractere => [0x00c2, 0x00c3].includes(caractere.codePointAt(0) || 0));
    const convertido = pareceMojibake ? Buffer.from(recebido, 'latin1').toString('utf8') : recebido;
    const normalizado = convertido.includes('\uFFFD') ? recebido : convertido;
    return path.basename(normalizado)
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'memoria-calculo';
}

function absoluto(storageKey: string): string {
    const caminho = path.resolve(STORAGE_ROOT, ...storageKey.split('/'));
    if (!caminho.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error('Caminho de arquivo inválido');
    return caminho;
}

export async function salvarArquivoReembolso(reembolsoId: string, file: Express.Multer.File, uploadedBy?: string) {
    const reembolso = await prisma.reembolso.findUnique({ where: { id: reembolsoId } });
    if (!reembolso) throw new Error('Reembolso ou adiantamento não encontrado');
    const original = nomeSeguro(file.originalname || 'arquivo-sem-nome');
    const extensao = path.extname(original).toLowerCase();
    if (!file.buffer?.length) throw new Error('O arquivo enviado está vazio');

    // Qualquer formato e aceito, inclusive compactados e arquivos sem extensao.
    // O conteudo nao fica em pasta publica e nunca e executado pelo servidor:
    // recebe nome interno aleatorio e e entregue somente como download.
    const storageKey = `${reembolsoId}/${randomUUID()}${extensao}`;
    const caminho = absoluto(storageKey);
    await fs.mkdir(path.dirname(caminho), { recursive: true });
    await fs.writeFile(caminho, file.buffer, { flag: 'wx' });
    try {
        return await prisma.reembolsoArquivo.create({
            data: {
                reembolso_id: reembolsoId,
                tipo: 'MEMORIA_CALCULO',
                nome_original: original,
                mime_type: file.mimetype || 'application/octet-stream',
                tamanho_bytes: file.size,
                storage_key: storageKey,
                uploaded_by: uploadedBy || null,
            },
        });
    } catch (error) {
        await fs.unlink(caminho).catch(() => undefined);
        throw error;
    }
}

export async function obterArquivoReembolso(id: string) {
    const arquivo = await prisma.reembolsoArquivo.findUnique({ where: { id } });
    if (!arquivo) throw new Error('Arquivo não encontrado');
    const caminho = absoluto(arquivo.storage_key);
    await fs.access(caminho);
    return { arquivo, caminho };
}

export async function excluirArquivoReembolso(id: string) {
    const arquivo = await prisma.reembolsoArquivo.findUnique({ where: { id } });
    if (!arquivo) throw new Error('Arquivo não encontrado');
    await prisma.reembolsoArquivo.delete({ where: { id } });
    await fs.unlink(absoluto(arquivo.storage_key)).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
}
