import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, History, MapPin, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { useEhAdmin, usePermissao } from '../lib/permissoes';
import MunicipioInput from '../components/cadastros/MunicipioInput';
import PageHeader from '../components/PageHeader';
import { FiltroPainel, FiltroLinha, GradeSeletores, CAMPO } from '../components/FiltroPainel';
import { UFS, normalizarUf, SHARINGS, OPERADORAS, TIPOS_SITE, TECNOLOGIAS, STATUS_OPERACIONAL, TIPOS_DEMANDA_LABEL } from '../components/atividades/constants';
import { CHIP, FAIXA, TOM_MODULO, TOM_OPERADORA, TOM_SHARING, TOM_STATUS, tomDe } from '../lib/cores';

// ─────────────────────────────────────────────────────────────────────────────
// Sites — cadastro único (decisão de 03/10/2026).
//
// Um site é a DETENTORA + o ID dele nela. A detentora pode ser sharing ou a
// operadora dona da torre. Os IDs das operadoras que usam o site ficam na
// ficha (mais de um por operadora: o ID muda com a tecnologia). Quando a torre
// muda de dono, o ID antigo continua achando o site.
// ─────────────────────────────────────────────────────────────────────────────

interface IdOperadora { id: string; operadora: string; id_site: string; tecnologia: string | null }
interface IdAnterior { id: string; detentora: string; id_site_detentora: string; substituido_em: string }
interface Site {
    id: string;
    detentora: string | null;
    id_site_detentora: string | null;
    id_site: string;
    tipo_site: string | null;
    endereco: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    uf: string | null;
    latitude: number | null;
    longitude: number | null;
    proprietario_nome: string | null;
    proprietario_telefone: string | null;
    proprietario_email: string | null;
    proprietario_observacao: string | null;
    observacoes: string | null;
    operadoras: IdOperadora[];
    idsAnteriores: IdAnterior[];
    _count?: { atividades: number };
    atividades?: { id: string; codigo: string; titulo: string; tipo_demanda: string; operadora: string | null; id_site_operadora: string | null; status_operacional: string; data_abertura: string }[];
}

const FORM_VAZIO = {
    detentora: 'HIGHLINE', id_site_detentora: '', tipo_site: '', endereco: '', bairro: '', cep: '', uf: '', cidade: '',
    coordenadas: '', proprietario_nome: '', proprietario_telefone: '', proprietario_email: '', proprietario_observacao: '', observacoes: '',
};
type Form = typeof FORM_VAZIO;

const formDoSite = (s: Site): Form => ({
    detentora: s.detentora || '', id_site_detentora: s.id_site_detentora || s.id_site || '', tipo_site: s.tipo_site || '',
    endereco: s.endereco || '', bairro: s.bairro || '', cep: s.cep || '', uf: s.uf || '', cidade: s.cidade || '',
    coordenadas: s.latitude != null && s.longitude != null ? `${s.latitude}, ${s.longitude}` : '',
    proprietario_nome: s.proprietario_nome || '', proprietario_telefone: s.proprietario_telefone || '',
    proprietario_email: s.proprietario_email || '', proprietario_observacao: s.proprietario_observacao || '',
    observacoes: s.observacoes || '',
});

