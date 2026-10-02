import type { ReactNode } from 'react';
import { ChevronDown, MoreVertical, Paperclip } from 'lucide-react';

export type FinancialAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
};

export function FinancialBeneficiaryCard({
  name, category, total, totalLabel = 'Contratado', status, headerActions, children,
}: {
  name: string;
  category?: string | null;
  total?: ReactNode;
  totalLabel?: string;
  status?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return <article className="overflow-visible rounded-xl border border-border bg-card">
    {/* Faixa de cabecalho tingida e titulo em azul: e o que separa visualmente
        um favorecido do proximo quando varios blocos de pagamento se empilham. */}
    <header className="flex flex-col gap-3 border-b border-border bg-accent px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-[hsl(var(--link))]">{name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {category && <span className="font-medium">{category}</span>}
          {total !== undefined && <span>{totalLabel} <strong className="text-foreground">{total}</strong></span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{status}{headerActions}</div>
    </header>
    <div className="space-y-2.5 p-3 sm:p-4">{children}</div>
  </article>;
}

export function FinancialPaymentCard({
  title, percentage, amount, method, context, requestedAt, expectedAt, paidAt,
  receipt, status, primaryAction, actions = [], children,
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
}) {
  return <section className="rounded-xl border border-border/80 bg-background/45 px-3.5 py-3 transition-colors hover:border-border sm:px-4">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {percentage !== undefined && <span className="text-[11px] text-muted-foreground">{percentage}</span>}
          <strong className="ml-auto text-base text-foreground sm:ml-2">{amount}</strong>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {method && <span className="font-semibold text-foreground">{method}</span>}
          {context && <span className="min-w-0 truncate">{context}</span>}
        </div>
        {(requestedAt || expectedAt || paidAt || receipt) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {requestedAt && <span>Solicitado: <b className="font-medium text-foreground/80">{requestedAt}</b></span>}
          {expectedAt && <span>Previsto: <b className="font-medium text-foreground/80">{expectedAt}</b></span>}
          {paidAt && <span>Pago: <b className="font-medium text-ok">{paidAt}</b></span>}
          {receipt && <span className={receipt.attached ? 'font-semibold text-ok' : 'text-warn'}>{receipt.label || (receipt.attached ? 'Comprovante anexado' : 'Sem comprovante')}</span>}
        </div>}
        {children}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 lg:min-w-[210px] lg:justify-end lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
        <div>{status}</div>
        <div className="flex items-center gap-2">{primaryAction}{actions.length > 0 && <FinancialActionMenu actions={actions}/>}</div>
      </div>
    </div>
  </section>;
}

export function FinancialActionMenu({ actions }: { actions: FinancialAction[] }) {
  const visible = actions.filter(action => !action.disabled);
  if (!visible.length) return null;
  return <details className="group relative z-20">
    <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground [&::-webkit-details-marker]:hidden">
      <MoreVertical size={15} aria-hidden/><span className="hidden sm:inline">Mais ações</span><span className="sr-only sm:hidden">Mais ações</span>
    </summary>
    <div className="absolute right-0 top-10 z-50 min-w-[190px] overflow-hidden rounded-lg border border-border bg-card p-1.5 shadow-2xl">
      {visible.map((action, index) => action.href
        ? <a key={`${action.label}-${index}`} href={action.href} target="_blank" rel="noreferrer" className={`block rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${action.tone === 'danger' ? 'text-crit' : 'text-foreground'}`}>{action.label}</a>
        : <button key={`${action.label}-${index}`} type="button" onClick={action.onClick} className={`block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${action.tone === 'danger' ? 'text-crit' : 'text-foreground'}`}>{action.label}</button>
      )}
    </div>
  </details>;
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
