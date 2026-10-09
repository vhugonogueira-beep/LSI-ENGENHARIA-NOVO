import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '../server';

// Anexos de documentos de SST (RG, CPF, certificados de NR...). Ficam em
// storage/sst/<documento>/, fora do git — são dados pessoais.

const RAIZ = path.resolve(process.cwd(), 'storage', 'sst');
const EXTENSOES = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic']);

function absoluto(storageKey: string) {
    const alvo = path.resolve(RAIZ, ...storageKey.split('/'));
    if (!alvo.startsWith(RAIZ + path.sep)) throw new Error('Caminho de arquivo inválido');
    return alvo;
}

const nomeSeguro = (v: string) => path.basename(v || 'documento').replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'documento';

export async function guardarArquivoSst(qualificacaoId: string, file: Express.Multer.File, usuario?: string) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES.has(ext)) throw new Error(`Formato não permitido: ${ext || 'sem extensão'}. Envie PDF ou foto (JPG, PNG).`);
    if (!file.buffer?.length) throw new Error('O arquivo enviado está vazio');
    const doc = await prisma.qualificacao.findUnique({ where: { id: qualificacaoId } });
    if (!doc) throw new Error('Documento não encontrado');

    const storage_key = `${qualificacaoId}/${randomUUID()}${ext}`;
    const caminho = absoluto(storage_key);
    await fs.mkdir(path.dirname(caminho), { recursive: true });
    await fs.writeFile(caminho, file.buffer, { flag: 'wx' });
    try {
        return await prisma.qualificacaoArquivo.create({
            data: {
                qualificacao_id: qualificacaoId, nome_original: nomeSeguro(file.originalname),
                mime_type: file.mimetype || 'application/octet-stream', tamanho_bytes: file.size,
                storage_key, uploaded_by: usuario || null,
            },
        });
    } catch (e) {
        await fs.unlink(caminho).catch(() => undefined);
        throw e;
    }
}

export async function caminhoArquivoSst(arquivoId: string) {
    const arquivo = await prisma.qualificacaoArquivo.findUnique({ where: { id: arquivoId } });
    if (!arquivo) throw new Error('Arquivo não encontrado');
    const caminho = absoluto(arquivo.storage_key);
    if (!existsSync(caminho)) throw new Error('Arquivo não encontrado no armazenamento');
    return { arquivo, caminho };
}

export async function removerArquivoSst(arquivoId: string) {
    const arquivo = await prisma.qualificacaoArquivo.delete({ where: { id: arquivoId } });
    await fs.unlink(absoluto(arquivo.storage_key)).catch(() => undefined);
}

/** Antes de apagar um documento: os anexos saem do disco (o banco apaga em cascata). */
export async function removerArquivosDoDocumento(qualificacaoId: string) {
    const arquivos = await prisma.qualificacaoArquivo.findMany({ where: { qualificacao_id: qualificacaoId } });
    for (const a of arquivos) await fs.unlink(absoluto(a.storage_key)).catch(() => undefined);
}
