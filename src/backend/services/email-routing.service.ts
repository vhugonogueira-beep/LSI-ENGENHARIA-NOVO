import { prisma } from '../server';
import { EMAIL_ROUTING_TYPES, type EmailRoutingType } from './payment-domain.service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipients(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/);
    const unique = new Map<string, string>();
    for (const item of raw) {
        const email = String(item || '').trim().toLowerCase();
        if (!email) continue;
        if (!EMAIL.test(email)) throw new Error(`E-mail inválido: ${email}`);
        unique.set(email, email);
    }
    return [...unique.values()];
}

/**
 * Leitura tolerante para dados que já estão gravados. `normalizeRecipients`
 * lança em endereço inválido — correto num formulário, fatal ao ler o campo
 * legado `destinatarios_pagamento`, que aceitava texto livre: um "Financeiro
 * <fin@x>" ali derrubaria toda prévia de pagamento, reembolso e faturamento.
 */
function lenient(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/);
    const unique = new Map<string, string>();
    for (const item of raw) {
        const email = String(item || '').trim().toLowerCase();
        if (email && EMAIL.test(email)) unique.set(email, email);
    }
    return [...unique.values()];
}

function fromJson(value: string | null | undefined): string[] {
    if (!value) return [];
    try { return lenient(JSON.parse(value)); } catch { return lenient(value); }
}

export async function listEmailRouting(tenantId: string) {
    const empresa = await prisma.empresaConfig.findUnique({
        where: { tenant_id: tenantId },
        include: { emailRoutingConfigs: true },
    });
    return EMAIL_ROUTING_TYPES.map(tipo => {
        const config = empresa?.emailRoutingConfigs.find(item => item.tipo === tipo);
        const legacy = tipo === 'BILLING' ? empresa?.email_faturamento : empresa?.destinatarios_pagamento;
        return {
            tipo,
            para: config ? fromJson(config.para_json) : lenient(legacy),
            cc: config ? fromJson(config.cc_json) : [],
            ativo: config?.ativo ?? true,
        };
    });
}

export async function saveEmailRouting(tenantId: string, tipo: EmailRoutingType, para: unknown, cc: unknown) {
    if (!EMAIL_ROUTING_TYPES.includes(tipo)) throw new Error('Perfil de roteamento inválido');
    const empresa = await prisma.empresaConfig.findUnique({ where: { tenant_id: tenantId } });
    if (!empresa) throw new Error('Cadastre os dados da empresa antes de configurar e-mails');
    const to = normalizeRecipients(para);
    const carbonCopy = normalizeRecipients(cc).filter(email => !to.includes(email));
    const config = await prisma.emailRoutingConfig.upsert({
        where: { tenant_id_tipo: { tenant_id: tenantId, tipo } },
        create: { tenant_id: tenantId, empresa_id: empresa.id, tipo, para_json: JSON.stringify(to), cc_json: JSON.stringify(carbonCopy) },
        update: { para_json: JSON.stringify(to), cc_json: JSON.stringify(carbonCopy), ativo: true },
    });
    return { ...config, para: to, cc: carbonCopy };
}

export async function resolveEmailRouting(tenantId: string, tipo: EmailRoutingType, overrides?: { para?: unknown; cc?: unknown }, usuarioId?: string | null) {
    const current = (await listEmailRouting(tenantId)).find(item => item.tipo === tipo)!;
    const para = overrides?.para === undefined ? current.para : normalizeRecipients(overrides.para);
    let cc = overrides?.cc === undefined ? current.cc : normalizeRecipients(overrides.cc);
    // CC pessoal de quem gera o e-mail (Meu Perfil), somado ao roteamento
    // global — nunca repete quem já está no Para. Se a pessoa editou o CC na
    // prévia, vale o que ela deixou.
    if (usuarioId && overrides?.cc === undefined) {
        const usuario = await prisma.user.findUnique({ where: { id: usuarioId }, select: { email_cc_padrao: true } });
        cc = [...new Set([...cc, ...lenient(usuario?.email_cc_padrao)])].filter(email => !para.includes(email));
    }
    // Não existe destinatário padrão embutido: um e-mail de pagamento que sai
    // para o endereço errado é pior do que um "Para" vazio. Em compensação,
    // quem gera a prévia precisa ser avisado de que falta cadastrar.
    return { tipo, para, cc, pendente: para.length === 0 };
}
