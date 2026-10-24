import { useEffect, useState } from 'react';

/**
 * useState que sobrevive a um recarregamento da aba (23/10/2026).
 *
 * O Chrome descarta abas em segundo plano (Economia de memória) e as recarrega
 * na volta; sem isto o sistema voltava à tela inicial, fechava a atividade
 * aberta e perdia o cadastro pela metade. Guarda em sessionStorage: vale só
 * para esta aba e some ao fechá-la. Sem storage (modo restrito), funciona como
 * um useState comum.
 */
export function useEstadoDaSessao<T>(chave: string, inicial: T | (() => T)) {
    const [valor, setValor] = useState<T>(() => {
        try {
            const salvo = sessionStorage.getItem(chave);
            if (salvo !== null) return JSON.parse(salvo) as T;
        } catch { /* sem storage ou valor corrompido: começa do inicial */ }
        return typeof inicial === 'function' ? (inicial as () => T)() : inicial;
    });
    useEffect(() => {
        try { sessionStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem storage: só não lembra */ }
    }, [chave, valor]);
    return [valor, setValor] as const;
}

/** Esquece um estado guardado (ex.: ao voltar à lista pelo menu). */
export function esquecerEstadoDaSessao(chave: string) {
    try { sessionStorage.removeItem(chave); } catch { /* sem storage */ }
}

export const CHAVE_ATIVIDADE_ABERTA = 'ls_atividade_aberta';
