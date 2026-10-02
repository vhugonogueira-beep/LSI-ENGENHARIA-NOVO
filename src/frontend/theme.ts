// ─────────────────────────────────────────────────────────────────────────────
// Paleta LS Office — modelo Executivo, temas diurno e noturno.
//
// Antes desta fonte única, nove arquivos declaravam cada um a sua própria
// paleta em hex fixo — 2.040 usos de cor que não acompanhavam tema nenhum.
// Por isso trocar os tokens do index.css não mudava quase nada na tela.
//
// Os valores continuam sendo hex, e não `hsl(var(--x))`, de propósito: o
// código faz 83 concatenações do tipo `1px solid ${T.blue}40`, somando um
// canal alfa ao final da cor. Com `hsl(var())` essas 83 bordas e brilhos
// virariam CSS inválido e sumiriam da tela.
//
// O tema é resolvido uma vez, no carregamento do módulo. Assim os objetos de
// estilo derivados em escopo de módulo (`const S = { card: { background:
// T.bg2 } }`, espalhados pelas telas) continuam válidos sem precisar de hook,
// contexto ou qualquer mudança na estrutura dos componentes.
// ─────────────────────────────────────────────────────────────────────────────

export type NomeTema = 'claro' | 'escuro';

export interface Paleta {
    bg0: string; bg1: string; bg2: string; bg3: string; bg4: string;
    bgHover: string; bgSidebar: string;
    brSub: string; brBase: string; brStrong: string;
    txPri: string; txSec: string; txMut: string; txDis: string;
    blue: string; blueD: string; blueL: string;
    green: string; greenD: string; greenL: string;
    amber: string; amberD: string;
    red: string; redD: string;
    purple: string; cyan: string; orange: string; indigo: string;
    gradBlue: string;
    /** Títulos — um degrau mais escuro/claro que o texto corrente. */
    titulo: string;
}

const CLARA: Paleta = {
    bg0: '#F2F7FC',   // fundo da página
    bg1: '#FFFFFF',   // cabeçalho e superfícies recuadas
    bg2: '#FFFFFF',   // cartões
    bg3: '#FFFFFF',   // campos e áreas elevadas
    bg4: '#EAF3FF',   // fundo de seleção
    bgHover: 'rgba(23,104,213,0.07)',
    bgSidebar: '#0A2644',
    brSub: '#E8EFF8', brBase: '#DCE7F3', brStrong: '#C3D5E9',
    // txPri é o texto principal; títulos usam `titulo`, mais escuro.
    txPri: '#172B4D', txSec: '#526B89', txMut: '#5F7590', txDis: '#8496AC',
    blue: '#1768D5', blueD: '#0F4EA3', blueL: '#005CE6',
    // Semânticas escurecidas: os tons do tema noturno não têm contraste sobre branco.
    green: '#1D865C', greenD: '#146B48', greenL: '#4FAE84',
    amber: '#A26B16', amberD: '#8F5E10',
    red: '#C0413C', redD: '#99322E',
    purple: '#6D4FC4', cyan: '#1E7F94', orange: '#C26A28', indigo: '#3F57B8',
    gradBlue: 'linear-gradient(90deg, #0F4EA3, #1768D5)',
    titulo: '#0B173D',
};

const ESCURA: Paleta = {
    bg0: '#0A1422',
    bg1: '#0E1A2B',
    bg2: '#122238',
    bg3: '#182B43',
    bg4: '#203651',
    bgHover: 'rgba(23,104,213,0.12)',
    bgSidebar: '#081321',
    brSub: '#1F3149', brBase: '#2B4059', brStrong: '#3A5273',
    txPri: '#EAF1FA', txSec: '#A6B7CC', txMut: '#8497AE', txDis: '#64778E',
    blue: '#1768D5', blueD: '#0F4EA3', blueL: '#78B5FF',
    green: '#34d399', greenD: '#0d9e74', greenL: '#6ee7b7',
    amber: '#fbbf24', amberD: '#F59E0B',
    red: '#f87171', redD: '#EF4444',
    purple: '#a78bfa', cyan: '#67e8f9', orange: '#fb923c', indigo: '#6366f1',
    gradBlue: 'linear-gradient(90deg, #0F4EA3, #1768D5)',
    titulo: '#F2F7FC',
};

export const PALETAS: Record<NomeTema, Paleta> = { claro: CLARA, escuro: ESCURA };

const CHAVE = 'ls_tema';

export function temaSalvo(): NomeTema {
    try {
        const v = localStorage.getItem(CHAVE);
        if (v === 'claro' || v === 'escuro') return v;
    } catch { /* navegador sem storage: cai no padrão */ }
    return 'claro';
}

export const tema: NomeTema = temaSalvo();

/** Paleta do conteúdo — muda com o tema. */
export const T: Paleta = PALETAS[tema];

/**
 * Paleta do menu lateral. O menu é marinho nos dois temas, com texto claro,
 * então não pode herdar `txPri` do conteúdo: no tema claro isso colocaria
 * texto quase preto sobre fundo marinho.
 */
export const TMenu: Paleta = {
    ...ESCURA,
    // Texto e ícones do menu, claros nos dois temas (referência Executivo).
    txPri: '#FFFFFF',
    txSec: '#DCE8F7',
    txMut: '#C2D5EC',
    txDis: '#9FB6D2',
    blue: '#1768D5',
    bgSidebar: T.bgSidebar,
    bg0: T.bgSidebar,
    bg1: tema === 'claro' ? '#123156' : '#0E1A2B',
    bg2: T.bgSidebar,
    bg3: tema === 'claro' ? '#16375A' : '#182B43',
    bg4: tema === 'claro' ? '#1B4168' : '#203651',
    brSub: tema === 'claro' ? '#16375A' : '#1F3149',
    brBase: tema === 'claro' ? '#1E4368' : '#2B4059',
    brStrong: tema === 'claro' ? '#2A5683' : '#3A5273',
};

/**
 * Carimba o tema no elemento raiz para as telas escritas em Tailwind, que leem
 * os tokens de `index.css`. Roda no import, antes do primeiro render, para não
 * haver piscada de tema errado.
 */
export function carimbarTema(nome: NomeTema = tema) {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', nome === 'claro' ? 'light' : 'dark');
    }
}
carimbarTema();

/**
 * Troca o tema. Recarrega a página de propósito: a paleta é resolvida no
 * carregamento do módulo e alimenta objetos de estilo criados em escopo de
 * módulo, que não seriam recalculados por um re-render do React.
 */
export function aplicarTema(nome: NomeTema) {
    try { localStorage.setItem(CHAVE, nome); } catch { /* segue e recarrega mesmo assim */ }
    carimbarTema(nome);
    window.location.reload();
}
