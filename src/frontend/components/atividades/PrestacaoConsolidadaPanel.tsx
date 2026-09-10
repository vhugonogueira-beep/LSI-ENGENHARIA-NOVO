import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Send, Trash2, X } from 'lucide-react';
import { fmtMoeda } from './constants';
import { GhostButton, PrimaryButton, inputClass } from './ui';

const CATEGORIAS = ['ALIMENTACAO', 'HOSPEDAGEM', 'COMBUSTIVEL', 'PEDAGIO', 'TRANSPORTE', 'MATERIAL', 'SERVICO', 'FRETE', 'OUTROS'];
const CAT_LABEL: Record<string, string> = { ALIMENTACAO: 'Alimentação', HOSPEDAGEM: 'Hospedagem', COMBUSTIVEL: 'Combustível', PEDAGIO: 'Pedágio', TRANSPORTE: 'Transporte', MATERIAL: 'Material', SERVICO: 'Serviço', FRETE: 'Frete', OUTROS: 'Outros' };
const STATUS_LABEL: Record<string, string> = { EM_PREENCHIMENTO: 'Em preenchimento', ENVIADA: 'Enviada ao financeiro', EM_ANALISE: 'Em análise', APROVADA: 'Aprovada', AJUSTES_SOLICITADOS: 'Ajustes solicitados' };
const linhaVazia = () => ({ data: '', categoria: 'ALIMENTACAO', descricao: '', valor: '', anexo_url: '' });

