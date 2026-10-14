import { useEffect, useState } from 'react';
import { OPERADORAS, SHARINGS } from '../components/atividades/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Sharings e operadoras vêm do cadastro de Clientes (13/10/2026): cadastrou lá,
// aparece na atividade e no site. Sharing = clientes do tipo Sharing ou
// Sharing e operadora; Operadora = Operadora ou Sharing e operadora.
//
// O que se grava na atividade/site é o CÓDIGO do cliente: a sigla (ou o nome,
// sem sigla), em maiúsculas — ex.: HIGHLINE. As regras da Highline (PV,
// documentação) dependem desse código, por isso a sigla deve ser estável.
// Sem resposta do servidor, valem as listas fixas de antes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteCadastro { nome: string; sigla?: string | null; tipo: string; ativo: boolean }

export const codigoCliente = (c: { sigla?: string | null; nome: string }) => String(c.sigla || c.nome || '').trim().toUpperCase();

let cache: { sharings: string[]; operadoras: string[] } | null = null;
let pedido: Promise<{ sharings: string[]; operadoras: string[] }> | null = null;

function montar(clientes: ClienteCadastro[]) {
    const ativos = clientes.filter(c => c.ativo !== false);
    const de = (tipos: string[]) => [...new Set(ativos.filter(c => tipos.includes(c.tipo)).map(codigoCliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const sharings = de(['SHARING', 'SHARING_OPERADORA']);
    const operadoras = de(['OPERADORA', 'SHARING_OPERADORA']);
    return {
        sharings: sharings.length ? [...sharings.filter(s => s !== 'OUTROS'), 'OUTROS'] : SHARINGS,
        operadoras: operadoras.length ? [...operadoras.filter(s => s !== 'OUTROS'), 'OUTROS'] : OPERADORAS,
    };
}

export function carregarListasClientes(forcar = false) {
    if (forcar) { cache = null; pedido = null; }
    if (!pedido) {
        pedido = fetch('/api/clientes')
            .then(r => (r.ok ? r.json() : []))
            .then((lista: ClienteCadastro[]) => (cache = montar(Array.isArray(lista) ? lista : [])))
            .catch(() => (cache = { sharings: SHARINGS, operadoras: OPERADORAS }));
    }
    return pedido;
}

/** Listas de sharings e operadoras do cadastro de Clientes. */
export function useListasClientes() {
    const [listas, setListas] = useState(cache || { sharings: SHARINGS, operadoras: OPERADORAS });
    useEffect(() => { let vivo = true; carregarListasClientes().then(l => { if (vivo) setListas(l); }); return () => { vivo = false; }; }, []);
    return listas;
}

/** A lista com o valor atual incluído, para um registro antigo não perder o que tem. */
export const comAtual = (lista: string[], atual?: string | null) => (atual && !lista.includes(atual) ? [...lista, atual] : lista);
