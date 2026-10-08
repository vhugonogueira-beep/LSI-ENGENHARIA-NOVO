import { useEffect, useMemo, useState } from 'react';
import { Folder, Search, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import PageHeader from '../components/PageHeader';
import { FiltroPainel, FiltroLinha, CAMPO, ALTERNADOR, SEGMENTO } from '../components/FiltroPainel';
import { TIPO_ORCAMENTO_LABEL, TIPOS_DEMANDA_LABEL, fmtMoeda, fmtData } from '../components/atividades/constants';
import { CHIP, type Tom } from '../lib/cores';

// ─────────────────────────────────────────────────────────────────────────────
// Orçamentos — todos os orçamentos das atividades num lugar só (08/10/2026).
// Substitui a antiga "Orçamentos salvos", que lia o armazenamento do navegador
// do fluxo antigo e não enxergava os orçamentos reais. O orçamento continua
// nascendo e sendo editado dentro da atividade; aqui é a vista de conjunto.
// ─────────────────────────────────────────────────────────────────────────────

interface Orcamento {
    id: string;
    assunto: string | null;
    status: string;
    tipo_orcamento: string;
    versao_atual: number;
    updated_at: string;
    total_cliente: number;
    itens_cliente: number;
    atividade: { id: string; codigo: string; titulo: string; id_site_sharing: string | null; sharing: string; tipo_demanda: string } | null;
}

const STATUS: { id: string; rotulo: string; tom: Tom }[] = [
    { id: 'RASCUNHO', rotulo: 'Rascunho', tom: 'slate' },
    { id: 'ENVIADO', rotulo: 'Enviado', tom: 'blue' },
    { id: 'REVISAO', rotulo: 'Em revisão', tom: 'amber' },
    { id: 'APROVADO', rotulo: 'Aprovado', tom: 'green' },
    { id: 'REPROVADO', rotulo: 'Reprovado', tom: 'rose' },
];
const STATUS_INFO = Object.fromEntries(STATUS.map(s => [s.id, s]));
const sem = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Orcamentos({ onAbrirAtividade }: { onAbrirAtividade: (atividadeId: string) => void }) {
    const [lista, setLista] = useState<Orcamento[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        authFetch('/api/budgets')
            .then(async r => { const c = await r.json(); if (!r.ok) throw new Error(c.error || 'Erro ao carregar os orçamentos'); setLista(c); })
            .catch(e => setErro(e.message))
            .finally(() => setCarregando(false));
    }, []);

    const visiveis = useMemo(() => {
        const t = sem(busca.trim());
        return lista.filter(o => {
            if (status && o.status !== status) return false;
            if (!t) return true;
            return [o.assunto, o.atividade?.codigo, o.atividade?.titulo, o.atividade?.id_site_sharing, o.atividade?.sharing]
                .some(c => sem(String(c || '')).includes(t));
        });
    }, [lista, busca, status]);
    const contagem = (id: string) => lista.filter(o => o.status === id).length;

    return (
        <main className="p-8 text-foreground">
            <PageHeader icone={Folder} tom="amber" titulo="Orçamentos"
                descricao="Todos os orçamentos das atividades. Cada um é montado e editado dentro da sua atividade." />

            {erro && <div className="mb-4 rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">{erro}</div>}

            <FiltroPainel>
                <FiltroLinha rotulo="Buscar">
                    <div className="relative">
                        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input className={`${CAMPO} w-full pl-9 pr-8`} aria-label="Buscar orçamentos" value={busca} onChange={e => setBusca(e.target.value)}
                            placeholder="Assunto, código da atividade, site ou detentora" />
                        {busca && <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} aria-hidden /></button>}
                    </div>
                </FiltroLinha>
                <FiltroLinha rotulo="Status">
                    <div className={ALTERNADOR} role="group" aria-label="Status do orçamento">
                        {[{ id: '', rotulo: 'Todos' }, ...STATUS].map(s => (
                            <button key={s.id} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}
                                className={`${SEGMENTO} ${status === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                {s.rotulo}{s.id && <span className="tabular-nums opacity-70">{contagem(s.id) || ''}</span>}
                            </button>
                        ))}
                    </div>
                </FiltroLinha>
            </FiltroPainel>

            <div className="mb-2 px-1 text-xs text-muted-foreground">
                <strong className="font-semibold tabular-nums text-foreground">{visiveis.length}</strong> de {lista.length} orçamento(s)
            </div>

            {carregando ? (
                <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando orçamentos…</p>
            ) : visiveis.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {lista.length === 0 ? 'Nenhum orçamento ainda. Abra uma atividade e crie o orçamento na aba de orçamento dela.' : 'Nenhum orçamento corresponde à busca.'}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[980px] table-fixed text-sm">
                        <colgroup><col className="w-[26%]" /><col /><col className="w-36" /><col className="w-32" /><col className="w-20" /><col className="w-36" /><col className="w-28" /><col className="w-24" /></colgroup>
                        <thead>
                            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-3">Atividade</th><th className="px-4 py-3">Assunto</th><th className="px-4 py-3">Modelo</th>
                                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Versão</th><th className="px-4 py-3 text-right">Total ao cliente</th>
                                <th className="px-4 py-3">Atualizado</th><th className="px-4 py-3" aria-label="Ações" />
                            </tr>
                        </thead>
                        <tbody>
                            {visiveis.map(o => {
                                const st = STATUS_INFO[o.status];
                                return (
                                    <tr key={o.id} className="border-b border-border/60 align-top last:border-b-0 hover:bg-secondary/30">
                                        <td className="px-4 py-3">
                                            {o.atividade ? (
                                                <>
                                                    <div className="flex h-7 items-center gap-2">
                                                        <span className="font-id font-semibold">{o.atividade.id_site_sharing || o.atividade.codigo}</span>
                                                        <span className="text-xs text-muted-foreground">{o.atividade.codigo}</span>
                                                    </div>
                                                    <div className="truncate text-xs text-muted-foreground">{o.atividade.sharing} · {TIPOS_DEMANDA_LABEL[o.atividade.tipo_demanda] || o.atividade.tipo_demanda}</div>
                                                </>
                                            ) : <div className="flex h-7 items-center text-xs text-warn">Sem atividade (fluxo antigo)</div>}
                                        </td>
                                        <td className="px-4 py-3"><div className="flex min-h-7 items-center truncate" title={o.assunto || ''}>{o.assunto || '—'}</div></td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center">{TIPO_ORCAMENTO_LABEL[o.tipo_orcamento] || o.tipo_orcamento}</div></td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center">
                                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[st?.tom || 'slate']}`}>{st?.rotulo || o.status}</span>
                                        </div></td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center justify-end tabular-nums">v{o.versao_atual}</div></td>
                                        <td className="px-4 py-3">
                                            <div className={`flex h-7 items-center justify-end tabular-nums ${o.total_cliente ? 'font-semibold' : 'text-muted-foreground'}`}>
                                                {o.total_cliente ? fmtMoeda(o.total_cliente) : 'Sem itens'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center text-muted-foreground">{fmtData(o.updated_at)}</div></td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center justify-end">
                                            {o.atividade && <button onClick={() => onAbrirAtividade(o.atividade!.id)} className="h-7 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">Abrir</button>}
                                        </div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}
