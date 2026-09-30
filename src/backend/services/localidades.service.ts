// Localidades IBGE: UF, região e município vêm de uma base só, empacotada no
// repositório, para cidade não virar texto livre em cada cadastro e para o
// sistema funcionar sem internet.

import { UFS, normalizarUf } from '../utils/uf';

// O tsconfig do backend não habilita imports JSON; require mantém a base local.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BASE: { c: string; n: string; u: string }[] = require('../data/municipios-ibge.json');

export interface Municipio {
    codigo_ibge: string;
    nome: string;
    uf: string;
}

/** Nome sem acento, caixa ou espaço duplo — "SAO  paulo" casa com "São Paulo". */
export function chaveNome(value: string): string {
    return value
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

const MUNICIPIOS: Municipio[] = BASE.map(m => ({ codigo_ibge: m.c, nome: m.n, uf: m.u }));
const POR_UF = new Map<string, Municipio[]>();
for (const m of MUNICIPIOS) {
    const lista = POR_UF.get(m.uf) || [];
    lista.push(m);
    POR_UF.set(m.uf, lista);
}

export function listarUfs() {
    return UFS.map(uf => ({ ...uf, municipios: POR_UF.get(uf.sigla)?.length || 0 }));
}

/** Municípios de uma UF (ou todos), com busca opcional por trecho do nome. */
export function listarMunicipios(uf?: unknown, busca?: unknown): Municipio[] {
    const sigla = normalizarUf(uf);
    let lista = sigla ? POR_UF.get(sigla) || [] : MUNICIPIOS;
    const q = typeof busca === 'string' ? chaveNome(busca) : '';
    if (q) lista = lista.filter(m => chaveNome(m.nome).includes(q));
    return lista;
}

/** Acha o município oficial pelo nome digitado; null se não existir na UF. */
export function encontrarMunicipio(uf: unknown, nome: unknown): Municipio | null {
    const sigla = normalizarUf(uf);
    if (!sigla || typeof nome !== 'string' || !nome.trim()) return null;
    const chave = chaveNome(nome);
    return (POR_UF.get(sigla) || []).find(m => chaveNome(m.nome) === chave) || null;
}
