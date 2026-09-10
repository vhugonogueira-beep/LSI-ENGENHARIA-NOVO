import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../server';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'contratos');
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.doc', '.docx']);

function safeOriginalName(value: string): string {
    const base = path.basename(value || 'contrato');
    return base.replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 180) || 'contrato';
}

function absoluteFromStorageKey(storageKey: string): string {
    const absolute = path.resolve(STORAGE_ROOT, ...storageKey.split('/'));
    const rootPrefix = `${STORAGE_ROOT}${path.sep}`;
    if (!absolute.startsWith(rootPrefix)) throw new Error('Caminho de arquivo inválido');
    return absolute;
}

// Modelo inicial só para o sistema não nascer vazio — é um esqueleto genérico de
// contrato de prestação de serviço, SEM validação jurídica. Editável em
// "Fornecedores → Modelo de Contrato"; a LS Office deve revisar/substituir o texto
// pelo padrão aprovado pelo jurídico antes de usar com fornecedores reais.
const TEMPLATE_PADRAO_HTML = `
<p style="text-align:center"><strong>[REVISAR COM O JURÍDICO ANTES DE USAR]</strong></p>
<h2 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>

<p><strong>CONTRATANTE:</strong> LS OFFICE SERVIÇOS DE TELECOM E CONSTRUÇÕES LTDA, inscrita no
CNPJ sob o nº 19.853.545/0001-79, com sede na Travessa Barão do Triunfo, 3540, Sala 2303.</p>

<p><strong>CONTRATADO(A):</strong> {{fornecedor.nome}}, {{fornecedor.tipo_documento}} nº
{{fornecedor.documento}}, com endereço em {{fornecedor.endereco}}, {{fornecedor.cidade_uf}}.</p>

<p>As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de
Prestação de Serviços, que se regerá pelas cláusulas seguintes.</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>
<p>O presente contrato tem por objeto a prestação de serviços de <strong>{{contratacao.finalidade}}</strong>
referente à atividade "{{atividade.titulo}}" ({{atividade.codigo}}), no site {{atividade.site}},
conforme o escopo abaixo:</p>
<p>{{atividade.escopo}}</p>

<h3>CLÁUSULA 2ª — DO VALOR E FORMA DE PAGAMENTO</h3>
<p>Pela prestação dos serviços descritos na Cláusula 1ª, a CONTRATANTE pagará à CONTRATADA o
valor total de {{contratacao.valor_contratado}}, conforme condições de pagamento acordadas entre
as partes.</p>

<h3>CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATADA</h3>
<p>A CONTRATADA obriga-se a executar os serviços com qualidade técnica, dentro dos prazos
acordados, respeitando as normas de segurança do trabalho aplicáveis.</p>

<h3>CLÁUSULA 4ª — DA VIGÊNCIA E RESCISÃO</h3>
<p>O presente contrato vigora a partir da data de sua assinatura até a conclusão do objeto
descrito na Cláusula 1ª, podendo ser rescindido por qualquer das partes mediante notificação
prévia.</p>

<h3>CLÁUSULA 5ª — DO FORO</h3>
<p>Fica eleito o foro da comarca da CONTRATANTE para dirimir quaisquer dúvidas oriundas do
presente contrato.</p>

<p>E por estarem assim justas e contratadas, as partes assinam o presente instrumento.</p>

<p style="margin-top:60px">{{data_atual}}</p>

<div style="display:flex; justify-content:space-between; margin-top:80px">
  <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:8px">CONTRATANTE</div>
  <div style="text-align:center; width:45%; border-top:1px solid #000; padding-top:8px">CONTRATADA<br>{{fornecedor.nome}}</div>
</div>
`.trim();

function fmtMoeda(v: number | null | undefined): string {
    if (v == null) return 'R$ 0,00';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: Date): string {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function getOrCreateTemplate(tenantId: string, finalidade?: string | null) {
    const existente = await prisma.contratoTemplate.findFirst({
        where: { tenant_id: tenantId, finalidade: finalidade || null, ativo: true },
    });
    if (existente) return existente;

    // Sem modelo específico da finalidade — cai no modelo padrão (finalidade null); cria
    // o padrão na primeira vez que qualquer tenant pedir um modelo.
    if (finalidade) {
        const padrao = await prisma.contratoTemplate.findFirst({ where: { tenant_id: tenantId, finalidade: null, ativo: true } });
        if (padrao) return padrao;
    }
    return prisma.contratoTemplate.create({
        data: { tenant_id: tenantId, finalidade: finalidade || null, corpo_html: TEMPLATE_PADRAO_HTML },
    });
}

export async function updateTemplate(id: string, data: { nome?: string; corpo_html?: string }) {
    return prisma.contratoTemplate.update({ where: { id }, data });
}

function renderTemplate(corpoHtml: string, tokens: Record<string, string>): string {
    return corpoHtml.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, chave) => tokens[chave] ?? match);
}

