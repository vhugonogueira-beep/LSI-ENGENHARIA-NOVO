// Sessão no navegador: todo pedido ao /api leva o token, e todo link para o
// /api (baixar PDF, abrir exportação) também. Instalado uma vez no main.tsx,
// antes do primeiro render — as telas continuam usando fetch() e <a href>
// normais, sem precisar lembrar de autenticar cada chamada.

const CHAVE_TOKEN = 'ls_auth_token';
const CHAVE_USUARIO = 'ls_auth_user';
export const EVENTO_SESSAO_EXPIRADA = 'ls:sessao-expirada';

export function lerToken(): string | null {
    try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
}

export function limparSessao() {
    try {
        localStorage.removeItem(CHAVE_TOKEN);
        localStorage.removeItem(CHAVE_USUARIO);
    } catch { /* sem storage não há o que limpar */ }
}

/** A URL é do nosso /api (relativa ou absoluta na mesma origem)? */
function ehApi(url: string): boolean {
    try {
        const u = new URL(url, window.location.href);
        return u.origin === window.location.origin && u.pathname.startsWith('/api/');
    } catch { return false; }
}

// Rotas em que 401 é resposta normal (senha errada, link vencido), não sessão caída.
const SEM_LOGOUT = [/\/api\/auth\/login$/, /\/api\/auth\/convite\//];

let instalado = false;

export function instalarSessao() {
    if (instalado) return;
    instalado = true;

    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!ehApi(url)) return fetchOriginal(input, init);

        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        const token = lerToken();
        if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        const resposta = await fetchOriginal(input, { ...init, headers });

        if (resposta.status === 401 && token && !SEM_LOGOUT.some(re => re.test(new URL(url, window.location.href).pathname))) {
            window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA));
        }
        return resposta;
    };

    // Links <a href="/api/..."> não passam pelo fetch: o navegador iria sem o
    // token e receberia 401. Intercepta o clique, baixa com o token e entrega
    // o arquivo (download) ou abre numa aba nova (target=_blank).
    document.addEventListener('click', async evento => {
        if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
        const link = (evento.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!link || !ehApi(link.href)) return;
        evento.preventDefault();

        const novaAba = link.target === '_blank' && !link.hasAttribute('download');
        // A aba abre já no clique: aberta depois do await, o navegador bloqueia como pop-up.
        const aba = novaAba ? window.open('', '_blank') : null;
        try {
            const resposta = await window.fetch(link.href, { cache: 'no-store' });
            if (!resposta.ok) {
                const corpo = await resposta.json().catch(() => null);
                throw new Error(corpo?.error || `Não foi possível abrir o arquivo (${resposta.status})`);
            }
            const blob = await resposta.blob();
            const objeto = URL.createObjectURL(blob);
            if (aba) {
                aba.location.href = objeto;
            } else {
                const disposicao = resposta.headers.get('content-disposition') || '';
                const nome = decodeURIComponent(disposicao.match(/filename\*=UTF-8''([^;]+)/i)?.[1] || '')
                    || disposicao.match(/filename="?([^";]+)"?/i)?.[1]
                    || link.getAttribute('download') || link.pathname.split('/').pop() || 'arquivo';
                const a = document.createElement('a');
                a.href = objeto;
                a.download = nome;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
            setTimeout(() => URL.revokeObjectURL(objeto), 60_000);
        } catch (e: any) {
            aba?.close();
            alert(e.message);
        }
    });
}

/** Sessão atual com permissões (GET /api/auth/me). */
export interface SessaoUsuario {
    id: string;
    nome: string;
    nome_exibicao?: string | null;
    email: string;
    role: string;
    permissoes: string[];
    aprovacao_pagamento?: string;
    limite_pagamento?: number | null;
}