export default function PrestacaoConsolidadaPanel({ atividadeId, processos, onRefresh }: {
    atividadeId?: string;
    processos: any[];
    onRefresh: () => Promise<void>;
}) {
    const [prestacoes, setPrestacoes] = useState<any[]>([]);
    const [selecionando, setSelecionando] = useState(false);
    const [selecionados, setSelecionados] = useState<string[]>([]);
    const [atual, setAtual] = useState<any | null>(null);
    const [linhas, setLinhas] = useState<any[]>([]);
    const [parecer, setParecer] = useState('');
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const carregar = async () => {
        const r = await fetch(`/api/prestacoes-contas${atividadeId ? `?atividade_id=${atividadeId}` : ''}`);
        setPrestacoes(r.ok ? await r.json() : []);
    };
    useEffect(() => { carregar(); }, [atividadeId]);

    const elegiveis = useMemo(() => processos.flatMap(processo =>
        processo.natureza === 'ADIANTAMENTO'
            ? (processo.pagamentos || []).filter((p: any) =>
                ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status) && !(p.prestacoes || []).length)
                .map((pagamento: any) => ({ processo, pagamento }))
            : []), [processos]);

    const abrir = (p: any) => {
        setAtual(p);
        setLinhas((p.despesas || []).length
            ? p.despesas.map((d: any) => ({ ...d, data: d.data ? String(d.data).slice(0, 10) : '', valor: String(d.valor) }))
            : [linhaVazia()]);
        setParecer(p.parecer_financeiro || ''); setErro('');
    };
    const total = linhas.reduce((s, l) => s + (Number(String(l.valor).replace(',', '.')) || 0), 0);
    const despesasPayload = () => linhas.filter(l => l.descricao || Number(l.valor)).map(l => ({
        data: l.data || null, categoria: l.categoria, descricao: l.descricao,
        valor: Number(String(l.valor).replace(',', '.')), anexo_url: l.anexo_url || null,
    }));

    const criar = async () => {
        if (!selecionados.length) { setErro('Selecione ao menos um depósito pago'); return; }
        setSalvando(true); setErro('');
        try {
            const r = await fetch('/api/prestacoes-contas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagamento_ids: selecionados }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro ao criar prestação consolidada');
            setSelecionando(false); setSelecionados([]); await carregar(); await onRefresh(); abrir(d);
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    };
    const salvar = async () => {
        if (!atual) return; setSalvando(true); setErro('');
        try {
            const r = await fetch(`/api/prestacoes-contas/${atual.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ despesas: despesasPayload() }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro ao salvar'); setAtual(d); await carregar();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    };
    const enviar = async () => {
        if (!atual) return; await salvar(); setSalvando(true);
        try {
            const r = await fetch(`/api/prestacoes-contas/${atual.id}/enviar`, { method: 'POST' });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro ao enviar'); setAtual(d); await carregar();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    };
    const analisar = async (status: string) => {
        if (!atual) return; setSalvando(true);
        try {
            const r = await fetch(`/api/prestacoes-contas/${atual.id}/analisar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, parecer_financeiro: parecer }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro ao analisar'); setAtual(d); await carregar();
        } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
    };

    return <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
            <div><h4 className="text-sm font-bold">Prestações de contas consolidadas</h4><p className="text-[11px] text-muted-foreground">Selecione um ou vários depósitos pagos do mesmo favorecido.</p></div>
            <PrimaryButton onClick={() => { setSelecionando(true); setSelecionados([]); setErro(''); }} disabled={!elegiveis.length}><Plus size={13} className="inline mr-1"/>Nova prestação consolidada</PrimaryButton>
        </div>
        {!prestacoes.length ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nenhuma prestação consolidada criada.</div> : <div className="flex flex-col gap-2">{prestacoes.map(p => {
            const diferenca = Number(p.valor_adiantado || 0) - Number(p.valor_despesas || 0);
            return <button key={p.id} onClick={() => abrir(p)} className="w-full rounded-lg border border-border bg-secondary/20 p-3 text-left hover:bg-secondary/35">
                <div className="flex items-center justify-between gap-3"><div><strong className="text-sm">{p.favorecido_nome}</strong><div className="text-[11px] text-muted-foreground mt-0.5">{p.pagamentos.length} depósito(s) · Adiantado {fmtMoeda(p.valor_adiantado)} · Despesas {fmtMoeda(p.valor_despesas)}</div></div><div className="text-right"><span className="text-[10px] font-bold text-sky-400">{STATUS_LABEL[p.status] || p.status}</span><div className={`text-[11px] mt-1 ${diferenca === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{diferenca > 0 ? 'A devolver' : diferenca < 0 ? 'A reembolsar' : 'Equilibrada'} {fmtMoeda(Math.abs(diferenca))}</div></div></div>
            </button>;
        })}</div>}

        {selecionando && <div className="fixed inset-0 z-[2250] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-2xl p-5"><div className="flex justify-between mb-4"><div><h2 className="font-bold">Selecionar depósitos</h2><p className="text-xs text-muted-foreground mt-1">Somente depósitos pagos e ainda não prestados aparecem aqui.</p></div><button onClick={() => setSelecionando(false)}><X/></button></div>{erro && <div className="mb-3 rounded bg-red-500/10 p-2 text-sm text-red-400">{erro}</div>}<div className="max-h-[55vh] overflow-auto flex flex-col gap-2">{elegiveis.map(({ processo, pagamento }) => <label key={pagamento.id} className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-secondary/30"><input type="checkbox" checked={selecionados.includes(pagamento.id)} onChange={e => setSelecionados(s => e.target.checked ? [...s, pagamento.id] : s.filter(id => id !== pagamento.id))}/><div className="flex-1"><strong className="text-sm">{processo.favorecido_nome} · Depósito {pagamento.numero}</strong><div className="text-[11px] text-muted-foreground">{processo.atividade?.codigo || ''} · {processo.destino || processo.motivo || 'Adiantamento'}</div></div><strong>{fmtMoeda(pagamento.valor)}</strong></label>)}</div><div className="flex justify-end gap-2 mt-5"><GhostButton onClick={() => setSelecionando(false)}>Cancelar</GhostButton><PrimaryButton onClick={criar} disabled={salvando || !selecionados.length}>Criar com {selecionados.length} depósito(s)</PrimaryButton></div></div></div>}

        {atual && <div className="fixed inset-0 z-[2260] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[92vh] overflow-auto p-5"><div className="flex justify-between"><div><h2 className="font-bold text-lg">Prestação consolidada</h2><p className="text-xs text-muted-foreground">{atual.favorecido_nome} · {atual.pagamentos.length} depósito(s) · {STATUS_LABEL[atual.status] || atual.status}</p></div><button onClick={() => setAtual(null)}><X/></button></div>{erro && <div className="my-3 rounded bg-red-500/10 p-2 text-sm text-red-400">{erro}</div>}
            <div className="grid grid-cols-3 gap-3 my-4"><Resumo label="Total adiantado" valor={fmtMoeda(atual.valor_adiantado)}/><Resumo label="Despesas lançadas" valor={fmtMoeda(total)}/><Resumo label={atual.valor_adiantado - total > 0 ? 'A devolver' : atual.valor_adiantado - total < 0 ? 'A reembolsar' : 'Equilibrada'} valor={fmtMoeda(Math.abs(atual.valor_adiantado - total))} cor={atual.valor_adiantado - total === 0 ? 'text-emerald-400' : 'text-amber-400'}/></div>
            <div className="mb-4 flex flex-wrap gap-2">{atual.pagamentos.map((v: any) => <span key={v.id} className="rounded bg-secondary/50 px-2 py-1 text-[10px]">{v.pagamento.reembolso.atividade?.codigo || 'Atividade'} · Depósito {v.pagamento.numero} · {fmtMoeda(v.pagamento.valor)}</span>)}</div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-2">Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Comprovante/link</th><th></th></tr></thead><tbody>{linhas.map((l, i) => <tr key={i} className="border-t border-border"><td className="p-1"><input type="date" className={inputClass} value={l.data} onChange={e => setLinhas(x => x.map((v, j) => j === i ? { ...v, data: e.target.value } : v))}/></td><td className="p-1"><select className={inputClass} value={l.categoria} onChange={e => setLinhas(x => x.map((v, j) => j === i ? { ...v, categoria: e.target.value } : v))}>{CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></td><td className="p-1"><input className={inputClass} value={l.descricao} onChange={e => setLinhas(x => x.map((v, j) => j === i ? { ...v, descricao: e.target.value } : v))}/></td><td className="p-1"><input type="number" step="0.01" className={`${inputClass} w-28`} value={l.valor} onChange={e => setLinhas(x => x.map((v, j) => j === i ? { ...v, valor: e.target.value } : v))}/></td><td className="p-1"><input className={inputClass} value={l.anexo_url || ''} placeholder="URL ou referência" onChange={e => setLinhas(x => x.map((v, j) => j === i ? { ...v, anexo_url: e.target.value } : v))}/></td><td><button className="p-2 text-red-400" onClick={() => setLinhas(x => x.filter((_, j) => j !== i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
            <button className="mt-2 text-xs text-primary" onClick={() => setLinhas(x => [...x, linhaVazia()])}><Plus size={13} className="inline"/> Adicionar despesa</button>
            <div className="flex justify-end gap-2 mt-5"><GhostButton onClick={salvar} disabled={salvando || atual.status === 'APROVADA'}>Salvar rascunho</GhostButton><PrimaryButton onClick={enviar} disabled={salvando || total <= 0 || atual.status === 'APROVADA'}><Send size={13} className="inline mr-1"/>Enviar ao financeiro</PrimaryButton></div>
            {['ENVIADA', 'EM_ANALISE', 'AJUSTES_SOLICITADOS'].includes(atual.status) && <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><h3 className="text-sm font-semibold mb-2">Análise financeira</h3><textarea className={inputClass} value={parecer} onChange={e => setParecer(e.target.value)} placeholder="Parecer ou ajustes solicitados"/><div className="flex justify-end gap-2 mt-2"><GhostButton onClick={() => analisar('AJUSTES_SOLICITADOS')}>Solicitar ajustes</GhostButton><PrimaryButton onClick={() => analisar('APROVADA')}><CheckCircle2 size={13} className="inline mr-1"/>Aprovar</PrimaryButton></div></div>}
        </div></div>}
    </div>;
}

function Resumo({ label, valor, cor = 'text-foreground' }: { label: string; valor: string; cor?: string }) {
    return <div className="rounded-lg bg-secondary/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><strong className={cor}>{valor}</strong></div>;
}
