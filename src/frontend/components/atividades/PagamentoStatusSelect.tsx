export const PAGAMENTO_STATUS = [
    'PENDENTE', 'SOLICITADO', 'ENVIADO_FINANCEIRO', 'AGUARDANDO_PAGAMENTO',
    'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO',
] as const;

// Tokens de estado (index.css), não hex: acompanham o tema claro/escuro.
const TOM_STATUS: Record<string, string> = {
    PENDENTE: 'bg-muted text-muted-foreground',
    SOLICITADO: 'bg-warn/15 text-warn',
    ENVIADO_FINANCEIRO: 'bg-primary/15 text-primary',
    AGUARDANDO_PAGAMENTO: 'bg-primary/15 text-primary',
    PAGO: 'bg-ok/15 text-ok',
    COMPROVANTE_RECEBIDO: 'bg-ok/15 text-ok',
    CONFERIDO: 'bg-info/15 text-info',
};

const ROTULO_STATUS: Record<string, string> = {
    PENDENTE: 'Pendente',
    SOLICITADO: 'Solicitado',
    ENVIADO_FINANCEIRO: 'Enviado ao financeiro',
    AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
    PAGO: 'Pago',
    COMPROVANTE_RECEBIDO: 'Comprovante recebido',
    CONFERIDO: 'Conferido',
};

export default function PagamentoStatusSelect({
    value, onChange, disabled = false,
}: {
    value: string;
    onChange: (status: string) => void;
    disabled?: boolean;
}) {
    const tom = TOM_STATUS[value] || TOM_STATUS.PENDENTE;
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            aria-label="Status do pagamento"
            className={`h-7 min-w-[172px] rounded-md border-0 px-2 text-xs font-semibold disabled:opacity-50 ${tom}`}
        >
            {PAGAMENTO_STATUS.map(status => (
                <option key={status} value={status}>{ROTULO_STATUS[status]}</option>
            ))}
        </select>
    );
}