export async function gerarContrato(contratacaoId: string) {
    const contratacao = await prisma.contratacaoFornecedor.findUnique({
        where: { id: contratacaoId },
        include: { atividade: true, supplier: true, funcionario: true },
    });
    if (!contratacao) throw new Error('Contratação não encontrada');

    const template = await getOrCreateTemplate(contratacao.tenant_id, contratacao.finalidade);

    const supplier: any = contratacao.supplier || (contratacao.funcionario ? {
        ...contratacao.funcionario,
        tipo: 'PESSOA_FISICA',
        endereco: contratacao.funcionario.logradouro,
        cidade: contratacao.funcionario.municipio,
    } : null);
    if (!supplier) throw new Error('Contratação sem favorecido vinculado');
    const atividade = contratacao.atividade;
    const tokens: Record<string, string> = {
        'fornecedor.nome': supplier.nome,
        'fornecedor.tipo_documento': supplier.tipo === 'PESSOA_FISICA' ? 'CPF' : 'CNPJ',
        'fornecedor.documento': supplier.tipo === 'PESSOA_FISICA' ? (supplier.cpf || '—') : (supplier.cnpj || '—'),
        'fornecedor.endereco': supplier.endereco || '—',
        'fornecedor.cidade_uf': [supplier.cidade, supplier.uf].filter(Boolean).join('/') || '—',
        'atividade.titulo': atividade.titulo,
        'atividade.codigo': atividade.codigo,
        'atividade.escopo': atividade.descricao || 'Escopo não preenchido na Identificação da Atividade.',
        'atividade.site': atividade.id_site_sharing || atividade.id_site_operadora || '—',
        'contratacao.finalidade': contratacao.finalidade.replace(/_/g, ' '),
        'contratacao.valor_contratado': fmtMoeda(contratacao.valor_contratado),
        'data_atual': fmtData(new Date()),
    };

    const conteudoHtml = renderTemplate(template.corpo_html, tokens);

    return prisma.contrato.upsert({
        where: { contratacao_id: contratacaoId },
        create: { contratacao_id: contratacaoId, template_id: template.id, conteudo_html: conteudoHtml },
        update: { template_id: template.id, conteudo_html: conteudoHtml, status: 'GERADO', gerado_em: new Date(), assinado_em: null },
    });
}

export async function renderContratoParaImpressao(contratoId: string): Promise<string> {
    const contrato = await prisma.contrato.findUnique({
        where: { id: contratoId },
        include: { contratacao: { include: { atividade: true, supplier: true, funcionario: true } } },
    });
    if (!contrato) throw new Error('Contrato não encontrado');

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Contrato — ${contrato.contratacao.supplier?.nome || contrato.contratacao.funcionario?.nome}</title>
        <style>
          @page { size: A4 portrait; margin: 20mm; }
          body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.6; font-size: 13px; max-width: 760px; margin: 0 auto; padding: 20px; }
          h2, h3 { color: #002060; }
          h3 { margin-top: 28px; }
        </style>
      </head>
      <body>${contrato.conteudo_html}</body>
      </html>
    `;
}

// Anexar o contrato assinado (scan/PDF recebido do fornecedor) marca o contrato como
// ASSINADO — é literalmente o evento que confirma a assinatura colhida fora do sistema.
export async function storeContratoArquivo(contratoId: string, file: Express.Multer.File, uploadedBy?: string) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Formato não permitido: ${extension || 'sem extensão'}`);
    if (!file.buffer?.length) throw new Error('O arquivo enviado está vazio');

    const contrato = await prisma.contrato.findUnique({ where: { id: contratoId } });
    if (!contrato) throw new Error('Contrato não encontrado');

    const originalName = safeOriginalName(file.originalname);
    const storageKey = `${contratoId}/${randomUUID()}${extension}`;
    const absolutePath = absoluteFromStorageKey(storageKey);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
        return await prisma.$transaction(async tx => {
            const attachment = await tx.contratoArquivo.create({
                data: {
                    contrato_id: contratoId,
                    nome_original: originalName,
                    mime_type: file.mimetype || 'application/octet-stream',
                    tamanho_bytes: file.size,
                    storage_key: storageKey,
                    sha256,
                    uploaded_by: uploadedBy || null,
                },
            });
            await tx.contrato.update({
                where: { id: contratoId },
                data: { status: 'ASSINADO', assinado_em: new Date() },
            });
            return attachment;
        });
    } catch (error) {
        await fs.unlink(absolutePath).catch(() => undefined);
        throw error;
    }
}

export async function getStoredContratoArquivo(attachmentId: string) {
    const attachment = await prisma.contratoArquivo.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Arquivo não encontrado');
    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.access(absolutePath);
    return { attachment, absolutePath };
}

export async function deleteStoredContratoArquivo(attachmentId: string) {
    const attachment = await prisma.contratoArquivo.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Arquivo não encontrado');
    await prisma.contratoArquivo.delete({ where: { id: attachmentId } });
    const absolutePath = absoluteFromStorageKey(attachment.storage_key);
    await fs.unlink(absolutePath).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
}
