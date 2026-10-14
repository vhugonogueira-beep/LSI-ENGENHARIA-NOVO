/**
 * Quem envia o e-mail sai da cópia (14/10/2026).
 *
 * Rodolfo, Kayky e Iago estão no CC dos e-mails de pagamento; quando um deles
 * gera o e-mail, é ele quem envia — o próprio endereço não pode continuar no CC.
 * Vale para o CC do roteamento, o CC pessoal (Meu Perfil) e o CC editado na prévia.
 *
 *   npx tsx src/backend/scripts/validar-email-remetente.ts
 */
import { prisma } from '../server';
import { resolveEmailRouting } from '../services/email-routing.service';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}

async function main() {
    const tenant = await prisma.tenant.findFirst();
    const sufixo = Date.now().toString(36);
    const email = `remetente-${sufixo}@lsoffice.invalid`;
    const outro = `outro-${sufixo}@lsoffice.invalid`;
    const user = await prisma.user.create({
        data: { tenant_id: tenant!.id, nome: 'Teste remetente', email, senha_hash: 'x', role: 'USUARIO', status_acesso: 'ATIVO', email_cc_padrao: `${email}; ${outro}` },
    });
    try {
        const editado = await resolveEmailRouting(tenant!.id, 'PAYMENT_REQUEST', { para: 'financeiro@lsoffice.invalid', cc: `${email.toUpperCase()}; ${outro}` }, user.id);
        conferir('CC editado na prévia: o remetente sai (sem diferenciar maiúsculas)', !editado.cc.some(c => c.toLowerCase() === email) && editado.cc.includes(outro), editado.cc.join('; '));
        const padrao = await resolveEmailRouting(tenant!.id, 'PAYMENT_REQUEST', { para: 'financeiro@lsoffice.invalid' }, user.id);
        conferir('CC padrão + CC pessoal: o remetente sai, os demais ficam', !padrao.cc.includes(email) && padrao.cc.includes(outro), padrao.cc.join('; '));
        const outroUsuario = await resolveEmailRouting(tenant!.id, 'PAYMENT_REQUEST', { para: 'financeiro@lsoffice.invalid', cc: email }, null);
        conferir('sem usuário identificado, o CC fica como está', outroUsuario.cc.includes(email), outroUsuario.cc.join('; '));
    } finally {
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
