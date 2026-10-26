import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MoreVertical, Paperclip } from 'lucide-react';

export type FinancialAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
};

// Lista de pagamentos em tabela, por favorecido (proposta 1, 15/10/2026): o
// favorecido é o cabeçalho do grupo (com a barra do quanto já foi pago) e cada
// parcela é uma linha com colunas fixas — forma, datas, status, valor e ações
// caem na mesma vertical de uma linha para a outra.
export const COLUNAS_PARCELA = 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_192px_120px_150px_44px]';

export function FinancialBeneficiaryCard({
  name, category, total, totalLabel = 'Contratado', status, headerActions, children, progress, meta,
  aberto, onAlternar, resumo,
}: {
  name: string;
  category?: string | null;
  total?: ReactNode;
  totalLabel?: string;
  status?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  /** Quanto já foi pago do total: desenha a barra no cabeçalho. */
  progress?: { pago: number; total: number; rotulo?: ReactNode };
  /** Linha extra do cabeçalho (ex.: diretório no servidor). */
  meta?: ReactNode;
  /** Cortina (26/10/2026): aberto/fechado controlado por quem usa; sem isto, começa aberto e alterna sozinho. */
  aberto?: boolean;
  onAlternar?: () => void;
  /** Mostrado no cabeçalho quando fechado (ex.: "3 parcelas · 2 pagas"). */
  resumo?: ReactNode;
}) {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.max(0, (progress.pago / progress.total) * 100)) : 0;
  const [abertoLocal, setAbertoLocal] = useState(true);
  const estaAberto = aberto ?? abertoLocal;
  const alternar = onAlternar ?? (() => setAbertoLocal(v => !v));
  // Cada favorecido é uma "janela": borda e cabeçalho em azul vivo separam uma
  // programação da seguinte (26/10/2026). Clicar no cabeçalho abre ou fecha;
  // botões, menus e seletores do cabeçalho seguem com a própria ação.
  return <article className="overflow-visible rounded-xl border border-primary/45 bg-card shadow-sm">
    <header onClick={e => { if (!(e.target as HTMLElement).closest('button,a,select,input,label,[role=menu]')) alternar(); }}
      className={`grid cursor-pointer gap-3 rounded-t-xl border-l-4 border-l-primary bg-primary/20 px-4 py-3 hover:bg-primary/25 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center ${estaAberto ? 'border-b border-primary/40' : 'rounded-b-xl'}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={alternar} aria-expanded={estaAberto} aria-label={`${estaAberto ? 'Recolher' : 'Expandir'} os pagamentos de ${name}`}
            title={estaAberto ? 'Recolher os pagamentos' : 'Expandir os pagamentos'}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/85">
            {estaAberto ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
          </button>
          <h3 className="truncate text-[15px] font-bold text-foreground">{name}</h3>
          {!estaAberto && resumo && <span className="shrink-0 text-[11px] font-semibold text-[hsl(var(--link))]">{resumo}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {category && <span className="font-medium">{category}</span>}
          {meta}
        </div>
      </div>
      {progress ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Pago do contratado">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-ok' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{progress.rotulo}</span>
        </div>
      ) : <div className="hidden lg:block" />}
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        {total !== undefined && <span className="text-right text-[11px] text-muted-foreground">{totalLabel}<strong className="ml-1.5 text-sm text-foreground tabular-nums">{total}</strong></span>}
        {status}{headerActions}
      </div>
    </header>
    {/* Blocos que não são linha de parcela (avisos, arquivos do contrato,
        edição) ganham o recuo da tabela; as linhas se separam por fio. */}
    {estaAberto && <div className="[&>*:not(section)]:mx-4 [&>*:not(section)]:my-2.5">{children}</div>}
  </article>;
}

export function FinancialPaymentCard({
  title, percentage, amount, method, context, requestedAt, expectedAt, paidAt,
  receipt, status, primaryAction, actions = [], children, stripe,
}: {
  title: string;
  percentage?: ReactNode;
  amount: ReactNode;
  method?: ReactNode;
  context?: ReactNode;
  requestedAt?: ReactNode;
  expectedAt?: ReactNode;
  paidAt?: ReactNode;
  receipt?: { attached: boolean; label?: string };
  status: ReactNode;
  primaryAction?: ReactNode;
  actions?: FinancialAction[];
  children?: ReactNode;
  /** Faixa à esquerda na cor da origem — classe `FAIXA[tom]` de lib/cores.ts. */
  stripe?: string;
}) {
  return <section className={`border-t border-border/60 px-4 py-2.5 transition-colors first:border-t-0 hover:bg-secondary/20 ${stripe ? `border-l-4 ${stripe}` : ''}`}>
    <div className={`grid items-center gap-x-4 gap-y-2 ${COLUNAS_PARCELA}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {percentage !== undefined && <span className="text-[11px] text-muted-foreground">{percentage}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          {method && <span className="font-semibold text-foreground/90">{method}</span>}
          {context && <span className="min-w-0 truncate">{context}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {requestedAt && <span>Solicitado <b className="font-medium text-foreground/80">{requestedAt}</b></span>}
        {expectedAt && <span>Previsto <b className="font-medium text-foreground/80">{expectedAt}</b></span>}
        {paidAt && <span>Pago <b className="font-medium text-ok">{paidAt}</b></span>}
        {receipt && <span className={receipt.attached ? 'font-semibold text-ok' : 'text-warn'}>{receipt.label || (receipt.attached ? 'Comprovante anexado' : 'Sem comprovante')}</span>}
        {!requestedAt && !expectedAt && !paidAt && !receipt && <span>—</span>}
      </div>
      <div className="min-w-0">{status}</div>
      <strong className="text-sm text-foreground tabular-nums lg:text-right">{amount}</strong>
      <div className="flex items-center lg:[&>*]:w-full lg:[&>*]:justify-center">{primaryAction}</div>
      <div className="flex items-center lg:justify-end">{actions.length > 0 && <FinancialActionMenu actions={actions} compacto/>}</div>
    </div>
    {children && <div className="mt-2">{children}</div>}
  </section>;
}

export function FinancialActionMenu({ actions, compacto = false }: { actions: FinancialAction[]; compacto?: boolean }) {
  // Menu controlado (14/10/2026): fecha ao clicar de novo no botão, fora dele, em
  // uma ação ou com Esc. Aberto, fica acima dos outros cartões (o <details> antigo
  // ficava aberto e os botões "Mais ações" de baixo passavam por cima dele).
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const visible = actions.filter(action => !action.disabled);
  if (!visible.length) return null;
  return <div ref={caixa} className={`relative ${aberto ? 'z-50' : 'z-0'}`}>
    <button type="button" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto(v => !v)} title={compacto ? 'Mais ações' : undefined}
      className={`flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-semibold hover:bg-secondary hover:text-foreground ${aberto ? 'bg-secondary text-foreground' : 'bg-secondary/40 text-muted-foreground'}`}>
      <MoreVertical size={15} aria-hidden/>{compacto ? <span className="sr-only">Mais ações</span> : <><span className="hidden sm:inline">Mais ações</span><span className="sr-only sm:hidden">Mais ações</span></>}
    </button>
    {aberto && <div role="menu" className="absolute right-0 top-10 min-w-[190px] overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-2xl">
      {visible.map((action, index) => action.href
        ? <a key={`${action.label}-${index}`} role="menuitem" href={action.href} target="_blank" rel="noreferrer" onClick={() => setAberto(false)} className={`block rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${action.tone === 'danger' ? 'text-crit' : 'text-foreground'}`}>{action.label}</a>
        : <button key={`${action.label}-${index}`} role="menuitem" type="button" onClick={() => { setAberto(false); action.onClick?.(); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${action.tone === 'danger' ? 'text-crit' : 'text-foreground'}`}>{action.label}</button>
      )}
    </div>}
  </div>;
}

export function FinancialAttachments({ count, label = 'Arquivos e comprovantes', addAction, children }: {
  count: number;
  label?: string;
  addAction?: ReactNode;
  children?: ReactNode;
}) {
  return <div className="rounded-lg border border-border/60 bg-secondary/10">
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <details className="group min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Paperclip size={13} aria-hidden/><span>{label} ({count})</span>{count > 0 && <ChevronDown size={13} aria-hidden className="transition-transform group-open:rotate-180"/>}
        </summary>
        {count > 0 && <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">{children}</div>}
      </details>
      {addAction && <div className="shrink-0">{addAction}</div>}
    </div>
  </div>;
}
