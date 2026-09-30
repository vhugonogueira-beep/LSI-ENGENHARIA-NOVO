/**
 * Sessão para os roteiros de validação que chamam a API.
 *
 * Desde 30/09/2026 toda rota de /api exige login. Os roteiros validar-*.ts
 * foram escritos antes disso e chamam `fetch` sem token. Importar este
 * arquivo no topo resolve sem reescrever cada chamada:
 *
 *   import './_sessao-teste';
 *
 * Na primeira chamada à API, cria um ADMIN de teste direto no banco (ninguém
 * sabe a senha dos administradores reais, e não se deve saber), entra pela
 * rota normal de login e passa a mandar o token em toda requisição para /api
 * que ainda não tenha um. Ao terminar o processo, apaga o usuário e a trilha
 * de auditoria que ele deixou.
 *
 * Os roteiros continuam testando a regra de negócio com poder total; o que
 * cada perfil pode ou não fazer é assunto de validar-controle-acesso.ts.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API = process.env.API_URL || 'http://localhost:3001/api';
const fetchOriginal = globalThis.fetch.bind(globalThis);
const prisma = new PrismaClient();

const email = `teste-roteiro-${Date.now().toString(36)}@lsoffice.invalid`;
const senha = `Roteiro${Math.random().toString(36).slice(2, 10)}9`;
let usuarioId: string | null = null;
let sessao: Promise<string> | null = null;

async function abrirSessao(): Promise<string> {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant cadastrado');
    const user = await prisma.user.create({
        data: {
            tenant_id: tenant.id, nome: 'Roteiro de validação', email,
            senha_hash: await bcrypt.hash(senha, 10), role: 'ADMIN', status_acesso: 'ATIVO',
        },
    });
    usuarioId = user.id;
    const r = await fetchOriginal(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
    });
    const corpo: any = await r.json().catch(() => ({}));
    if (!r.ok || !corpo.token) throw new Error(`Login do roteiro falhou: HTTP ${r.status} ${corpo.error || ''}`);
    return corpo.token as string;
}

function ehDaApi(input: RequestInfo | URL): boolean {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith(API) || /^https?:\/\/(localhost|127\.0\.0\.1):3001\/api\//.test(url);
}

globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!ehDaApi(input)) return fetchOriginal(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    // Roteiro que já se autentica (ex.: testa com um usuário específico) manda no próprio token.
    if (!headers.has('Authorization')) {
        sessao = sessao || abrirSessao();
        headers.set('Authorization', `Bearer ${await sessao}`);
    }
    return fetchOriginal(input, { ...init, headers });
};

let encerrado = false;
process.on('beforeExit', async () => {
    if (encerrado) return;
    encerrado = true;
    if (usuarioId) {
        await prisma.auditLog.deleteMany({ where: { user_id: usuarioId } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: usuarioId } })
            .catch(e => console.log(`   (sessão de teste) não foi possível apagar ${email}: ${e.message}`));
    }
    await prisma.$disconnect();
});
