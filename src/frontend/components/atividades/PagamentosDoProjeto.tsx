import { useEffect, useState } from 'react';
import { Plus, Wallet, X } from 'lucide-react';
import PrestacaoContasViagem from './PrestacaoContasViagem';
import { ErrorBanner, GhostButton, PrimaryButton, inputClass } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pagamentos do projeto (12/10/2026): o adiantamento pode ser pedido para o
// projeto inteiro — ex.: R$ 3.000 para as vistorias de energia da Oi — e, na
// prestação de contas, cada gasto diz para qual site foi. Aqui também aparecem
// os adiantamentos pedidos dentro das atividades do projeto.
// ─────────────────────────────────────────────────────────────────────────────

const hojeLocal = () => {
    const agora = new Date();
    return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function PagamentosDoProjeto({ projeto, onMudou }: {
    projeto: { id: string; codigo: string; titulo: string };
    onMudou?: () => void;
}) {
    const [aberto, setAberto] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const mudou = () => { setRefresh(r => r + 1); onMudou?.(); };

    return (
        <div className="border-t border-border px-4 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold"><Wallet size={16} aria-hidden /> Pagamentos do projeto</h4>
                    <p className="text-xs text-muted-foreground">Adiantamentos do projeto e das atividades dele. Na prestação de contas, cada gasto vai para um site do projeto.</p>
                </div>
                <PrimaryButton onClick={() => setAberto(true)}><Plus size={14} className="mr-1 inline" aria-hidden />Solicitar adiantamento do projeto</PrimaryButton>
            </div>
            <PrestacaoContasViagem projeto={projeto} refreshKey={refresh} standalone embutido />
            {aberto && <NovoAdiantamentoProjeto projeto={projeto} onFechar={() => setAberto(false)} onCriado={() => { setAberto(false); mudou(); }} />}
        </div>
    );
}

function NovoAdiantamentoProjeto({ projeto, onFechar, onCriado }: {
    projeto: { id: string; codigo: string; titulo: string };
    onFechar: () => void;
    onCriado: () => void;
}) {
    const [pessoas, setPessoas] = useState<{ funcionarios: any[]; suppliers: any[] }>({ funcionarios: [], suppliers: [] });
    const [f, setF] = useState({ favorecido: '', valor: '', motivo: '', forma_pagamento: '', data_solicitacao: hojeLocal(), data_prevista: '' });
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        Promise.all([fetch('/api/funcionarios'), fetch('/api/suppliers?limit=200')]).then(async ([fu, su]) => setPessoas({
            funcionarios: fu.ok ? await fu.json() : [],
            suppliers: su.ok ? ((await su.json()).items || []) : [],
        })).catch(() => undefined);
    }, []);

    async function salvar() {
        const valor = Number(String(f.valor).replace(',', '.'));
        if (!f.favorecido) { setErro('Escolha quem recebe o adiantamento'); return; }
        if (!(valor > 0)) { setErro('Informe o valor do adiantamento'); return; }
        setSalvando(true); setErro('');
        try {
            const r = await fetch('/api/reembolsos', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acionamento_id: projeto.id, natureza: 'ADIANTAMENTO', valor_adiantado: valor,
                    funcionario_id: f.favorecido.startsWith('f:') ? f.favorecido.slice(2) : null,
                    supplier_id: f.favorecido.startsWith('s:') ? f.favorecido.slice(2) : null,
                    motivo: f.motivo || null, destino: projeto.titulo,
                    forma_pagamento: f.forma_pagamento || null,
                    data_solicitacao: f.data_solicitacao || null, data_prevista: f.data_prevista || null,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Erro ao solicitar o adiantamento');
            // Acima da alçada de quem pediu, o depósito fica PENDENTE e vai para aprovação.
            if (d.aviso) alert(d.aviso);
            onCriado();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    }

    const rotulo = 'mb-1 block text-xs font-medium text-muted-foreground';
    return (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-adiant-projeto" onClick={e => e.stopPropagation()}
                className="w-full max-w-lg rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <h2 id="titulo-adiant-projeto" className="text-base font-bold">Solicitar adiantamento do projeto</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-id">{projeto.codigo}</span> · {projeto.titulo}</p>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                    {erro && <div className="sm:col-span-2"><ErrorBanner message={erro} /></div>}
                    <label className="block sm:col-span-2"><span className={rotulo}>Quem recebe</span>
                        <select className={inputClass} value={f.favorecido} onChange={e => setF({ ...f, favorecido: e.target.value })}>
                            <option value="">Escolha…</option>
                            <optgroup label="Funcionários LS">{pessoas.funcionarios.map(p => <option key={p.id} value={`f:${p.id}`}>{p.nome}</option>)}</optgroup>
                            <optgroup label="Fornecedores e prestadores">{pessoas.suppliers.map(p => <option key={p.id} value={`s:${p.id}`}>{p.nome}</option>)}</optgroup>
                        </select>
                    </label>
                    <label className="block"><span className={rotulo}>Valor do adiantamento</span>
                        <input type="number" min={0} step="0.01" className={inputClass} value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder="3000,00" /></label>
                    <label className="block"><span className={rotulo}>Forma de pagamento</span>
                        <select className={inputClass} value={f.forma_pagamento} onChange={e => setF({ ...f, forma_pagamento: e.target.value })}>
                            <option value="">A do cadastro</option><option value="PIX">PIX</option><option value="TED">Transferência bancária</option>
                            <option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option>
                        </select></label>
                    <label className="block sm:col-span-2"><span className={rotulo}>Para que é</span>
                        <input className={inputClass} value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: vistorias e combustível da semana 42" /></label>
                    <label className="block"><span className={rotulo}>Data da solicitação</span>
                        <input type="date" className={inputClass} value={f.data_solicitacao} onChange={e => setF({ ...f, data_solicitacao: e.target.value })} /></label>
                    <label className="block"><span className={rotulo}>Data prevista do depósito</span>
                        <input type="date" className={inputClass} value={f.data_prevista} onChange={e => setF({ ...f, data_prevista: e.target.value })} /></label>
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">O valor não é dividido agora: na prestação de contas, cada gasto diz para qual site do projeto foi. Se sobrar ou faltar, o acerto sai como reembolso.</p>
                </div>
                <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <GhostButton onClick={onFechar}>Cancelar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Solicitar adiantamento'}</PrimaryButton>
                </footer>
            </div>
        </div>
    );
}
