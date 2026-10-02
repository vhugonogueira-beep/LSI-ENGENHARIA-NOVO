import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

export const prisma = new PrismaClient();
export const app = express();

const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:3000',
    'http://192.168.10.15:5173',
    'http://192.168.10.15:5174',
    'http://192.168.0.167:5173',
    'http://192.168.0.167:5174',
    'http://192.168.97.87:5174',
    process.env.FRONTEND_URL,
    // Endereços públicos (ex.: túnel Cloudflare), separados por vírgula.
    ...(process.env.PUBLIC_ORIGINS || '').split(',').map(o => o.trim()),
].filter(Boolean) as string[];

// Atrás do túnel Cloudflare o IP real chega em cabeçalho; sem isto o limite
// de tentativas de login contaria todo mundo como o mesmo visitante.
app.set('trust proxy', 1);

app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    // Mesma origem: a tela servida por este servidor chamando a própria API.
    // É o caso do túnel, cujo endereço pode não estar na lista (trycloudflare
    // muda a cada reinício).
    const mesmaOrigem = Boolean(origin) && origin === `${req.protocol}://${req.headers.host}`;
    if (!origin || mesmaOrigem || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, { origin: true, credentials: true });
    } else {
        callback(new Error('Origem não permitida pelo CORS'));
    }
}));
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
app.use(express.json({ limit: '25mb' })); // comprovantes chegam em base64

// Tentativas de login: 10 por IP e e-mail a cada 15 minutos. Com o sistema na
// internet, sem isto a senha fica aberta a tentativa e erro sem fim.
const tentativasLogin = new Map<string, { n: number; desde: number }>();
const JANELA_LOGIN_MS = 15 * 60 * 1000;
app.post('/api/auth/login', (req, res, next) => {
    const agora = Date.now();
    const chave = `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`;
    const atual = tentativasLogin.get(chave);
    if (atual && agora - atual.desde < JANELA_LOGIN_MS && atual.n >= 10) {
        const minutos = Math.ceil((JANELA_LOGIN_MS - (agora - atual.desde)) / 60000);
        return res.status(429).json({ error: `Muitas tentativas de login. Tente de novo em ${minutos} minuto(s).` });
    }
    res.on('finish', () => {
        if (res.statusCode === 200) { tentativasLogin.delete(chave); return; }
        const t = tentativasLogin.get(chave);
        if (!t || agora - t.desde >= JANELA_LOGIN_MS) tentativasLogin.set(chave, { n: 1, desde: agora });
        else t.n += 1;
    });
    next();
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'LS Orçamento API is running' });
});

// Porteiro único: sessão obrigatória em /api (menos login, convite, health e
// localidades) e permissão por ação — ver permissoes.service.ts.
import { controleDeAcesso } from './middleware/auth.middleware';
app.use('/api', (req, res, next) => { controleDeAcesso(req, res, next).catch(next); });

import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import budgetRoutes from './routes/budget.routes';
import masterRoutes from './routes/master.routes';
import analyticsRoutes from './routes/analytics.routes';
import inflationRoutes from './routes/inflation.routes';
import bdiRoutes from './routes/bdi.routes';
import supplierRoutes from './routes/supplier.routes';
import pricebookRoutes from './routes/pricebook.routes';
import empresaRoutes from './routes/empresa.routes';
import funcionarioRoutes from './routes/funcionario.routes';
import qualificacaoRoutes from './routes/qualificacao.routes';
import localidadesRoutes from './routes/localidades.routes';
import usuariosRoutes from './routes/usuarios.routes';
import aprovacoesPagamentoRoutes from './routes/aprovacoes-pagamento.routes';
import controladoriaRoutes from './routes/controladoria.routes';
import reembolsoRoutes from './routes/reembolso.routes';
import pagamentosRoutes from './routes/pagamentos.routes';
import importRoutes from './routes/import.routes';
import demandaRoutes from './routes/demanda.routes';
import acionamentoRoutes from './routes/acionamento.routes';
import atividadeRoutes from './routes/atividade.routes';
import negociacaoRoutes from './routes/negociacao.routes';
import contratacaoRoutes from './routes/contratacao.routes';
import apcRoutes from './routes/apc.routes';
import cronogramaRoutes from './routes/cronograma.routes';
import execucaoRoutes from './routes/execucao.routes';
import documentacaoRoutes from './routes/documentacao.routes';
import poRoutes from './routes/po.routes';
import faturamentoRoutes from './routes/faturamento.routes';
import contratoRoutes from './routes/contrato.routes';
import prestacaoConsolidadaRoutes from './routes/prestacao-consolidada.routes';
import emailRoutingRoutes from './routes/email-routing.routes';
import clienteRoutes from './routes/cliente.routes';
import paymentAttachmentRoutes from './routes/payment-attachment.routes';

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inflation', inflationRoutes);
app.use('/api/bdi', bdiRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/pricebooks', pricebookRoutes);
app.use('/api/empresa', empresaRoutes);
app.use('/api/funcionarios', funcionarioRoutes);
app.use('/api/qualificacoes', qualificacaoRoutes);
app.use('/api/localidades', localidadesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/aprovacoes-pagamento', aprovacoesPagamentoRoutes);
app.use('/api/controladoria', controladoriaRoutes);
app.use('/api/reembolsos', reembolsoRoutes);
app.use('/api/prestacoes-contas', prestacaoConsolidadaRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/import', importRoutes);
app.use('/api/demandas', demandaRoutes);
app.use('/api/acionamentos', acionamentoRoutes);
app.use('/api/atividades', atividadeRoutes);
app.use('/api/negociacoes', negociacaoRoutes);
app.use('/api/contratacoes', contratacaoRoutes);
app.use('/api/apcs', apcRoutes);
app.use('/api/cronograma', cronogramaRoutes);
app.use('/api/execucao', execucaoRoutes);
app.use('/api/documentacao', documentacaoRoutes);
app.use('/api/pos', poRoutes);
app.use('/api/faturamento', faturamentoRoutes);
app.use('/api/contratos', contratoRoutes);
app.use('/api/email-config', emailRoutingRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/payment-attachments', paymentAttachmentRoutes);
app.use('/api', masterRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Produção (túnel): este mesmo servidor entrega as telas já compiladas em
// dist/, então tudo sai por uma porta só. Em desenvolvimento o Vite cuida disso
// e a pasta pode nem existir.
import fs from 'fs';
import path from 'path';
const DIST = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const PORT = process.env.PORT || 3001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
