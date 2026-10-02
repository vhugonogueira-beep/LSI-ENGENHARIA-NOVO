import type { ReactNode } from 'react';

/**
 * Painel de filtros das telas de lista (decisão de 02/10/2026: "painel de
 * filtros em grade", alinhado à esquerda — a versão centralizada foi recusada).
 *
 * Regras que ele garante:
 * - mesmas bordas da tabela logo abaixo (cartão de largura total);
 * - uma coluna fixa de rótulos (112px), então todo controle começa na mesma
 *   vertical, linha após linha;
 * - altura única de 36px para campo, seletor e alternador (`CAMPO`, `ALTERNADOR`);
 * - seletores em grade de colunas iguais (`GradeSeletores`), nunca com a
 *   largura do próprio texto;
 * - espaçamento fixo: 12px entre linhas, 16px de respiro interno.
 */
export function FiltroPainel({ children }: { children: ReactNode }) {
    return (
        <section aria-label="Filtros" className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
            {children}
        </section>
    );
}

/** Uma linha do painel: rótulo à esquerda (opcional) e controles à direita. */
export function FiltroLinha({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
    return (
        <div className="grid gap-2 md:grid-cols-[112px_minmax(0,1fr)] md:items-center md:gap-3">
            {rotulo
                ? <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
                : <span aria-hidden className="hidden md:block" />}
            <div className="min-w-0">{children}</div>
        </div>
    );
}

/** Seletores com largura igual, em colunas que acompanham a tela. */
export function GradeSeletores({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{children}</div>;
}

/** Campo ou seletor do painel — 36px. A largura vem de quem usa (w-full na grade,
 * w-56 ao lado da busca): com w-full aqui, ele vencia o w-56 e a linha quebrava. */
export const CAMPO = 'h-9 rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

/** Contêiner de botões segmentados (lista/kanban, tipo) — mesma altura do CAMPO. */
export const ALTERNADOR = 'inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background/50 p-1';

/** Botão dentro do ALTERNADOR. */
export const SEGMENTO = 'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold leading-none';
