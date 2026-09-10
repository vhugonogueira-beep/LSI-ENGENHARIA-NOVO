export const PAGAMENTO_STATUS = [
    'PENDENTE', 'SOLICITADO', 'ENVIADO_FINANCEIRO', 'AGUARDANDO_PAGAMENTO',
    'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO',
] as const;

const COR_STATUS: Record<string, string> = {
    PENDENTE: '#94a3b8',
    SOLICITADO: '#f59e0b',
    ENVIADO_FINANCEIRO: '#3b82f6',
    AGUARDANDO_PAGAMENTO: '#3b82f6',
    PAGO: '#22c55e',
    COMPROVANTE_RECEBIDO: '#22c55e',
    CONFERIDO: '#22d3ee',
};

const ROTULO_STATUS: Record<string, string> = {
    PENDENTE: 'PENDENTE',
    SOLICITADO: 'SOLICITADO',
    ENVIADO_FINANCEIRO: 'ENVIADO AO FINANCEIRO',
    AGUARDANDO_PAGAMENTO: 'AGUARDANDO PAGAMENTO',
    PAGO: 'PAGO',
    COMPROVANTE_RECEBIDO: 'COMPROVANTE RECEBIDO',
    CONFERIDO: 'CONFERIDO',
};

export default function PagamentoStatusSelect({
    value, onChange, disabled = false,
}: {
    value: string;
    onChange: (status: string) => void;
    disabled?: boolean;
}) {
    const cor = COR_STATUS[value] || '#94a3b8';
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="h-7 min-w-[172px] rounded border-0 px-2 text-[10px] font-bold outline-none disabled:opacity-50"
            style={{ backgroundColor: `${cor}22`, color: cor }}
        >
            {PAGAMENTO_STATUS.map(status => (
                <option key={status} value={status}>{ROTULO_STATUS[status]}</option>
            ))}
        </select>
    );
}