const campo = 'h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30';
const sem = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Sites() {
    const [sites, setSites] = useState<Site[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [filtros, setFiltros] = useState({ detentora: '', operadora: '', uf: '', tipo: '' });
    const [aberto, setAberto] = useState<string | 'novo' | null>(null);
    const podeEditar = usePermissao('atividades.gerenciar');

    async function carregar() {
        const r = await authFetch('/api/sites');
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.error || 'Erro ao carregar sites');
        setSites(corpo);
    }
    useEffect(() => { carregar().catch(e => setErro(e.message)).finally(() => setCarregando(false)); }, []);

    // Busca por qualquer ID do site — detentora, anterior ou de operadora —
    // além de endereço e município: é por eles que o site é procurado.
    const visiveis = useMemo(() => {
        const termo = sem(busca.trim()).replace(/\s+/g, '');
        return sites.filter(s => {
            if (filtros.detentora && s.detentora !== filtros.detentora) return false;
            if (filtros.operadora && !s.operadoras.some(o => o.operadora === filtros.operadora)) return false;
            if (filtros.uf && s.uf !== filtros.uf) return false;
            if (filtros.tipo && s.tipo_site !== filtros.tipo) return false;
            if (!termo) return true;
            const ids = [s.id_site_detentora, s.id_site, ...s.operadoras.map(o => o.id_site), ...s.idsAnteriores.map(a => a.id_site_detentora)];
            const textos = [s.endereco, s.cidade, s.bairro];
            return ids.some(i => sem(String(i || '')).includes(termo))
                || textos.some(t => sem(String(t || '')).replace(/\s+/g, '').includes(termo));
        });
    }, [sites, busca, filtros]);

    const filtrando = Boolean(busca || filtros.detentora || filtros.operadora || filtros.uf || filtros.tipo);
    const ufsComSite = useMemo(() => [...new Set(sites.map(s => s.uf).filter(Boolean) as string[])].sort(), [sites]);

    return (
        <main className="p-8 text-foreground">
            <PageHeader icone={MapPin} tom={TOM_MODULO.sites} titulo="Sites"
                descricao="Cadastro único: cada site é a detentora mais o ID dele nela. Os IDs das operadoras, a localização e o contato do proprietário ficam na ficha."
                acoes={podeEditar && (
                    <button onClick={() => setAberto('novo')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                        <Plus size={16} aria-hidden /> Novo site
                    </button>
                )} />

            {erro && <div className="mb-4 rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">{erro}</div>}

            <FiltroPainel>
                <FiltroLinha rotulo="Buscar">
                    <div className="relative">
                        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input className={`${CAMPO} w-full pl-9 pr-8`} aria-label="Buscar sites" value={busca} onChange={e => setBusca(e.target.value)}
                            placeholder="ID da detentora ou da operadora, endereço ou município" />
                        {busca && (
                            <button onClick={() => setBusca('')} aria-label="Limpar busca" title="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X size={14} aria-hidden />
                            </button>
                        )}
                    </div>
                </FiltroLinha>
                <FiltroLinha rotulo="Filtros">
                    <GradeSeletores>
                        <select className={`${CAMPO} w-full`} aria-label="Detentora" value={filtros.detentora} onChange={e => setFiltros(f => ({ ...f, detentora: e.target.value }))}>
                            <option value="">Toda detentora</option>
                            {SHARINGS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select className={`${CAMPO} w-full`} aria-label="Operadora" value={filtros.operadora} onChange={e => setFiltros(f => ({ ...f, operadora: e.target.value }))}>
                            <option value="">Toda operadora</option>
                            {OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <select className={`${CAMPO} w-full`} aria-label="UF" value={filtros.uf} onChange={e => setFiltros(f => ({ ...f, uf: e.target.value }))}>
                            <option value="">Toda UF</option>
                            {ufsComSite.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                        <select className={`${CAMPO} w-full`} aria-label="Tipo de site" value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
                            <option value="">Todo tipo de site</option>
                            {TIPOS_SITE.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </GradeSeletores>
                </FiltroLinha>
            </FiltroPainel>

            <div className="mb-2 flex items-center gap-3 px-1 text-xs text-muted-foreground">
                <span><strong className="font-semibold tabular-nums text-foreground">{visiveis.length}</strong> de {sites.length} site(s)</span>
                {filtrando && (
                    <button className="font-semibold text-primary hover:underline" onClick={() => { setBusca(''); setFiltros({ detentora: '', operadora: '', uf: '', tipo: '' }); }}>
                        Limpar filtros
                    </button>
                )}
            </div>

            {carregando ? (
                <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando sites…</p>
            ) : visiveis.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {sites.length === 0 ? 'Nenhum site cadastrado. Eles também nascem sozinhos ao abrir uma atividade.' : 'Nenhum site corresponde à busca.'}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[960px] table-fixed text-sm">
                        <colgroup>
                            <col className="w-[22%]" /><col /><col className="w-32" /><col className="w-[18%]" /><col className="w-28" /><col className="w-28" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                                <th className="px-4 py-3">Site (detentora)</th>
                                <th className="px-4 py-3">IDs nas operadoras</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Município</th>
                                <th className="px-4 py-3 text-right">Atividades</th>
                                <th className="px-4 py-3" aria-label="Ações" />
                            </tr>
                        </thead>
                        <tbody>
                            {visiveis.map(s => {
                                const tom = tomDe(TOM_SHARING, s.detentora);
                                return (
                                    <tr key={s.id} onClick={() => setAberto(s.id)} className={`cursor-pointer border-b border-l-4 border-b-border/60 ${FAIXA[tom]} align-top last:border-b-0 hover:bg-secondary/40`}>
                                        <td className="px-4 py-3">
                                            <div className="flex h-7 items-center gap-2">
                                                {s.detentora
                                                    ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[tom]}`}>{s.detentora}</span>
                                                    : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP.amber}`}>Sem detentora</span>}
                                                <span className="truncate font-id text-base font-semibold" title={s.id_site_detentora || s.id_site}>{s.id_site_detentora || s.id_site}</span>
                                            </div>
                                            {s.idsAnteriores.length > 0 && (
                                                <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={s.idsAnteriores.map(a => `${a.detentora} ${a.id_site_detentora}`).join(', ')}>
                                                    <History size={12} aria-hidden /> antes {s.idsAnteriores[0].detentora} {s.idsAnteriores[0].id_site_detentora}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                                                {s.operadoras.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                                                {s.operadoras.map(o => (
                                                    <span key={o.id} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${CHIP[tomDe(TOM_OPERADORA, o.operadora)]}`}>
                                                        <span className="font-semibold">{o.operadora}</span>
                                                        <span className="font-id">{o.id_site}</span>
                                                        {o.tecnologia && <span className="opacity-70">{o.tecnologia}</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center">{s.tipo_site || <span className="text-muted-foreground">—</span>}</div></td>
                                        <td className="px-4 py-3">
                                            <div className="flex h-7 items-center truncate">{s.cidade ? `${s.cidade} / ${s.uf}` : (s.uf || <span className="text-muted-foreground">—</span>)}</div>
                                            {s.endereco && <div className="truncate text-xs text-muted-foreground" title={s.endereco}>{s.endereco}</div>}
                                        </td>
                                        <td className="px-4 py-3"><div className="flex h-7 items-center justify-end tabular-nums">{s._count?.atividades ?? 0}</div></td>
                                        <td className="px-4 py-3">
                                            <div className="flex h-7 items-center justify-end">
                                                <button onClick={e => { e.stopPropagation(); setAberto(s.id); }} className="h-7 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">Abrir</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {aberto && (
                <FichaSite siteId={aberto === 'novo' ? null : aberto} podeEditar={podeEditar}
                    onFechar={() => setAberto(null)}
                    onSalvo={async id => { await carregar(); setAberto(id); }}
                    onExcluido={async () => { setAberto(null); await carregar(); }} />
            )}
        </main>
    );
}

function FichaSite({ siteId, podeEditar, onFechar, onSalvo, onExcluido }: {
    siteId: string | null;
    podeEditar: boolean;
    onFechar: () => void;
    onSalvo: (id: string) => void | Promise<void>;
    onExcluido: () => void | Promise<void>;
}) {
    const [site, setSite] = useState<Site | null>(null);
    const [form, setForm] = useState<Form>(FORM_VAZIO);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [novoId, setNovoId] = useState({ operadora: 'CLARO', id_site: '', tecnologia: '' });
    const ehAdmin = useEhAdmin();

    async function carregar(id: string) {
        const r = await authFetch(`/api/sites/${id}`);
        const corpo = await r.json();
        if (!r.ok) return setErro(corpo.error || 'Erro ao abrir o site');
        setSite(corpo);
        setForm(formDoSite(corpo));
    }
    useEffect(() => { if (siteId) carregar(siteId); else { setSite(null); setForm(FORM_VAZIO); } }, [siteId]);

    // Esc fecha a ficha.
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onFechar]);

    const set = (campoForm: keyof Form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [campoForm]: e.target.value }));
    // Cadastro antigo sem detentora está sendo completado, não trocado.
    const trocouChave = site && site.detentora && (form.detentora !== (site.detentora || '') || form.id_site_detentora.replace(/\s+/g, '').toUpperCase() !== (site.id_site_detentora || ''));

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro('');
        setSalvando(true);
        try {
            const r = await authFetch(site ? `/api/sites/${site.id}` : '/api/sites', {
                method: site ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const corpo = await r.json();
            if (!r.ok) throw new Error(corpo.error || 'Erro ao salvar');
            await onSalvo(corpo.id);
            await carregar(corpo.id);
        } catch (err: any) {
            setErro(err.message);
        } finally {
            setSalvando(false);
        }
    }

    async function adicionarId() {
        if (!site) return;
        setErro('');
        const r = await authFetch(`/api/sites/${site.id}/operadoras`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novoId),
        });
        if (!r.ok) return setErro((await r.json()).error || 'Erro ao gravar o ID');
        setNovoId(n => ({ ...n, id_site: '', tecnologia: '' }));
        await carregar(site.id);
        await onSalvo(site.id);
    }

    async function removerId(registro: IdOperadora) {
        if (!site || !confirm(`Remover o ID ${registro.operadora} ${registro.id_site} deste site?`)) return;
        const r = await authFetch(`/api/sites/${site.id}/operadoras/${registro.id}`, { method: 'DELETE' });
        if (!r.ok) return setErro((await r.json()).error || 'Erro ao remover');
        await carregar(site.id);
        await onSalvo(site.id);
    }

    async function excluir() {
        if (!site || !confirm(`Excluir o site ${site.detentora} ${site.id_site_detentora}? Não dá para desfazer.`)) return;
        const r = await authFetch(`/api/sites/${site.id}`, { method: 'DELETE' });
        if (!r.ok) return setErro((await r.json()).error || 'Erro ao excluir');
        await onExcluido();
    }

    const temCoordenadas = site?.latitude != null && site?.longitude != null;

    return (
        <div className="fixed inset-0 z-[9000] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onFechar}>
            <aside role="dialog" aria-modal="true" aria-label="Ficha do site" onClick={e => e.stopPropagation()}
                className="flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{site ? 'Ficha do site' : 'Novo site'}</p>
                        <h2 className="truncate font-id text-xl font-semibold">{site ? `${site.detentora || 'Sem detentora'} · ${site.id_site_detentora || site.id_site}` : 'Detentora + ID do site'}</h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {temCoordenadas && (
                            <a href={`https://www.google.com/maps?q=${site!.latitude},${site!.longitude}`} target="_blank" rel="noreferrer"
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">
                                <ExternalLink size={14} aria-hidden /> Abrir no mapa
                            </a>
                        )}
                        <button onClick={onFechar} aria-label="Fechar" title="Fechar (Esc)" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
                            <X size={18} aria-hidden />
                        </button>
                    </div>
                </header>

                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    {erro && <div className="rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">{erro}</div>}

                    <form id="form-site" onSubmit={salvar} className="space-y-5">
                        <Bloco titulo="Identificação">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Rotulo texto="Detentora *">
                                    <select className={campo} value={form.detentora} onChange={set('detentora')} disabled={!podeEditar} required>
                                        <option value="">Selecione</option>
                                        {SHARINGS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </Rotulo>
                                <Rotulo texto="ID na detentora *">
                                    <input className={`${campo} font-id uppercase`} value={form.id_site_detentora} onChange={set('id_site_detentora')} disabled={!podeEditar} required placeholder="Ex.: PAMRB008" />
                                </Rotulo>
                                <Rotulo texto="Tipo de site">
                                    <select className={campo} value={form.tipo_site} onChange={set('tipo_site')} disabled={!podeEditar}>
                                        <option value="">—</option>
                                        {TIPOS_SITE.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Rotulo>
                            </div>
                            {trocouChave && (
                                <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                                    Trocar a detentora ou o ID guarda o atual ({site!.detentora} {site!.id_site_detentora}) no histórico — a busca continua achando o site por ele. As atividades antigas mantêm o ID com que foram feitas.
                                </p>
                            )}
                        </Bloco>

                        <Bloco titulo="Localização">
                            <div className="grid gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-4"><Rotulo texto="Endereço"><input className={campo} value={form.endereco} onChange={set('endereco')} disabled={!podeEditar} /></Rotulo></div>
                                <div className="sm:col-span-2"><Rotulo texto="CEP"><input className={`${campo} font-id`} value={form.cep} onChange={set('cep')} disabled={!podeEditar} placeholder="00000-000" /></Rotulo></div>
                                <div className="sm:col-span-2"><Rotulo texto="Bairro"><input className={campo} value={form.bairro} onChange={set('bairro')} disabled={!podeEditar} /></Rotulo></div>
                                <div className="sm:col-span-1">
                                    <Rotulo texto="UF *">
                                        <select className={campo} value={normalizarUf(form.uf) || ''} disabled={!podeEditar} required
                                            onChange={e => setForm(f => ({ ...f, uf: e.target.value, cidade: e.target.value === f.uf ? f.cidade : '' }))}>
                                            <option value="">—</option>
                                            {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
                                        </select>
                                    </Rotulo>
                                </div>
                                <div className="sm:col-span-3">
                                    <Rotulo texto="Município *">
                                        <MunicipioInput uf={normalizarUf(form.uf)} value={form.cidade} className={campo} onChange={nome => setForm(f => ({ ...f, cidade: nome }))} />
                                    </Rotulo>
                                </div>
                                <div className="sm:col-span-6">
                                    <Rotulo texto="Coordenadas">
                                        <input className={`${campo} font-id`} value={form.coordenadas} onChange={set('coordenadas')} disabled={!podeEditar}
                                            placeholder={`-23.5505, -46.6333  ou  23°33'01"S 46°38'02"O`} />
                                    </Rotulo>
                                    <p className="mt-1 text-xs text-muted-foreground">Aceita decimal ou graus, minutos e segundos; o sistema guarda em decimal.</p>
                                </div>
                            </div>
                        </Bloco>

                        <Bloco titulo="Contato do proprietário">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Rotulo texto="Nome"><input className={campo} value={form.proprietario_nome} onChange={set('proprietario_nome')} disabled={!podeEditar} /></Rotulo>
                                <Rotulo texto="Telefone"><input className={campo} value={form.proprietario_telefone} onChange={set('proprietario_telefone')} disabled={!podeEditar} /></Rotulo>
                                <Rotulo texto="E-mail"><input type="email" className={campo} value={form.proprietario_email} onChange={set('proprietario_email')} disabled={!podeEditar} /></Rotulo>
                                <div className="sm:col-span-3"><Rotulo texto="Observação"><input className={campo} value={form.proprietario_observacao} onChange={set('proprietario_observacao')} disabled={!podeEditar} placeholder="Ex.: síndico atende das 8h às 17h" /></Rotulo></div>
                            </div>
                        </Bloco>

                        <Bloco titulo="Comentários">
                            <textarea rows={3} className={`${campo} h-auto py-2`} value={form.observacoes} onChange={set('observacoes')} disabled={!podeEditar}
                                placeholder="Acesso, chave, horários, restrições, o que a equipe precisa saber antes de ir" />
                        </Bloco>
                    </form>

                    {site && (
                        <Bloco titulo="IDs nas operadoras">
                            <p className="mb-3 text-xs text-muted-foreground">Uma operadora pode ter mais de um ID aqui — o ID muda com a tecnologia. Ao abrir uma atividade, o ID dela entra sozinho.</p>
                            <div className="mb-3 flex flex-wrap gap-2">
                                {site.operadoras.length === 0 && <span className="text-sm text-muted-foreground">Nenhum ID de operadora ainda.</span>}
                                {site.operadoras.map(o => (
                                    <span key={o.id} className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm ${CHIP[tomDe(TOM_OPERADORA, o.operadora)]}`}>
                                        <span className="font-semibold">{o.operadora}</span>
                                        <span className="font-id">{o.id_site}</span>
                                        {o.tecnologia && <span className="text-xs opacity-75">{o.tecnologia}</span>}
                                        {podeEditar && (
                                            <button onClick={() => removerId(o)} aria-label={`Remover ${o.operadora} ${o.id_site}`} title="Remover" className="opacity-70 hover:opacity-100"><X size={14} aria-hidden /></button>
                                        )}
                                    </span>
                                ))}
                            </div>
                            {podeEditar && (
                                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_120px_auto]">
                                    <select className={campo} aria-label="Operadora" value={novoId.operadora} onChange={e => setNovoId(n => ({ ...n, operadora: e.target.value }))}>
                                        {OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <input className={`${campo} font-id uppercase`} aria-label="ID na operadora" placeholder="ID na operadora" value={novoId.id_site}
                                        onChange={e => setNovoId(n => ({ ...n, id_site: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (novoId.id_site.trim()) adicionarId(); } }} />
                                    <select className={campo} aria-label="Tecnologia" value={novoId.tecnologia} onChange={e => setNovoId(n => ({ ...n, tecnologia: e.target.value }))}>
                                        <option value="">Tecnologia</option>
                                        {TECNOLOGIAS.map(t => <option key={t} value={t}>{t === 'OUTRA' ? 'Outra' : t}</option>)}
                                    </select>
                                    <button onClick={adicionarId} disabled={!novoId.id_site.trim()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60 disabled:opacity-50">
                                        <Plus size={14} aria-hidden /> Adicionar
                                    </button>
                                </div>
                            )}
                        </Bloco>
                    )}

                    {site && site.idsAnteriores.length > 0 && (
                        <Bloco titulo="Detentoras anteriores">
                            <ul className="space-y-1 text-sm">
                                {site.idsAnteriores.map(a => (
                                    <li key={a.id} className="flex items-center gap-3">
                                        <span className="font-semibold">{a.detentora}</span>
                                        <span className="font-id">{a.id_site_detentora}</span>
                                        <span className="text-xs text-muted-foreground">até {new Date(a.substituido_em).toLocaleDateString('pt-BR')}</span>
                                    </li>
                                ))}
                            </ul>
                        </Bloco>
                    )}

                    {site && (
                        <Bloco titulo={`Atividades neste site (${site.atividades?.length || 0})`}>
                            {!site.atividades?.length ? (
                                <p className="text-sm text-muted-foreground">Nenhuma atividade ainda.</p>
                            ) : (
                                <ul className="divide-y divide-border/60 rounded-lg border border-border">
                                    {site.atividades.map(a => {
                                        const st = STATUS_OPERACIONAL[a.status_operacional];
                                        return (
                                            <li key={a.id} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
                                                <span className="font-id text-xs text-muted-foreground">{a.codigo}</span>
                                                <span className="min-w-0">
                                                    <span className="block truncate" title={a.titulo}>{a.titulo}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {TIPOS_DEMANDA_LABEL[a.tipo_demanda] || a.tipo_demanda}
                                                        {a.operadora && ` · ${a.operadora}`}{a.id_site_operadora && ` ${a.id_site_operadora}`}
                                                        {` · ${new Date(a.data_abertura).toLocaleDateString('pt-BR')}`}
                                                    </span>
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[tomDe(TOM_STATUS, a.status_operacional)]}`}>{st?.label || a.status_operacional}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Bloco>
                    )}
                </div>

                {podeEditar && (
                    <footer className="flex items-center gap-2 border-t border-border px-6 py-3">
                        {site && ehAdmin && (
                            <button onClick={excluir} disabled={(site.atividades?.length || 0) > 0}
                                title={(site.atividades?.length || 0) > 0 ? 'Site com atividade não pode ser excluído' : 'Excluir site'}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-crit/40 px-3 text-sm font-semibold text-crit hover:bg-crit/10 disabled:cursor-not-allowed disabled:opacity-40">
                                <Trash2 size={14} aria-hidden /> Excluir
                            </button>
                        )}
                        <button type="button" onClick={onFechar} className="ml-auto h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary/60">Fechar</button>
                        <button type="submit" form="form-site" disabled={salvando} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                            <Save size={14} aria-hidden /> {salvando ? 'Salvando…' : site ? 'Salvar alterações' : 'Cadastrar site'}
                        </button>
                    </footer>
                )}
            </aside>
        </div>
    );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h3>
            {children}
        </section>
    );
}

function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{texto}</span>
            {children}
        </label>
    );
}
