import { createContext, useContext } from 'react';
import type { SessaoUsuario } from './sessao';

// Permissões da sessão para a interface esconder ou travar botões. É conforto
// de uso, não segurança: quem decide de verdade é o backend
// (permissoes.service.ts), que responde 403 do mesmo jeito.

export const SessaoContext = createContext<SessaoUsuario | null>(null);

export function useSessao() {
    return useContext(SessaoContext);
}

export function usePermissao(chave: string): boolean {
    const sessao = useContext(SessaoContext);
    if (!sessao) return false;
    return sessao.role === 'ADMIN' || sessao.permissoes.includes(chave);
}

export function useEhAdmin(): boolean {
    return useContext(SessaoContext)?.role === 'ADMIN';
}
