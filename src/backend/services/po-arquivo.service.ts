import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../server';
import { lerPO, LeituraPO } from './po-leitura.service';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'pos');
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

function safeOriginalName(value: string): string {
    const base = path.basename(value || 'po');
    return base.replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'po';
}

function absoluteFromStorageKey(storageKey: string): string {
    const absolute = path.resolve(STORAGE_ROOT, ...storageKey.split('/'));
    const rootPrefix = `${STORAGE_ROOT}${path.sep}`;
    if (!absolute.startsWith(rootPrefix)) throw new Error('Caminho de arquivo inválido');
    return absolute;
}

// Anexar o PDF da PO marca o status como RECEBIDA e dispara a leitura do documento:
// número, valor e data saem do próprio PDF (heurística por layout — ver
// po-leitura.service). O que foi lido preenche apenas os campos ainda vazios, para
// nunca sobrescrever uma correção manual, e volta para conferência na tela.
export async function storePOArquivo(poId: string, file: Express.Multer.File, uploadedBy?: string): Promise<{ attachment: any; leitura: LeituraPO | null }> {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Formato não permitido: ${extension || 'sem extensão'}`);
    if (!file.buffer?.length) throw new Error('O arquivo enviado está vazio');

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new Error('PO não encontrada');

    const originalName = safeOriginalName(file.originalname);
    const storageKey = `${poId}/${randomUUID()}${extension}`;
    const absolutePath = absoluteFromStorageKey(storageKey);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

    const leitura = extension === '.pdf' ? await lerPO(file.buffer) : null;

    try {
        const attachment = await prisma.$transaction(async tx => {
            const criado = await tx.purchaseOrderArquivo.create({
                data: {
                    po_id: poId,
                    nome_original: originalName,
                    mime_type: file.mimetype || 'application/octet-stream',
                    tamanho_bytes: file.size,
                    storage_key: storageKey,
                    sha256,
                    uploaded_by: uploadedBy || null,
                },
            });

            const dados: any = {};
            if (po.status === 'AGUARDANDO') dados.status = 'RECEBIDA';
            if (leitura) {
                // Anexar um PDF é um ato explícito de trazer o documento como fonte da
                // verdade — o que for lido substitui o que estava lá (os campos seguem
                // editáveis na tela para corrigir o que a leitura errar).
                if (leitura.numero) dados.numero = leitura.numero;
                if (leitura.valor != null) dados.valor = leitura.valor;
                if (leitura.data) dados.data = new Date(`${leitura.data}T00:00:00.000Z`);
                // Guarda o que foi lido para a tela sempre poder mostrar (sem o texto bruto,
                // que fica grande e só serve para depuração pontual).
                dados.leitura_json = JSON.stringify({ ...leitura, texto_extraido: leitura.texto_extraido.slice(0, 2000) });
            }
            if (Object.keys(dados).length > 0) {
                await tx.purchaseOrder.update({ where: { id: poId }, data: dados });
            }
            return criado;
        });
        if (leitura) await sincronizarLinhasDaPO(poId, leitura);
        return { attachment, leitura };
    } catch (error) {
        await fs.unlink(absolutePath).catch(() => undefined);
        throw error;
    }
}

// Relê o PDF já anexado, sem precisar remover e subir de novo. Serve para POs anexadas
// antes de uma melhoria no leitor: reprocessa e regrava o que foi extraído.
export async function relerPOArquivo(poId: string): Promise<LeituraPO> {
    const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: { arquivos: { orderBy: { created_at: 'desc' }, take: 1 } },
    });
    if (!po) throw new Error('PO não encontrada');
    const arquivo = po.arquivos[0];
    if (!arquivo) throw new Error('Esta PO não tem PDF anexado');
    if (path.extname(arquivo.nome_original).toLowerCase() !== '.pdf') {
        throw new Error('O anexo desta PO não é um PDF');
    }

    let buffer: Buffer;
    try {
        buffer = await fs.readFile(absoluteFromStorageKey(arquivo.storage_key));
    } catch (e: any) {
        if (e?.code === 'ENOENT') {
            throw new Error(`O arquivo "${arquivo.nome_original}" não está mais no servidor. Remova o anexo e envie o PDF novamente.`);
        }
        throw e;
    }
    const leitura = await lerPO(buffer);

    // Reler é um pedido explícito de reprocessar o documento, então o resultado da
    // leitura passa a valer sobre o que estava gravado.
    const dados: any = { leitura_json: JSON.stringify({ ...leitura, texto_extraido: leitura.texto_extraido.slice(0, 2000) }) };
    if (leitura.numero) dados.numero = leitura.numero;
    if (leitura.valor != null) dados.valor = leitura.valor;
    if (leitura.data) dados.data = new Date(`${leitura.data}T00:00:00.000Z`);
    await prisma.purchaseOrder.update({ where: { id: poId }, data: dados });
    await sincronizarLinhasDaPO(poId, leitura);

    return leitura;
}

// Materializa as linhas da PO a partir do que foi lido no PDF. Só cria o que ainda não
// existe: uma linha já faturada parcialmente não pode ser recriada, senão o histórico de
// faturamento parcial se perderia.
export async function sincronizarLinhasDaPO(poId: string, leitura: LeituraPO) {
    if (!leitura.itens?.length) return;

    const existentes = await prisma.purchaseOrderLinha.findMany({ where: { po_id: poId } });
    const porNumero = new Map(existentes.map(l => [l.numero_linha, l]));

    for (const [i, item] of leitura.itens.entries()) {
        const numero = item.item || String(i + 1).padStart(4, '0');
        const dados = {
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade,
            site: item.site,
            cidade: item.cidade,
            projeto: item.projeto,
            valor_unitario: item.valor_unitario,
            valor_total: item.valor ?? 0,
            ordem: i,
        };
        const existente = porNumero.get(numero);
        if (existente) {
            await prisma.purchaseOrderLinha.update({ where: { id: existente.id }, data: dados });
        } else {
            await prisma.purchaseOrderLinha.create({ data: { po_id: poId, numero_linha: numero, ...dados } });
        }
    }
}

export async function getStoredPOArquivo(attachmentId: string) {
    const attachment = await prisma.purchaseOrderArquivo.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Arquivo não encontrado');
    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.access(absolutePath);
    return { attachment, absolutePath };
}

// Remove o arquivo do disco (o registro é apagado por quem chama) e, se a pasta da PO
// ficar vazia, remove a pasta junto para não deixar diretórios órfãos acumulando.
export async function removerArquivoDoDisco(storageKey: string) {
    const absoluto = absoluteFromStorageKey(storageKey);
    await fs.unlink(absoluto).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
    const pasta = path.dirname(absoluto);
    const restantes = await fs.readdir(pasta).catch(() => null);
    if (restantes && restantes.length === 0) {
        await fs.rmdir(pasta).catch(() => undefined);
    }
}

export async function deleteStoredPOArquivo(attachmentId: string) {
    const attachment = await prisma.purchaseOrderArquivo.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Arquivo não encontrado');
    await prisma.purchaseOrderArquivo.delete({ where: { id: attachmentId } });
    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.unlink(absolutePath).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
}
