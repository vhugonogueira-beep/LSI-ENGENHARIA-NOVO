/**
 * Arquivo do relatório enviado ao cliente (18/10/2026): o relatório fotográfico
 * da operação (e o RFI) guarda o Excel ou PDF que foi ao cliente.
 *
 *   1. anexa PDF; baixa o mesmo conteúdo, com o nome original (acento incluso);
 *   2. troca por Excel: o anterior sai;
 *   3. outro formato é recusado.
 *
 *   npx tsx src/backend/scripts/validar-relatorio-arquivo.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function anexar(rfiId: string, nome: string, conteudo: Buffer, tipo: string) {
    const fd = new FormData();
    fd.append('arquivo', new Blob([new Uint8Array(conteudo)], { type: tipo }), nome);
    const r = await fetch(`${API}/execucao/rfis/${rfiId}/arquivo`, { method: 'POST', body: fd });
    return { status: r.status, corpo: await r.json().catch(() => ({})) as any };
}

async function main() {
    const tenant = await prisma.tenant.findFirst();
    const atividade = await prisma.atividade.findFirst({ where: { tenant_id: tenant!.id }, orderBy: { created_at: 'desc' } });
    // RFI criado direto no banco: o teste é do arquivo, não da regra de conclusão.
    const rfi = await prisma.rFI.create({ data: { tenant_id: tenant!.id, atividade_id: atividade!.id, destinatario: 'Teste automatizado — pode apagar' } });
    try {
        console.log('\n── 1. PDF');
        const pdf = Buffer.from('%PDF-1.4\n% relatório de teste\n');
        const a1 = await anexar(rfi.id, 'Relatório fotográfico.pdf', pdf, 'application/pdf');
        conferir('PDF anexado', a1.status === 200 && /^relatorios\//.test(a1.corpo.relatorio_url || ''), JSON.stringify(a1.corpo));
        const b1 = await fetch(`${API}/execucao/rfis/${rfi.id}/arquivo`);
        const conteudo = Buffer.from(await b1.arrayBuffer());
        conferir('baixa o mesmo conteúdo', b1.ok && conteudo.equals(pdf), `HTTP ${b1.status}`);
        conferir('nome original com acento', decodeURIComponent(b1.headers.get('content-disposition') || '').includes('Relatório fotográfico.pdf'), b1.headers.get('content-disposition') || '');

        console.log('\n── 2. Troca por Excel');
        const a2 = await anexar(rfi.id, 'relatorio.xlsx', Buffer.from('PK excel de teste'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        conferir('Excel anexado', a2.status === 200 && a2.corpo.relatorio_url?.endsWith('relatorio.xlsx'), JSON.stringify(a2.corpo));
        const pasta = path.resolve('storage', 'relatorios', rfi.id);
        conferir('o PDF anterior saiu', fs.readdirSync(pasta).join(',') === 'relatorio.xlsx', fs.readdirSync(pasta).join(','));

        console.log('\n── 3. Formato recusado');
        const a3 = await anexar(rfi.id, 'virus.exe', Buffer.from('MZ'), 'application/octet-stream');
        conferir('.exe recusado', a3.status === 400 && /PDF ou Excel/.test(a3.corpo.error), JSON.stringify(a3.corpo));
    } finally {
        fs.rmSync(path.resolve('storage', 'relatorios', rfi.id), { recursive: true, force: true });
        await prisma.rFI.delete({ where: { id: rfi.id } }).catch(() => undefined);
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
