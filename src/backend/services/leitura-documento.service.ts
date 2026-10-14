// ─────────────────────────────────────────────────────────────────────────────
// Leitura dos anexos de RG e CNH (14/10/2026, correção 3 do Kayky).
//
// RG e CNH são documentos diferentes, com leituras diferentes:
//   - RG: só responde "o CPF está impresso?" (sim/não) e guarda o número;
//   - CNH: lê o número do RG (Doc. Identidade), o CPF e a validade.
//
// Como lê: PDF com texto, direto. Foto ou PDF escaneado precisaria de OCR
// (ainda não instalado): fica NAO_FOI_POSSIVEL_LER e a pessoa informa os dados.
// LGPD: só os números encontrados e a situação são gravados — nunca o texto.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../server';
import { extrairTextoPdf } from './po-leitura.service';

export const TIPOS_LIDOS = ['RG', 'CNH'];

/** CPF com dígitos verificadores válidos (só números). */
export function cpfValido(valor: string) {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (n: number) => {
        let soma = 0;
        for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Primeiro CPF válido do texto, preferindo o que vem logo após o rótulo "CPF". */
export function acharCpf(texto: string): string | null {
    const candidatos: { cpf: string; pos: number }[] = [];
    const re = /(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s.]?(\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
        const cpf = m.slice(1).join('');
        if (cpfValido(cpf)) candidatos.push({ cpf, pos: m.index });
    }
    if (!candidatos.length) return null;
    const rotulo = texto.toUpperCase().search(/\bCPF\b/);
    if (rotulo < 0) return candidatos[0].cpf;
    return candidatos.sort((a, b) => Math.abs(a.pos - rotulo) - Math.abs(b.pos - rotulo))[0].cpf;
}

/** Número do RG no campo "Doc. Identidade / Órg. Emissor / UF" da CNH, sem o órgão e a UF. */
export function acharRgNaCnh(texto: string): string | null {
    const m = texto.toUpperCase().match(/DOC(?:UMENTO)?\.?\s*(?:DE\s+)?IDENTIDADE[^\d]{0,60}([\d.\-xX]{5,15})/);
    if (!m) return null;
    const rg = m[1].replace(/[^\dX]/gi, '').toUpperCase();
    return rg.length >= 5 ? rg : null;
}

/** Validade impressa na CNH (dd/mm/aaaa), vinda logo após "VALIDADE". */
export function acharValidadeCnh(texto: string): Date | null {
    const m = texto.toUpperCase().match(/VALIDADE[\s\S]{0,60}?(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2100 ? null : d;
}

/** Interpreta o texto do documento. Pura, para teste. */
export function interpretar(tipo: string, texto: string) {
    const cpf = acharCpf(texto);
    if (tipo === 'RG') {
        return { leitura_status: cpf ? 'CPF_ENCONTRADO' : 'CPF_EM_BRANCO', leitura_detalhe: cpf ? null : 'RG sem CPF — anexar CPF', cpf_lido: cpf, rg_lido: null, validade: null as Date | null };
    }
    const rg = acharRgNaCnh(texto);
    const validade = acharValidadeCnh(texto);
    const faltam = [!rg && 'RG', !cpf && 'CPF', !validade && 'validade'].filter(Boolean);
    return {
        leitura_status: faltam.length === 3 ? 'NAO_FOI_POSSIVEL_LER' : faltam.length ? 'LEITURA_PARCIAL' : 'LEITURA_OK',
        leitura_detalhe: faltam.length && faltam.length < 3 ? `Não encontrado: ${faltam.join(', ')}` : faltam.length === 3 ? 'Nenhum dado encontrado no anexo' : null,
        cpf_lido: cpf, rg_lido: rg, validade,
    };
}

const RAIZ = path.resolve(process.cwd(), 'storage', 'sst');

/**
 * Lê os anexos de um documento de RG/CNH e grava o resultado. Leitura manual
 * (CONFIRMADO_MANUAL) não é sobrescrita por uma releitura automática, a menos
 * que forcar = true (botão "Reler anexo").
 */
export async function lerDocumento(qualificacaoId: string, forcar = false) {
    const doc = await prisma.qualificacao.findUnique({ where: { id: qualificacaoId }, include: { arquivos: { orderBy: { created_at: 'desc' } } } });
    if (!doc || !TIPOS_LIDOS.includes(doc.tipo)) return null;
    if (doc.leitura_status === 'CONFIRMADO_MANUAL' && !forcar) return doc;
    if (!doc.arquivos.length) {
        return prisma.qualificacao.update({ where: { id: doc.id }, data: { leitura_status: null, leitura_detalhe: null, cpf_lido: null, rg_lido: null } });
    }
    let texto = '';
    for (const a of doc.arquivos) {
        if (!/\.pdf$/i.test(a.storage_key)) continue;
        try { texto += '\n' + await extrairTextoPdf(await fs.readFile(path.resolve(RAIZ, ...a.storage_key.split('/')))); } catch { /* PDF ilegível: segue */ }
    }
    if (texto.replace(/\s/g, '').length < 20) {
        return prisma.qualificacao.update({
            where: { id: doc.id },
            data: { leitura_status: 'NAO_FOI_POSSIVEL_LER', leitura_detalhe: 'Foto ou PDF escaneado: informe os dados à mão', cpf_lido: null, rg_lido: null },
        });
    }
    const r = interpretar(doc.tipo, texto);
    return prisma.qualificacao.update({
        where: { id: doc.id },
        data: {
            leitura_status: r.leitura_status, leitura_detalhe: r.leitura_detalhe, cpf_lido: r.cpf_lido, rg_lido: r.rg_lido,
            // A validade lida preenche só se estiver vazia; a pessoa pode corrigir.
            ...(doc.tipo === 'CNH' && r.validade && !doc.data_validade ? { data_validade: r.validade } : {}),
        },
    });
}

/** Dados informados à mão quando a leitura não funciona. CPF é validado. */
export async function confirmarLeitura(qualificacaoId: string, dados: { cpf?: string | null; rg?: string | null; sem_cpf?: boolean }) {
    const doc = await prisma.qualificacao.findUnique({ where: { id: qualificacaoId } });
    if (!doc || !TIPOS_LIDOS.includes(doc.tipo)) throw new Error('Só RG e CNH têm leitura de dados');
    const cpf = String(dados.cpf || '').replace(/\D/g, '');
    if (cpf && !cpfValido(cpf)) throw new Error('CPF inválido: confira os números');
    const rg = String(dados.rg || '').replace(/[^\dX]/gi, '').toUpperCase();
    return prisma.qualificacao.update({
        where: { id: doc.id },
        data: {
            leitura_status: 'CONFIRMADO_MANUAL',
            leitura_detalhe: doc.tipo === 'RG' && !cpf ? 'RG sem CPF — anexar CPF' : null,
            cpf_lido: cpf || null, rg_lido: doc.tipo === 'CNH' ? rg || null : null,
        },
    });
}
