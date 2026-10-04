/**
 * `npm test` — roda todos os roteiros validar-*.ts, um de cada vez, e resume.
 *
 * Os roteiros testam a regra de negócio de ponta a ponta: chamam a API e leem
 * o banco local. Por isso exigem o backend no ar (`npm run dev:backend`) e a
 * base de desenvolvimento (prisma/dev.db) com os dados de referência
 * (HIGHLINE, PAMRB008…). Cada roteiro cria e apaga o que usa.
 *
 *   npm test                      todos
 *   npm test -- sites reembolso   só os que têm esses trechos no nome
 */
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';

const API = process.env.API_URL || 'http://localhost:3001/api';
const PASTA = __dirname;
const filtros = process.argv.slice(2).map(f => f.toLowerCase());

async function main() {
    const saude = await fetch(`${API}/health`).catch(() => null);
    if (!saude?.ok) {
        console.error(`Backend fora do ar em ${API}. Suba com "npm run dev:backend" e rode de novo.`);
        process.exitCode = 1;
        return;
    }

    const roteiros = readdirSync(PASTA)
        .filter(f => /^validar-.+\.ts$/.test(f))
        .filter(f => !filtros.length || filtros.some(t => f.toLowerCase().includes(t)))
        .sort();
    const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const resultado: { nome: string; ok: boolean; segundos: number; saida: string }[] = [];

    for (const arquivo of roteiros) {
        const nome = arquivo.replace(/\.ts$/, '');
        process.stdout.write(`  ${nome.padEnd(34)} `);
        const inicio = Date.now();
        const r = spawnSync(process.execPath, [tsx, path.join(PASTA, arquivo)], { encoding: 'utf8', env: process.env });
        const segundos = (Date.now() - inicio) / 1000;
        const ok = r.status === 0;
        resultado.push({ nome, ok, segundos, saida: `${r.stdout || ''}${r.stderr || ''}` });
        console.log(`${ok ? 'ok   ' : 'FALHA'} ${segundos.toFixed(1)}s`);
    }

    const falhas = resultado.filter(r => !r.ok);
    for (const f of falhas) {
        console.log(`\n── ${f.nome} ──`);
        // Só as linhas que dizem o que quebrou; a saída completa vem com o roteiro avulso.
        const linhas = f.saida.split('\n').filter(l => /FALHA|Error|erro|falh/i.test(l)).slice(0, 15);
        console.log(linhas.length ? linhas.join('\n') : f.saida.split('\n').slice(-15).join('\n'));
    }
    console.log(`\n${resultado.length - falhas.length} de ${resultado.length} roteiros passaram.`);
    process.exitCode = falhas.length ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
