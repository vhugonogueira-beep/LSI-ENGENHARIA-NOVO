import { useEffect, useState } from 'react';
import { OPERADORAS, SHARINGS } from '../components/atividades/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Sharing e Operadora vêm do cadastro de Clientes (13/10/2026; revisto em
// 23/10/2026): Sharing = clientes do tipo Sharing ou Sharing e operadora;
// Operadora = Operadora ou Sharing e operadora. Só cadastros ativos.
//
// Grava-se o NOME do cliente, do jeito que está no cadastro (ex.: "Highline do
// Brasil") — sem código nem sigla — e o Sharing liga a atividade ao cadastro
// (contratante_id). Nome repetido aparece uma vez só. Sem resposta do servidor,
// valem as listas fixas de antes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteCadastro { id: string; nome: string; sigla?: string | null; tipo: string; ativo: boolean }
export interface OpcaoCliente { id: string; nome: string }

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

interface Listas { sharings: string[]; operadoras: string[]; sharingsCadastro: OpcaoCliente[]; operadorasCadastro: OpcaoCliente[] }
const FIXAS: Listas = { sharings: SHARINGS, operadoras: OPERADORAS, sharingsCadastro: [], operadorasCadastro: [] };

let cache: Listas | null = null;
let pedido: Promise<Listas> | null = null;

function montar(clientes: ClienteCadastro[]): Listas {
    const ativos = clientes.filter(c => c.ativo !== false && c.nome?.trim());
    const de = (tipos: string[]) => {
        const vistos = new Set<string>();
        return ativos.filter(c => tipos.includes(c.tipo))
            .filter(c => { const k = chave(c.nome); if (vistos.has(k)) return false; vistos.add(k); return true; })
            .map(c => ({ id: c.id, nome: c.nome.trim() }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    };
    const sharingsCadastro = de(['SHARING', 'SHARING_OPERADORA']);
    const operadorasCadastro = de(['OPERADORA', 'SHARING_OPERADORA']);
    if (!sharingsCadastro.length && !operadorasCadastro.length) return FIXAS;
    return { sharings: sharingsCadastro.map(c => c.nome), operadoras: operadorasCadastro.map(c => c.nome), sharingsCadastro, operadorasCadastro };
}

export function carregarListasClientes(forcar = false) {
    if (forcar) { cache = null; pedido = null; }
    if (!pedido) {
        pedido = fetch('/api/clientes')
            .then(r => (r.ok ? r.json() : []))
            .then((lista: ClienteCadastro[]) => (cache = montar(Array.isArray(lista) ? lista : [])))
            .catch(() => (cache = FIXAS));
    }
    return pedido;
}

/** Listas de sharings e operadoras do cadastro de Clientes. */
export function useListasClientes() {
    const [listas, setListas] = useState<Listas>(cache || FIXAS);
    useEffect(() => { let vivo = true; carregarListasClientes().then(l => { if (vivo) setListas(l); }); return () => { vivo = false; }; }, []);
    return listas;
}

/** Cadastro do sharing com este nome (para gravar o vínculo da atividade). */
export const cadastroDoNome = (lista: OpcaoCliente[], nome?: string | null) =>
    nome ? lista.find(c => chave(c.nome) === chave(nome)) || null : null;

/** A lista com o valor atual incluído, para um registro antigo não perder o que tem. */
export const comAtual = (lista: string[], atual?: string | null) =>
    (atual && !lista.some(v => chave(v) === chave(atual)) ? [...lista, atual] : lista);
