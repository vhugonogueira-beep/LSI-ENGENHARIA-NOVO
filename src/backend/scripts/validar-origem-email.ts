import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'LSOfficeERP@2026#SuperSecretKey!';

async function run() {
    const atividade = await prisma.atividade.findFirst({
        where: { id_site_sharing: 'PAMRB008' },
        include: { reembolsos: { where: { natureza: 'REEMBOLSO' }, take: 1 } },
    });
    if (!atividade || !atividade.reembolsos[0]) throw new Error('PAMRB008/reembolso não encontrado');

    const usuario = await prisma.user.findFirst({
        where: { tenant_id: atividade.tenant_id, ativo: true, email: { contains: 'victor.hugo' } },
    });
    if (!usuario) throw new Error('Usuário de validação não encontrado');

    const token = jwt.sign({
        userId: usuario.id,
        tenantId: usuario.tenant_id,
        email: usuario.email,
        nome: usuario.nome,
        role: usuario.role,
    }, JWT_SECRET, { expiresIn: '5m' });

    const diretorioTeste = '\\\\servidor\\ENGENHARIA\\OBRAS\\IMPLANTACAO\\PAMRB008';
    const response = await fetch(`${API}/reembolsos/${atividade.reembolsos[0].id}/email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_diretorio: diretorioTeste }),
    });
    const email = await response.json() as { assunto?: string; html?: string; error?: string };
    if (!response.ok) throw new Error(email.error || `HTTP ${response.status}`);

    const origemEsperada = atividade.tipo_demanda === 'IMPLANTACAO' ? 'IMPLANTAÇÃO' : 'OPERAÇÕES';
    if (!email.assunto?.includes(`· ${origemEsperada} |`)) {
        throw new Error(`Assunto não reflete ${atividade.tipo_demanda}: ${email.assunto}`);
    }
    if (!email.html?.includes(diretorioTeste)) {
        throw new Error('E-mail de reembolso não exibiu o diretório da atividade');
    }

    console.log(JSON.stringify({
        ok: true,
        site: atividade.id_site_sharing,
        tipo_demanda: atividade.tipo_demanda,
        modelo_operacao: atividade.modelo_operacao,
        assunto: email.assunto,
        diretorio: true,
    }));
}

run()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
