/**
 * Leitura de RG e CNH (14/10/2026, correção 3 do Kayky). Documentos fictícios
 * gerados no próprio teste (CPF de exemplo com dígito verificador válido).
 *
 *   1. RG com CPF impresso: RG e CPF saem de "Faltam"; CPF aparece mascarado;
 *   2. RG sem CPF: só o RG sai; CPF continua faltando, com o aviso;
 *   3. CNH válida: CNH, RG e CPF saem de "Faltam"; validade preenchida;
 *   4. CNH vencida: nada é abonado;
 *   5. imagem ilegível: pede os dados à mão (CPF inválido recusado);
 *   6. "Dirigir veículo da obra" sem CNH: CNH continua faltando.
 *
 *   npx tsx src/backend/scripts/validar-leitura-documento.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { acharCpf, acharRgNaCnh, acharValidadeCnh, cpfValido } from '../services/leitura-documento.service';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();
const CPF = '529.982.247-25';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const post = (c: string, b: unknown) => json(c, { method: 'POST', headers: cab, body: JSON.stringify(b) });
const pdf = (linhas: string[]) => { const d = new jsPDF(); linhas.forEach((l, i) => d.text(l, 15, 20 + i * 10)); return Buffer.from(d.output('arraybuffer')); };
const ano = new Date().getFullYear();

async function anexarELer(docId: string, nome: string, buffer: Buffer, tipo: string) {
    const fd = new FormData();
    fd.append('arquivo', new Blob([new Uint8Array(buffer)], { type: tipo }), nome);
    await json(`/sst/documentos/${docId}/arquivos`, { method: 'POST', body: fd });
    return json(`/sst/documentos/${docId}/ler`, { method: 'POST' });
}
const faltando = async (id: string) => ((await json(`/sst/fornecedores/${id}`)).corpo.pendencias || []).filter((p: any) => p.motivo === 'FALTANDO').map((p: any) => p.codigo).sort().join(',');

async function main() {
    const fornecedores: string[] = [];
    try {
        console.log('\n── Leitura do texto');
        conferir('CPF válido aceito, inválido recusado', cpfValido(CPF) && !cpfValido('529.982.247-24') && !cpfValido('111.111.111-11'));
        conferir('acha o CPF perto do rótulo, ignorando número inválido', acharCpf('RG 12.345.678-9  CPF 529 982 247 25  ref 123.456.789-00') === '52998224725');
        conferir('RG da CNH sem órgão e UF', acharRgNaCnh('DOC. IDENTIDADE / ÓRG. EMISSOR / UF\n4512345 SSP PA') === '4512345');
        conferir('validade da CNH', acharValidadeCnh('VALIDADE 1ª HABILITAÇÃO\n15/03/2031 10/01/2010')?.toISOString().slice(0, 10) === '2031-03-15');

        const criar = async (nome: string, trabalhos: string[]) => {
            const s = await post('/suppliers', { nome: `${nome} ${SUFIXO}`, tipo: 'PESSOA_FISICA', categoria: 'MAO_DE_OBRA', observacoes: 'Teste automatizado — pode apagar' });
            fornecedores.push(s.corpo.id);
            if (trabalhos.length) await json(`/sst/fornecedores/${s.corpo.id}/trabalhos`, { method: 'PUT', headers: cab, body: JSON.stringify({ trabalhos }) });
            return s.corpo.id as string;
        };

        console.log('\n── 1. RG com CPF impresso');
        const p1 = await criar('Leitura RG com CPF', []);
        const rg1 = await post('/qualificacoes', { supplier_id: p1, tipo: 'RG' });
        const l1 = await anexarELer(rg1.corpo.id, 'rg.pdf', pdf(['REPUBLICA FEDERATIVA DO BRASIL', 'REGISTRO GERAL 4512345', `CPF ${CPF}`]), 'application/pdf');
        conferir('leitura: CPF encontrado, mascarado', l1.corpo.leitura_status === 'CPF_ENCONTRADO' && l1.corpo.cpf_mascarado === '***.***.***-25', JSON.stringify(l1.corpo));
        conferir('RG e CPF saem de Faltam', await faltando(p1) === '', await faltando(p1));
        const det = await json(`/sst/fornecedores/${p1}`);
        conferir('número do CPF não sai cru na API', !JSON.stringify(det.corpo).includes('52998224725'));

        console.log('\n── 2. RG sem CPF');
        const p2 = await criar('Leitura RG sem CPF', []);
        const rg2 = await post('/qualificacoes', { supplier_id: p2, tipo: 'RG' });
        const l2 = await anexarELer(rg2.corpo.id, 'rg.pdf', pdf(['REPUBLICA FEDERATIVA DO BRASIL', 'REGISTRO GERAL 4512345', 'CPF']), 'application/pdf');
        conferir('leitura: CPF em branco, com aviso', l2.corpo.leitura_status === 'CPF_EM_BRANCO' && /anexar CPF/.test(l2.corpo.leitura_detalhe), JSON.stringify(l2.corpo));
        conferir('só o RG sai; CPF continua faltando', await faltando(p2) === 'CPF', await faltando(p2));

        console.log('\n── 3. CNH válida');
        const p3 = await criar('Leitura CNH valida', ['DIRIGIR']);
        conferir('antes: faltam CNH, CPF e RG', await faltando(p3) === 'CNH,CPF,RG', await faltando(p3));
        const cnh3 = await post('/qualificacoes', { supplier_id: p3, tipo: 'CNH' });
        const l3 = await anexarELer(cnh3.corpo.id, 'cnh.pdf', pdf(['CARTEIRA NACIONAL DE HABILITACAO', 'DOC. IDENTIDADE / ORG. EMISSOR / UF', '4512345 SSP PA', `CPF ${CPF}`, `VALIDADE 15/03/${ano + 3}`]), 'application/pdf');
        conferir('leitura completa', l3.corpo.leitura_status === 'LEITURA_OK' && l3.corpo.rg_identificado, JSON.stringify(l3.corpo));
        conferir('validade da CNH preenchida', String(l3.corpo.data_validade || '').startsWith(`${ano + 3}-03-15`), l3.corpo.data_validade);
        conferir('CNH, RG e CPF saem de Faltam', await faltando(p3) === '', await faltando(p3));

        console.log('\n── 4. CNH vencida');
        const p4 = await criar('Leitura CNH vencida', ['DIRIGIR']);
        const cnh4 = await post('/qualificacoes', { supplier_id: p4, tipo: 'CNH' });
        await anexarELer(cnh4.corpo.id, 'cnh.pdf', pdf(['CARTEIRA NACIONAL DE HABILITACAO', 'DOC. IDENTIDADE / ORG. EMISSOR / UF', '4512345 SSP PA', `CPF ${CPF}`, `VALIDADE 15/03/${ano - 1}`]), 'application/pdf');
        const pend4 = (await json(`/sst/fornecedores/${p4}`)).corpo.pendencias.map((p: any) => `${p.codigo}:${p.motivo}`).sort().join(',');
        conferir('CNH vencida não abona nada', pend4 === 'CNH:VENCIDO,CPF:FALTANDO,RG:FALTANDO', pend4);

        console.log('\n── 5. Imagem ilegível');
        const p5 = await criar('Leitura imagem', []);
        const rg5 = await post('/qualificacoes', { supplier_id: p5, tipo: 'RG' });
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const l5 = await anexarELer(rg5.corpo.id, 'rg.png', png, 'image/png');
        conferir('pede os dados à mão', l5.corpo.leitura_status === 'NAO_FOI_POSSIVEL_LER', JSON.stringify(l5.corpo));
        const invalido = await json(`/sst/documentos/${rg5.corpo.id}/leitura`, { method: 'PUT', headers: cab, body: JSON.stringify({ cpf: '529.982.247-24' }) });
        conferir('CPF inválido informado à mão é recusado', invalido.status === 400 && /CPF inválido/.test(invalido.corpo.error), JSON.stringify(invalido.corpo));
        const manual = await json(`/sst/documentos/${rg5.corpo.id}/leitura`, { method: 'PUT', headers: cab, body: JSON.stringify({ cpf: CPF }) });
        conferir('CPF válido informado à mão abona o CPF', manual.corpo.leitura_status === 'CONFIRMADO_MANUAL' && await faltando(p5) === '', await faltando(p5));

        console.log('\n── 6. Dirigir veículo sem CNH');
        const p6 = await criar('Leitura dirigir', ['DIRIGIR']);
        const rg6 = await post('/qualificacoes', { supplier_id: p6, tipo: 'RG' });
        await anexarELer(rg6.corpo.id, 'rg.pdf', pdf(['REGISTRO GERAL 4512345', `CPF ${CPF}`]), 'application/pdf');
        conferir('CNH continua faltando', await faltando(p6) === 'CNH', await faltando(p6));
    } finally {
        for (const id of fornecedores) {
            const docs = await prisma.qualificacao.findMany({ where: { supplier_id: id } });
            for (const d of docs) fs.rmSync(path.resolve('storage', 'sst', d.id), { recursive: true, force: true });
            await prisma.qualificacao.deleteMany({ where: { supplier_id: id } });
            await prisma.supplier.delete({ where: { id } }).catch(() => undefined);
        }
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
