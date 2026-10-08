// Cada pessoa sobe a própria assinatura (decisão de 08/10/2026); quem ainda não
// subiu é avisado na prévia, em vez de descobrir depois que o e-mail saiu sem.
export default function AvisoSemAssinatura({ className = '' }: { className?: string }) {
    return (
        <div role="status" className={`rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn ${className}`}>
            Você ainda não tem assinatura de e-mail, então este e-mail sai sem ela. Envie a sua em <strong>Meu Perfil → Assinatura de e-mail</strong> e gere o e-mail de novo.
        </div>
    );
}
