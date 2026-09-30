import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || '';

function token(user: { id: string; tenant_id: string; email: string; nome: string; role: string }) {
    return jwt.sign({ userId: user.id, tenantId: user.tenant_id, email: user.email, nome: user.nome, role: user.role }, JWT_SECRET, { expiresIn: '5m' });
}

function headers(authToken: string, json = false) {
    return { Authorization: `Bearer ${authToken}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function htmlFromEml(eml: string): string {
    const part = eml.match(/Content-Type: text\/html; charset=UTF-8\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([\s\S]*?)\r?\n--/i)?.[1];
    return part ? Buffer.from(part.replace(/\s/g, ''), 'base64').toString('utf8') : '';
}

async function run() {
    // Dois usuários temporários: um recebe a assinatura de teste, o outro fica
    // sem nenhuma. Antes o teste usava a conta do Victor e parava quando ele já
    // tinha assinatura real — agora nenhuma conta real é tocada.
    const tenant = await prisma.tenant.findFirst();
    assert(tenant, 'Nenhum tenant cadastrado');
    const sufixo = Date.now().toString(36);
    const criarTemporario = (quem: string, role: string) => prisma.user.create({
        data: {
            tenant_id: tenant.id, nome: `Teste assinatura ${quem}`,
            email: `teste-assinatura-${quem}-${sufixo}@lsoffice.invalid`,
            senha_hash: 'sem-login', role, status_acesso: 'ATIVO',
            permissoes: role === 'ADMIN' ? undefined : { create: [{ chave: 'pagamentos.solicitar' }, { chave: 'faturamento.gerenciar' }] },
        },
    });
    const victor = await criarTemporario('com', 'ADMIN');
    const noSignatureUser = await criarTemporario('sem', 'USUARIO');

    const victorToken = token(victor);
    const otherToken = token(noSignatureUser);
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64');
    const invalidForm = new FormData();
    invalidForm.append('arquivo', new Blob([Buffer.from('isto nao e uma imagem')], { type: 'image/png' }), 'falsa.png');
    const form = new FormData();
    form.append('arquivo', new Blob([tinyPng], { type: 'image/png' }), 'assinatura-teste.png');

    try {
        const invalidUpload = await fetch(`${API}/profile/email-signature`, { method: 'POST', headers: headers(victorToken), body: invalidForm });
        assert(invalidUpload.status === 400, 'Upload com MIME de imagem e conteudo invalido foi aceito');
        const upload = await fetch(`${API}/profile/email-signature`, { method: 'POST', headers: headers(victorToken), body: form });
        assert(upload.status === 201, `Upload falhou: ${upload.status} ${await upload.text()}`);
        const metadata = await (await fetch(`${API}/profile/email-signature`, { headers: headers(victorToken) })).json() as any;
        assert(metadata?.original_name === 'assinatura-teste.png', 'Metadados da assinatura não foram persistidos');
        const image = await fetch(`${API}/profile/email-signature/image`, { headers: headers(victorToken) });
        assert(image.ok && image.headers.get('content-type') === 'image/png', 'Imagem autenticada não foi entregue corretamente');
        const forbidden = await fetch(`${API}/profile/email-signature/image`, { headers: headers(otherToken) });
        assert(forbidden.status === 404, 'Um usuário conseguiu visualizar a assinatura de outro');

        const parcela = await prisma.parcelaPagamento.findFirst({ where: { contratacao: { tenant_id: victor.tenant_id } } });
        assert(parcela, 'Nenhuma parcela disponível para o teste');
        const paymentPreview = await fetch(`${API}/contratacoes/parcelas/${parcela.id}/email`, { method: 'POST', headers: headers(victorToken, true), body: '{}' });
        const payment = await paymentPreview.json() as any;
        assert(paymentPreview.ok && payment.html?.includes('LSI:USER_EMAIL_SIGNATURE') && payment.html.includes('data:image/png;base64,'), 'Preview de pagamento não incorporou a assinatura');
        const paymentEml = await (await fetch(`${API}/contratacoes/parcelas/${parcela.id}/email.eml`, { headers: headers(victorToken) })).text();
        assert(paymentEml.includes('multipart/related') && paymentEml.includes('Content-ID: <lsi-user-email-signature-') && htmlFromEml(paymentEml).includes('cid:lsi-user-email-signature-'), 'EML de pagamento não contém assinatura CID');

        const reimbursement = await prisma.reembolso.findFirst({
            where: { tenant_id: victor.tenant_id, pagamentos: { some: {} } },
            include: { pagamentos: { take: 1 }, atividade: { select: { tipo_demanda: true } } },
        });
        assert(reimbursement, 'Nenhum reembolso/adiantamento disponível para o teste');
        const reimbursementPreview = await fetch(`${API}/reembolsos/${reimbursement.id}/email`, { method: 'POST', headers: headers(victorToken, true), body: JSON.stringify({ pagamento_id: reimbursement.pagamentos[0].id }) });
        const reimbursementMail = await reimbursementPreview.json() as any;
        assert(reimbursementPreview.ok && reimbursementMail.html?.includes('LSI:USER_EMAIL_SIGNATURE'), 'Preview de reembolso/adiantamento não incorporou a assinatura');
        const origemEsperada = !reimbursement.atividade ? 'ENGENHARIA'
            : reimbursement.atividade.tipo_demanda === 'IMPLANTACAO' ? 'IMPLANTAÇÃO' : 'OPERAÇÕES';
        // Assunto no modelo aprovado em 28/09: "[ORIGEM] REEMBOLSO | favorecido | site | cliente".
        assert(reimbursementMail.assunto?.startsWith(`[${origemEsperada}]`), `Assunto não refletiu o tipo da atividade: esperado ${origemEsperada}`);
        const reimbursementEml = await (await fetch(`${API}/reembolsos/${reimbursement.id}/email.eml?pagamento_id=${reimbursement.pagamentos[0].id}`, { headers: headers(victorToken) })).text();
        assert(reimbursementEml.includes('multipart/related') && reimbursementEml.includes('Content-ID: <lsi-user-email-signature-'), 'EML de reembolso/adiantamento não contém assinatura CID');

        const noSignaturePreview = await fetch(`${API}/contratacoes/parcelas/${parcela.id}/email`, { method: 'POST', headers: headers(otherToken, true), body: '{}' });
        const noSignatureMail = await noSignaturePreview.json() as any;
        assert(noSignaturePreview.ok && !noSignatureMail.html?.includes('LSI:USER_EMAIL_SIGNATURE'), 'Usuário sem assinatura recebeu assinatura de terceiro');

        const billing = await prisma.faturamentoLinha.findFirst({ where: { linha: { po: { tenant_id: victor.tenant_id } } } });
        if (billing) {
            const billingPreview = await fetch(`${API}/pos/faturamento-linhas/email`, { method: 'POST', headers: headers(victorToken, true), body: JSON.stringify({ ids: [billing.id] }) });
            const billingMail = await billingPreview.json() as any;
            assert(billingPreview.ok && billingMail.corpo_html?.includes('LSI:USER_EMAIL_SIGNATURE'), 'Preview de faturamento não incorporou a assinatura');
        }

        console.log(JSON.stringify({ ok: true, invalidImageRejected: true, payment: true, reimbursement: reimbursement.natureza, outlookCid: true, noSignatureFallback: true, billing: Boolean(billing) }));
    } finally {
        await fetch(`${API}/profile/email-signature`, { method: 'DELETE', headers: headers(victorToken) }).catch(() => undefined);
        const temporarios = [victor.id, noSignatureUser.id];
        await prisma.userEmailSignature.deleteMany({ where: { user_id: { in: temporarios } } }).catch(() => undefined);
        await prisma.auditLog.deleteMany({ where: { user_id: { in: temporarios } } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: { in: temporarios } } });
        await prisma.$disconnect();
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
