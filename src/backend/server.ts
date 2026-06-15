import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

export const prisma = new PrismaClient();
export const app = express();

const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://192.168.10.15:5173',
    'http://192.168.0.167:5173',
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
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'LS Orçamento API is running' });
});

import authRoutes from './routes/auth.routes';
import budgetRoutes from './routes/budget.routes';
import masterRoutes from './routes/master.routes';
import analyticsRoutes from './routes/analytics.routes';
import inflationRoutes from './routes/inflation.routes';
import bdiRoutes from './routes/bdi.routes';
import supplierRoutes from './routes/supplier.routes';
import pricebookRoutes from './routes/pricebook.routes';
import importRoutes from './routes/import.routes';

app.use('/api/auth', authRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inflation', inflationRoutes);
app.use('/api/bdi', bdiRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/pricebooks', pricebookRoutes);
app.use('/api/import', importRoutes);
app.use('/api', masterRoutes);

const PORT = process.env.PORT || 3001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
