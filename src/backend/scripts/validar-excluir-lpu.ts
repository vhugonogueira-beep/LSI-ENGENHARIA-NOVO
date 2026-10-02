/**
 * Exclusão de base de preço (LPU / PV).
 *
 *   - sem nenhuma referência, a base sai de vez com os itens;
 *   - se outra base (ou um orçamento) aponta para itens dela, é ARQUIVADA:
 *     some da lista, mas nada que dependia dela quebra;
 *   - só administrador exclui.
 *
 * Cria as próprias bases e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-excluir-lpu.ts
 */
import './_sessao-teste'; // entra como ADMIN temporário
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cabecalho = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36);

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const novaBase = (nome: string) => json('/pricebooks', {
    method: 'POST', headers: cabecalho,
    body: JSON.stringify({ nome_lpu: `${nome} ${SUFIXO}`, regiao: 'NACIONAL', origem: 'FORNECEDOR' }),
});

async function main() {
    const criadas: string[] = [];
    let usuarioId = '';
    try {
        console.log('\n── Base sem uso');
        const a = await novaBase('Teste exclusão A');
        conferir('base A criada', a.ok, `HTTP ${a.status} ${a.corpo.error || ''}`);
        if (!a.ok) return;
        criadas.push(a.corpo.id);
        const itemA = await json(`/pricebooks/${a.corpo.id}/items`, {
            method: 'POST', headers: cabecalho,
            body: JSON.stringify({ descricao: 'Item de teste', unidade: 'UN', valor_unitario: 10, tipo_escopo: 'SERVICO' }),
        });
        conferir('item na base A', itemA.ok, `HTTP ${itemA.status} ${itemA.corpo.error || ''}`);

        console.log('\n── Base referenciada por outra');
        const b = await novaBase('Teste exclusão B');
        criadas.push(b.corpo.id);
        if (itemA.ok) {
            const itemB = await json(`/pricebooks/${b.corpo.id}/items`, {
                method: 'POST', headers: cabecalho,
                body: JSON.stringify({ descricao: 'Vinculado ao item de A', unidade: 'UN', valor_unitario: 12, tipo_escopo: 'SERVICO' }),
            });
            // O vínculo PV ↔ LPU é gravado direto: não há rota que o crie à mão.
            if (itemB.ok) await prisma.priceBookItem.update({ where: { id: itemB.corpo.id }, data: { pv_item_id: itemA.corpo.id } });
            conferir('item de B vinculado ao item de A', itemB.ok, `HTTP ${itemB.status} ${itemB.corpo.error || ''}`);
        }

        // Usuário sem ser admin, com permissão de orçamentos: edita base, não exclui.
        const tenant = await prisma.tenant.findFirst();
        const u = await prisma.user.create({
            data: {
                tenant_id: tenant!.id, nome: 'Teste LPU', email: `teste-lpu-${SUFIXO}@lsoffice.invalid`,
                senha_hash: await bcrypt.hash('TesteLpu2026', 10), role: 'USUARIO', status_acesso: 'ATIVO',
                permissoes: { create: [{ chave: 'orcamentos.gerenciar' }] },
            },
        });
        usuarioId = u.id;
        const login = await json('/auth/login', { method: 'POST', headers: cabecalho, body: JSON.stringify({ email: u.email, senha: 'TesteLpu2026' }) });
        const naoAdmin = await json(`/pricebooks/${a.corpo.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${login.corpo.token}` } });
        conferir('quem não é administrador não exclui (403)', naoAdmin.status === 403, `HTTP ${naoAdmin.status}`);

        const exA = await json(`/pricebooks/${a.corpo.id}`, { method: 'DELETE' });
        conferir('base A com item vinculado em outra base é ARQUIVADA', exA.corpo.modo === 'ARQUIVADA', JSON.stringify(exA.corpo));
        conferir('motivo explica o vínculo', (exA.corpo.motivos || []).some((m: string) => m.includes('outra base')));
        const lista = await json('/pricebooks');
        conferir('base arquivada some da lista', !(lista.corpo || []).some((x: any) => x.id === a.corpo.id));
        const arquivadas = await json('/pricebooks?status=ARQUIVADA');
        conferir('e aparece em ?status=ARQUIVADA', (arquivadas.corpo || []).some((x: any) => x.id === a.corpo.id));

        const exB = await json(`/pricebooks/${b.corpo.id}`, { method: 'DELETE' });
        conferir('base B sem referência é EXCLUÍDA de vez', exB.corpo.modo === 'EXCLUIDA', JSON.stringify(exB.corpo));
        conferir('itens de B saíram do banco', await prisma.priceBookItem.count({ where: { pricebook_id: b.corpo.id } }) === 0);
        conferir('base B não existe mais', !(await prisma.priceBook.findUnique({ where: { id: b.corpo.id } })));

        const exA2 = await json(`/pricebooks/${a.corpo.id}`, { method: 'DELETE' });
        conferir('sem o vínculo, A arquivada agora pode ser excluída de vez', exA2.corpo.modo === 'EXCLUIDA', JSON.stringify(exA2.corpo));

        const trilha = await prisma.auditLog.count({ where: { entidade: 'PriceBook', entidade_id: { in: criadas } } });
        conferir('exclusões ficam na auditoria', trilha >= 3, `${trilha} registro(s)`);
    } finally {
        for (const id of criadas) {
            await prisma.priceBookItem.updateMany({ where: { pricebook_id: id }, data: { pv_item_id: null } }).catch(() => undefined);
            await prisma.priceBookItem.deleteMany({ where: { pricebook_id: id } }).catch(() => undefined);
            await prisma.priceBook.deleteMany({ where: { id } }).catch(() => undefined);
        }
        await prisma.auditLog.deleteMany({ where: { entidade: 'PriceBook', entidade_id: { in: criadas } } });
        if (usuarioId) {
            await prisma.auditLog.deleteMany({ where: { user_id: usuarioId } });
            await prisma.user.delete({ where: { id: usuarioId } });
        }
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
        if (falhas) process.exitCode = 1;
    })
    .catch(e => { console.error(e); process.exitCode = 1; });
