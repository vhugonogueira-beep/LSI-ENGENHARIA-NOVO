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
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Origem não permitida pelo CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '25mb' })); // comprovantes chegam em base64

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'LS Orçamento API is running' });
});

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

const PORT = process.env.PORT || 3001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
