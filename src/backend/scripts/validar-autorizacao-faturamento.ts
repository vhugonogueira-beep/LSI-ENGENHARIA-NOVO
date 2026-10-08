/**
 * Solicitação de faturamento exige a resposta "o cliente autorizou?" (08/10/2026):
 *
 *   - sem confirmação, sem quem autorizou ou com data futura → recusa;
 *   - confirmada → grava na remessa, registra na auditoria e sai no e-mail;
 *   - o e-mail avisa quando quem gera ainda não tem assinatura.
 *
 * Usa uma linha de PO real com saldo; se ela não estiver autorizada, autoriza só
 * durante o teste. Apaga as remessas criadas e devolve tudo como estava.
 *
 *   npx tsx src/backend/scripts/validar-autorizacao-faturamento.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cabecalho = { 'Content-Type': 'application/json' };

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const solicitar = (corpo: unknown) => json('/pos/faturamento-linhas', { method: 'POST', headers: cabecalho, body: JSON.stringify(corpo) });

async function main() {
    const linhas = await prisma.purchaseOrderLinha.findMany({ include: { faturamentos: true } });
    const linha = linhas.find(l => l.faturamentos.filter(f => f.status !== 'CANCELADO').reduce((a, f) => a + f.percentual, 0) < 99);
    if (!linha) throw new Error('Nenhuma linha de PO com saldo para testar');
    const estavaAutorizada = linha.autorizado;
    const criadas: string[] = [];
    try {
        if (!estavaAutorizada) await prisma.purchaseOrderLinha.update({ where: { id: linha.id }, data: { autorizado: true } });
        const itens = [{ linha_id: linha.id, percentual: 1 }];
        const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const futuro = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

        console.log('\n── Pergunta obrigatória');
        const sem = await solicitar({ itens });
        conferir('sem resposta sobre a autorização → recusa', sem.status === 400 && /autorizou/i.test(sem.corpo.error || ''), `HTTP ${sem.status} ${sem.corpo.error || ''}`);
        const nao = await solicitar({ itens, autorizacao: { confirmada: false, autorizado_por: 'Fulano', data: ontem } });
        conferir('resposta "não" → recusa', nao.status === 400, `HTTP ${nao.status}`);
        const semQuem = await solicitar({ itens, autorizacao: { confirmada: true, autorizado_por: ' ', data: ontem } });
        conferir('sem quem autorizou → recusa', semQuem.status === 400 && /quem autorizou/i.test(semQuem.corpo.error || ''), semQuem.corpo.error);
        const dataFutura = await solicitar({ itens, autorizacao: { confirmada: true, autorizado_por: 'Fulano', data: futuro } });
        conferir('data futura → recusa', dataFutura.status === 400 && /futuro/i.test(dataFutura.corpo.error || ''), dataFutura.corpo.error);

        console.log('\n── Autorizado');
        const ok = await solicitar({ itens, autorizacao: { confirmada: true, autorizado_por: 'Maria Souza (Highline)', data: ontem } });
        conferir('confirmada → remessa criada', ok.status === 201 && ok.corpo.length === 1, `HTTP ${ok.status} ${ok.corpo.error || ''}`);
        if (ok.ok) criadas.push(...ok.corpo.map((c: any) => c.id));
        const remessa = criadas[0] ? await prisma.faturamentoLinha.findUnique({ where: { id: criadas[0] } }) : null;
        conferir('quem autorizou e quando ficam na remessa', Boolean(remessa?.observacoes?.includes('Maria Souza (Highline)') && remessa.observacoes.includes(new Date(`${ontem}T12:00:00`).toLocaleDateString('pt-BR'))), remessa?.observacoes || '');
        const auditoria = criadas[0] ? await prisma.auditLog.findFirst({ where: { entidade_id: criadas[0], acao: 'FATURAMENTO_AUTORIZACAO_CONFIRMADA' } }) : null;
        conferir('confirmação registrada na auditoria, com o usuário', Boolean(auditoria?.user_id), JSON.stringify(auditoria));

        console.log('\n── E-mail');
        const email = await json('/pos/faturamento-linhas/email', { method: 'POST', headers: cabecalho, body: JSON.stringify({ ids: criadas }) });
        conferir('e-mail gerado', email.ok, `HTTP ${email.status} ${email.corpo.error || ''}`);
        conferir('e-mail informa a autorização do cliente', /Faturamento autorizado pelo cliente: Maria Souza \(Highline\)/.test(email.corpo.corpo_html || '') && /autorizado pelo cliente/.test(email.corpo.corpo_texto || ''));
        conferir('e-mail não expõe o trecho interno de quem confirmou', !/Confirmada no sistema/.test(email.corpo.corpo_html || ''));
        conferir('avisa que o usuário (sem assinatura) gera o e-mail sem ela', email.corpo.sem_assinatura === true, String(email.corpo.sem_assinatura));
    } finally {
        if (criadas.length) {
            await prisma.auditLog.deleteMany({ where: { entidade_id: { in: criadas } } });
            await prisma.faturamentoLinha.deleteMany({ where: { id: { in: criadas } } });
        }
        if (!estavaAutorizada) await prisma.purchaseOrderLinha.update({ where: { id: linha.id }, data: { autorizado: false } });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
