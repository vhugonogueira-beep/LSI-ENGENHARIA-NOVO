import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Tom } from '../lib/cores';

/**
 * Cabeçalho único de página. Antes cada tela tinha o seu: título de 32px com
 * ícone em Atividades, 18px sem ícone no Dashboard Financeiro, margens de 22 ou
 * 32px. Mesma tela, mesmo lugar para título, descrição e ações.
 *
 * - ícone numa caixa neutra, no azul do sistema (revisão de 08/10/2026: a cor
 *   por módulo saiu do cabeçalho; cor fica para status e alertas)
 * - título 24px, descrição 13px em uma linha de até ~80 caracteres
 * - ações (botão principal, seletor de período) alinhadas à direita, na
 *   altura do título; quebram para baixo em tela estreita
 */
export default function PageHeader({ icone: Icone, tom, titulo, descricao, acoes }: {
    icone: LucideIcon;
    tom: Tom;
    titulo: string;
    descricao?: ReactNode;
    acoes?: ReactNode;
}) {
    return (
        <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-3.5">
                <span data-tom={tom} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                    <Icone size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{titulo}</h1>
                    {descricao && <p className="mt-0.5 max-w-[80ch] text-sm text-muted-foreground">{descricao}</p>}
                </div>
            </div>
            {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </header>
    );
}
