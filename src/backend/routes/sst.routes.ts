import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '../server';
import { catalogo, codigoDoNome, resumoSst, sstDoFornecedor } from '../services/sst.service';
import { guardarArquivoSst, caminhoArquivoSst, removerArquivoSst } from '../services/sst-arquivo.service';

// Segurança do trabalho de fornecedores e prestadores. Documentos (Qualificacao)
// seguem em /api/qualificacoes; aqui ficam catálogo, equipe, anexos e resumo.

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function tenantDe(req: Request): Promise<string> {
    const t = (req as any).tenantId || (req as any).user?.tenantId;
    if (t) return t;
    const primeiro = await prisma.tenant.findFirst();
    if (!primeiro) throw new Error('Nenhum tenant cadastrado');
    return primeiro.id;
}

const rota = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(e => (res.headersSent ? next(e) : res.status(400).json({ error: e.message })));

const lista = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : []);

// ── Catálogo: documentos e trabalhos (de fábrica + criados pela empresa)
router.get('/catalogo', rota(async (req, res) => res.json(await catalogo(await tenantDe(req)))));

router.post('/catalogo', rota(async (req, res) => {
    const tenant_id = await tenantDe(req);
    const tipo = req.body.tipo === 'TRABALHO' ? 'TRABALHO' : 'DOCUMENTO';
    const nome = String(req.body.nome || '').trim();
    if (nome.length < 3) return res.status(400).json({ error: 'Informe o nome' });
    const codigo = codigoDoNome(nome);
    // Mesmo código ou mesmo nome (sem acento/caixa) de um item que já está na lista.
    const atual = await catalogo(tenant_id);
    const repetido = [...atual.documentos, ...atual.trabalhos].some(i => i.codigo === codigo || codigoDoNome(i.nome) === codigo);
    if (!codigo || repetido) return res.status(400).json({ error: `"${nome}" já existe na lista` });
    const exige = tipo === 'TRABALHO' ? JSON.parse(lista(req.body.exige)) : [];
    if (tipo === 'TRABALHO' && !exige.length) return res.status(400).json({ error: 'Escolha ao menos um documento exigido para este trabalho' });
    const existente = await prisma.itemCatalogoSst.findUnique({ where: { tenant_id_codigo: { tenant_id, codigo } } });
    const dados = { tipo, nome, meses: Math.max(0, Math.min(120, Number(req.body.meses) || 0)), exige: tipo === 'TRABALHO' ? JSON.stringify(exige) : null, ativo: true };
    const item = existente
        ? await prisma.itemCatalogoSst.update({ where: { id: existente.id }, data: dados })
        : await prisma.itemCatalogoSst.create({ data: { tenant_id, codigo, ...dados } });
    res.status(201).json(item);
}));

// Desativa (documentos já enviados com esse tipo continuam valendo como estão).
router.delete('/catalogo/:id', rota(async (req, res) => {
    await prisma.itemCatalogoSst.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.status(204).end();
}));

// ── Resumo de todos os fornecedores (selo do cartão, filtro, contratação)
router.get('/resumo', rota(async (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : undefined;
    res.json(await resumoSst(await tenantDe(req), ids));
}));

// ── Um fornecedor: documentos, equipe e pendências
router.get('/fornecedores/:id', rota(async (req, res) => res.json(await sstDoFornecedor(req.params.id))));

router.put('/fornecedores/:id/trabalhos', rota(async (req, res) => {
    await prisma.supplier.update({ where: { id: req.params.id }, data: { sst_trabalhos: lista(req.body.trabalhos) } });
    res.json(await sstDoFornecedor(req.params.id));
}));

// ── Equipe do prestador (só dados e documentos; não recebe pagamento)
const CAMPOS_MEMBRO = ['nome', 'cpf', 'rg', 'funcao', 'telefone', 'observacoes'] as const;
function dadosMembro(corpo: any) {
    const d: any = {};
    for (const c of CAMPOS_MEMBRO) if (corpo[c] !== undefined) d[c] = corpo[c] === '' ? null : String(corpo[c]).trim();
    if (corpo.sst_trabalhos !== undefined) d.sst_trabalhos = lista(corpo.sst_trabalhos);
    return d;
}

router.post('/membros', rota(async (req, res) => {
    const fornecedor = await prisma.supplier.findUnique({ where: { id: String(req.body.supplier_id || '') } });
    if (!fornecedor) return res.status(400).json({ error: 'Fornecedor não encontrado' });
    const dados = dadosMembro(req.body);
    if (!dados.nome) return res.status(400).json({ error: 'Informe o nome do membro da equipe' });
    const m = await prisma.membroEquipe.create({ data: { ...dados, tenant_id: fornecedor.tenant_id, supplier_id: fornecedor.id } });
    res.status(201).json(m);
}));

router.put('/membros/:id', rota(async (req, res) => {
    const dados = dadosMembro(req.body);
    if (dados.nome === null) return res.status(400).json({ error: 'Informe o nome do membro da equipe' });
    res.json(await prisma.membroEquipe.update({ where: { id: req.params.id }, data: dados }));
}));

// Sai da equipe, mas o histórico de documentos fica.
router.delete('/membros/:id', rota(async (req, res) => {
    await prisma.membroEquipe.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.status(204).end();
}));

// ── Anexos dos documentos (dados pessoais: só com login e permissão de cadastro)
router.post('/documentos/:id/arquivos', (req, res, next) => upload.single('arquivo')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 15 MB' : err.message });
    next();
}), rota(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo no campo "arquivo"' });
    res.status(201).json(await guardarArquivoSst(req.params.id, req.file, (req as any).user?.userId));
}));

router.get('/arquivos/:id', rota(async (req, res) => {
    const { arquivo, caminho } = await caminhoArquivoSst(req.params.id);
    res.setHeader('Content-Type', arquivo.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(arquivo.nome_original)}`);
    res.sendFile(caminho);
}));

router.delete('/arquivos/:id', rota(async (req, res) => {
    await removerArquivoSst(req.params.id);
    res.status(204).end();
}));

export default router;
