import { BarChart3, CreditCard, FileSpreadsheet, Receipt, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import PageHeader from '../components/PageHeader';

// ─────────────────────────────────────────────────────────────────────────────
// Relatórios — porta de entrada para as visões de resultado (08/10/2026). Antes
// eram dois botões para ferramentas do fluxo antigo (dados no navegador); agora
// leva às telas que leem o banco, e as antigas ficam separadas e identificadas.
// ─────────────────────────────────────────────────────────────────────────────

interface Atalho { tab: string; icone: LucideIcon; titulo: string; texto: string }

const ATUAIS: Atalho[] = [
    { tab: 'dashboard', icone: TrendingUp, titulo: 'Dashboard financeiro', texto: 'Receita, impostos, custo comprometido e pago, e margem por atividade.' },
    { tab: 'pagamentos', icone: CreditCard, titulo: 'Controle de pagamentos', texto: 'O que está a pagar, o que foi pago e o que ainda não tem comprovante.' },
    { tab: 'faturamento', icone: Receipt, titulo: 'Faturamento', texto: 'POs recebidas, linhas autorizadas, lotes enviados e valores a receber.' },
    { tab: 'historico', icone: FileSpreadsheet, titulo: 'Orçamentos', texto: 'Todos os orçamentos das atividades, com status e total ao cliente.' },
];
const ANTIGAS: Atalho[] = [
    { tab: 'resumo', icone: BarChart3, titulo: 'Resumo financeiro (antigo)', texto: 'Indicadores do orçamento avulso, com dados guardados neste navegador.' },
    { tab: 'pvhighline', icone: FileSpreadsheet, titulo: 'PV Highline avulsa (antiga)', texto: 'Geração de PV fora de atividade. Hoje a PV é montada na aba de orçamento da atividade.' },
    { tab: 'orcamento', icone: Wrench, titulo: 'Orçamento por LPU (antigo)', texto: 'Montagem de orçamento avulso pela LPU, sem vínculo com atividade.' },
];

export default function Relatorios({ onAbrir }: { onAbrir: (tab: string) => void }) {
    const cartao = (a: Atalho, antigo = false) => {
        const Icone = a.icone;
        return (
            <button key={a.tab} type="button" onClick={() => onAbrir(a.tab)}
                className={`flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 ${antigo ? 'opacity-80' : ''}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border ${antigo ? 'text-muted-foreground' : 'text-primary'}`}>
                    <Icone size={18} aria-hidden />
                </span>
                <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-foreground">{a.titulo}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{a.texto}</span>
                </span>
            </button>
        );
    };
    return (
        <main className="p-8 text-foreground">
            <PageHeader icone={BarChart3} tom="cyan" titulo="Relatórios" descricao="Visões de resultado do sistema, com os dados das atividades." />
            <section className="grid gap-3 md:grid-cols-2">{ATUAIS.map(a => cartao(a))}</section>
            <h2 className="mb-2 mt-8 text-sm font-semibold text-muted-foreground">Ferramentas do fluxo antigo</h2>
            <p className="mb-3 max-w-[80ch] text-xs text-muted-foreground">Trabalham com dados guardados no navegador, fora das atividades. Ficam disponíveis para consulta até a migração terminar.</p>
            <section className="grid gap-3 md:grid-cols-3">{ANTIGAS.map(a => cartao(a, true))}</section>
        </main>
    );
}
