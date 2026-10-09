import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Arquivo original de um orçamento importado (Excel/PDF), guardado ao lado dos
// demais anexos em storage/ — fora do git. Um orçamento pode ter vários
// (reimportações); o nome leva o instante na frente para não sobrescrever.

const RAIZ = path.resolve(process.cwd(), 'storage', 'orcamentos-importados');

function pastaDo(budgetId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(budgetId)) throw new Error('Orçamento inválido');
    return path.join(RAIZ, budgetId);
}

const nomeSeguro = (nome: string) => path.basename(nome).replace(/[^\w.\- ()À-ú]/g, '_').slice(-120) || 'orcamento';

export async function guardarArquivoImportado(budgetId: string, nomeOriginal: string, buffer: Buffer) {
    const pasta = pastaDo(budgetId);
    await fs.mkdir(pasta, { recursive: true });
    const nome = `${Date.now()}-${nomeSeguro(nomeOriginal)}`;
    await fs.writeFile(path.join(pasta, nome), buffer);
    return nome;
}

export async function listarArquivosImportados(budgetId: string) {
    const pasta = pastaDo(budgetId);
    if (!existsSync(pasta)) return [];
    const nomes = await fs.readdir(pasta);
    const lista = await Promise.all(nomes.map(async nome => {
        const st = await fs.stat(path.join(pasta, nome));
        return { nome, nome_original: nome.replace(/^\d+-/, ''), tamanho: st.size, enviado_em: st.mtime.toISOString() };
    }));
    return lista.sort((a, b) => b.enviado_em.localeCompare(a.enviado_em));
}

export async function removerArquivoImportado(budgetId: string, nome: string) {
    const caminho = caminhoArquivoImportado(budgetId, nome);
    if (!caminho) throw new Error('Arquivo não encontrado');
    await fs.unlink(caminho);
}

/** Caminho absoluto do arquivo, só se ele estiver dentro da pasta do orçamento. */
export function caminhoArquivoImportado(budgetId: string, nome: string) {
    const pasta = pastaDo(budgetId);
    const alvo = path.resolve(pasta, path.basename(nome));
    if (!alvo.startsWith(pasta + path.sep) || !existsSync(alvo)) return null;
    return alvo;
}
