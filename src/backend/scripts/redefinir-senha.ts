/**
 * Redefine a senha de um usuário direto no banco — para quem tem acesso ao
 * terminal do servidor e ficou sem entrar (ex.: o seed gerou senhas aleatórias
 * e ninguém guardou). Gera uma senha forte, mostra UMA vez e reativa a conta.
 * Troque-a em Meu Perfil → Acesso e senha logo no primeiro login.
 *
 *   npm run redefinir-senha -- victor.hugo@lsoffice.com.br
 *
 * Não importa o server.ts (que subiria a API): fala com o banco pelo Prisma.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const email = String(process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Informe o e-mail: npm run redefinir-senha -- fulano@lsoffice.com.br');
        process.exitCode = 1;
        return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        const existentes = await prisma.user.findMany({ select: { email: true }, orderBy: { email: 'asc' } });
        console.error(`Nenhum usuário com o e-mail ${email}. Cadastrados: ${existentes.map(u => u.email).join(', ') || '(nenhum)'}`);
        process.exitCode = 1;
        return;
    }
    const senha = `Ls${randomBytes(9).toString('base64url')}9`;
    await prisma.user.update({
        where: { id: user.id },
        data: {
            senha_hash: await bcrypt.hash(senha, 12),
            status_acesso: 'ATIVO', ativo: true,
            convite_token_hash: null, convite_expira_em: null,
        },
    });
    await prisma.auditLog.create({
        data: { tenant_id: user.tenant_id, entidade: 'User', entidade_id: user.id, acao: 'SENHA_REDEFINIDA_TERMINAL', depois_json: JSON.stringify({ email }) },
    });
    console.log(`\nSenha nova de ${email}:  ${senha}\n`);
    console.log('Ela aparece só agora. Entre e troque em Meu Perfil → Acesso e senha.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
