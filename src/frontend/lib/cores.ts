// Cor com significado — fonte única do LSI (docs/DESIGN-SYSTEM.md).
//
// Cada DIMENSÃO do trabalho tem a sua família de cor, e a mesma coisa tem a
// mesma cor em toda tela: "Em execução" é azul na pílula, na faixa da linha,
// no cabeçalho do kanban e na barra de avanço; "Operação" é teal em qualquer
// lugar. Assim a cor vira atalho de leitura, não enfeite.
//
// As classes Tailwind estão escritas por extenso (e não montadas com
// `bg-c-${tom}`) porque o Tailwind só gera classes que encontra literais no
// código-fonte.

import { tema } from '../theme';

export type Tom = 'indigo' | 'blue' | 'cyan' | 'teal' | 'green' | 'amber' | 'orange' | 'rose' | 'violet' | 'slate';

/** Pílula / etiqueta: fundo tingido, texto e borda na cor. */
export const CHIP: Record<Tom, string> = {
    indigo: 'bg-c-indigo/15 text-c-indigo border border-c-indigo/30',
    blue: 'bg-c-blue/15 text-c-blue border border-c-blue/30',
    cyan: 'bg-c-cyan/15 text-c-cyan border border-c-cyan/30',
    teal: 'bg-c-teal/15 text-c-teal border border-c-teal/30',
    green: 'bg-c-green/15 text-c-green border border-c-green/30',
    amber: 'bg-c-amber/15 text-c-amber border border-c-amber/30',
    orange: 'bg-c-orange/15 text-c-orange border border-c-orange/30',
    rose: 'bg-c-rose/15 text-c-rose border border-c-rose/30',
    violet: 'bg-c-violet/15 text-c-violet border border-c-violet/30',
    slate: 'bg-c-slate/15 text-c-slate border border-c-slate/30',
};

/** Só o texto na cor. */
export const TEXTO: Record<Tom, string> = {
    indigo: 'text-c-indigo', blue: 'text-c-blue', cyan: 'text-c-cyan', teal: 'text-c-teal', green: 'text-c-green',
    amber: 'text-c-amber', orange: 'text-c-orange', rose: 'text-c-rose', violet: 'text-c-violet', slate: 'text-c-slate',
};

/** Preenchimento sólido (barra de avanço, ponto de status). */
export const SOLIDO: Record<Tom, string> = {
    indigo: 'bg-c-indigo', blue: 'bg-c-blue', cyan: 'bg-c-cyan', teal: 'bg-c-teal', green: 'bg-c-green',
    amber: 'bg-c-amber', orange: 'bg-c-orange', rose: 'bg-c-rose', violet: 'bg-c-violet', slate: 'bg-c-slate',
};

/** Fundo bem leve, para cabeçalho de coluna, faixa ou caixa de ícone. */
export const VEU: Record<Tom, string> = {
    indigo: 'bg-c-indigo/15', blue: 'bg-c-blue/15', cyan: 'bg-c-cyan/15', teal: 'bg-c-teal/15', green: 'bg-c-green/15',
    amber: 'bg-c-amber/15', orange: 'bg-c-orange/15', rose: 'bg-c-rose/15', violet: 'bg-c-violet/15', slate: 'bg-c-slate/15',
};

/** Faixa à esquerda de uma linha/cartão (use junto de `border-l-4`). */
export const FAIXA: Record<Tom, string> = {
    indigo: 'border-l-c-indigo', blue: 'border-l-c-blue', cyan: 'border-l-c-cyan', teal: 'border-l-c-teal', green: 'border-l-c-green',
    amber: 'border-l-c-amber', orange: 'border-l-c-orange', rose: 'border-l-c-rose', violet: 'border-l-c-violet', slate: 'border-l-c-slate',
};

/** Borda superior (cabeçalho de coluna do kanban, cartão de KPI; use com `border-t-2`). */
export const TOPO: Record<Tom, string> = {
    indigo: 'border-t-c-indigo', blue: 'border-t-c-blue', cyan: 'border-t-c-cyan', teal: 'border-t-c-teal', green: 'border-t-c-green',
    amber: 'border-t-c-amber', orange: 'border-t-c-orange', rose: 'border-t-c-rose', violet: 'border-t-c-violet', slate: 'border-t-c-slate',
};

/** Hex do tom no tema atual — para telas em estilo inline (objeto T). */
const HEX_ESCURO: Record<Tom, string> = {
    indigo: '#818CF8', blue: '#60A5FA', cyan: '#22D3EE', teal: '#2DD4BF', green: '#34D399',
    amber: '#FBBF24', orange: '#FB923C', rose: '#FB7185', violet: '#A78BFA', slate: '#94A3B8',
};
const HEX_CLARO: Record<Tom, string> = {
    indigo: '#4F46E5', blue: '#2563EB', cyan: '#0891B2', teal: '#0D9488', green: '#059669',
    amber: '#B45309', orange: '#C2410C', rose: '#E11D48', violet: '#7C3AED', slate: '#64748B',
};
export const hexTom = (t: Tom) => (tema === 'claro' ? HEX_CLARO : HEX_ESCURO)[t];

// ── As dimensões ───────────────────────────────────────────────────────────

/** Status operacional da atividade — a escala da obra. */
export const TOM_STATUS: Record<string, Tom> = {
    PLANEJAMENTO: 'indigo',
    AGUARDANDO_LIBERACAO: 'amber',
    EM_EXECUCAO: 'blue',
    CONCLUIDA: 'green',
    ON_HOLD: 'violet',
};

/** Área (tipo de demanda). */
export const TOM_AREA: Record<string, Tom> = { IMPLANTACAO: 'blue', OPERACAO: 'teal' };

/** Operadora móvel — próximo da cor de marca de cada uma. */
export const TOM_OPERADORA: Record<string, Tom> = { VIVO: 'violet', CLARO: 'rose', TIM: 'blue', OI: 'amber', OUTROS: 'slate' };

/** Sharing / detentora. */
export const TOM_SHARING: Record<string, Tom> = { HIGHLINE: 'cyan', IHS: 'orange', WINITY: 'violet', SBA: 'teal', OUTROS: 'slate' };

/** Ramo do fornecedor / prestador (Supplier.categoria). */
export const TOM_RAMO: Record<string, Tom> = {
    MATERIAL: 'green', MAO_DE_OBRA: 'blue', SERVICO: 'violet', LOCACAO: 'amber', EQUIPAMENTO: 'cyan',
    TRANSPORTE: 'orange', ENGENHARIA: 'indigo', SONDAGEM: 'rose', ANALISE: 'teal', OUTROS: 'slate',
};

/** Módulo do sistema — menu lateral e cabeçalho de cada página. */
export const TOM_MODULO: Record<string, Tom> = {
    overview: 'indigo', demandas: 'indigo', dashboard: 'violet',
    historico: 'amber', lpus: 'amber', orcv2: 'amber',
    atividades: 'blue', fornecedores: 'teal', relatorios: 'cyan', faturamento: 'green',
    pagamentos: 'orange', clientes: 'rose', perfil: 'slate', configuracoes: 'slate',
};

/** Tom de uma chave num mapa, tolerando caixa; sem correspondência, `padrao`. */
export const tomDe = (mapa: Record<string, Tom>, chave?: string | null, padrao: Tom = 'slate'): Tom =>
    (chave ? mapa[chave] || mapa[chave.trim().toUpperCase()] : undefined) || padrao;
