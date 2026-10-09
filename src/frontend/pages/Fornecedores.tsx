import { useState, useEffect, useMemo } from 'react';
import { Building2, CreditCard, Factory, HardHat, Mail, MapPin, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import SegurancaTrabalhoModal, { SeloSst } from '../components/cadastros/SegurancaTrabalhoModal';
import FornecedorFormModal, { CATEGORIA_INFO, type Supplier } from '../components/cadastros/FornecedorFormModal';
import { useEhAdmin } from '../lib/permissoes';
import { REGIAO_LABEL, chaveTexto, normalizarUf } from '../components/atividades/constants';
import { CHIP, FAIXA, SOLIDO, TEXTO, TOM_MODULO, TOM_RAMO, VEU, tomDe } from '../lib/cores';
import PageHeader from '../components/PageHeader';
import { FiltroPainel, FiltroLinha, GradeSeletores, CAMPO, ALTERNADOR, SEGMENTO } from '../components/FiltroPainel';


export function Fornecedores() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filtroModulo, setFiltroModulo] = useState<'TODOS' | 'MATERIAL' | 'PRESTADOR'>('TODOS');
    // Ramo de atividade = categoria (lista fechada) + especialidade (tag livre).
    const [filtroCategoria, setFiltroCategoria] = useState('');
    const [filtroEspecialidade, setFiltroEspecialidade] = useState('');
    const [filtroUf, setFiltroUf] = useState('');
    const ehAdmin = useEhAdmin(); // desativar cadastro é só do administrador
    // undefined = janela fechada; null = novo cadastro; objeto = editar
    const [editando, setEditando] = useState<Supplier | null | undefined>(undefined);
    // Segurança do trabalho: selo por fornecedor e janela de documentos/equipe.
    const [sst, setSst] = useState<Record<string, any>>({});
    const [sstAberto, setSstAberto] = useState<Supplier | null>(null);
    const [filtroSst, setFiltroSst] = useState('');
    const carregarSst = () => fetch('/api/sst/resumo').then(r => (r.ok ? r.json() : {})).then(setSst).catch(() => setSst({}));

    const loadSuppliers = async () => {
        setLoading(true);
        try {
            const resp = await fetch('/api/suppliers?limit=200');
            const data = await resp.json();
            const items: Supplier[] = data.items || [];
            const withCounts = await Promise.all(items.map(async (s) => {
                const r = await fetch(`/api/suppliers/${s.id}/condicoes-pagamento`);
                const cond = r.ok ? await r.json() : [];
                return { ...s, _condicoesCount: cond.length };
            }));
            setSuppliers(withCounts);
        } catch (e) {
            console.error(e);
            setSuppliers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSuppliers(); carregarSst(); }, []);

    const openCreate = () => setEditando(null);
    const openEdit = (sup: Supplier) => setEditando(sup);

    const handleDelete = async (id: string, nome: string) => {
        if (!confirm(`Deseja desativar o fornecedor "${nome}"?`)) return;
        await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
        loadSuppliers();
    };

    const noModulo = (s: Supplier) => filtroModulo === 'TODOS' || (filtroModulo === 'MATERIAL' ? s.categoria === 'MATERIAL' : s.categoria !== 'MATERIAL');
    const ufDe = (s: Supplier) => normalizarUf(s.uf);

    // Especialidade é texto livre: "Elétrica" e "eletrica" são o mesmo ramo.
    // Agrupa pela chave sem acento e mostra a grafia mais usada.
    const especialidades = useMemo(() => {
        const grupos = new Map<string, { total: number; grafias: Map<string, number> }>();
        for (const s of suppliers) {
            const esp = s.especialidade?.trim();
            if (!esp || !noModulo(s) || (filtroCategoria && (s.categoria || 'OUTROS') !== filtroCategoria)) continue;
            const g = grupos.get(chaveTexto(esp)) || { total: 0, grafias: new Map<string, number>() };
            g.total += 1;
            g.grafias.set(esp, (g.grafias.get(esp) || 0) + 1);
            grupos.set(chaveTexto(esp), g);
        }
        return [...grupos.entries()]
            .map(([chave, g]) => ({ chave, total: g.total, rotulo: [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    }, [suppliers, filtroModulo, filtroCategoria]);

    const categoriasPresentes = useMemo(() => {
        const cont = new Map<string, number>();
        for (const s of suppliers) if (noModulo(s)) cont.set(s.categoria || 'OUTROS', (cont.get(s.categoria || 'OUTROS') || 0) + 1);
        return Object.keys(CATEGORIA_INFO).filter(c => cont.has(c)).map(c => ({ id: c, total: cont.get(c)! }));
    }, [suppliers, filtroModulo]);

    const ufsPresentes = useMemo(() => [...new Set(suppliers.map(ufDe).filter(Boolean))].sort(), [suppliers]);

    const filtered = suppliers.filter(s => {
        const termo = search.toLowerCase();
        const matchSearch = s.nome.toLowerCase().includes(termo) || (s.nome_fantasia || '').toLowerCase().includes(termo)
            || (s.especialidade || '').toLowerCase().includes(termo) || (s.cnpj || '').includes(search) || (s.cpf || '').includes(search);
        const matchCategoria = !filtroCategoria || (s.categoria || 'OUTROS') === filtroCategoria;
        const matchEspecialidade = !filtroEspecialidade || chaveTexto(s.especialidade || '') === filtroEspecialidade;
        const matchUf = !filtroUf || ufDe(s) === filtroUf;
        const matchSst = !filtroSst || sst[s.id]?.situacao === filtroSst;
        return matchSearch && noModulo(s) && matchCategoria && matchEspecialidade && matchUf && matchSst;
    });
    const temFiltro = Boolean(filtroCategoria || filtroEspecialidade || filtroUf || filtroSst || search);
    const limparFiltros = () => { setFiltroCategoria(''); setFiltroEspecialidade(''); setFiltroUf(''); setFiltroSst(''); setSearch(''); };

    const catInfo = (cat: string | null) => CATEGORIA_INFO[cat || 'OUTROS'];

    return (
        <div className="p-8 text-foreground">
            <PageHeader icone={Building2} tom={TOM_MODULO.fornecedores} titulo="Fornecedores e prestadores"
                descricao={<span className="flex flex-wrap gap-x-4">
                    <span>{suppliers.filter(s => s.categoria === 'MATERIAL').length} fornecedores de material</span>
                    <span>{suppliers.filter(s => s.categoria !== 'MATERIAL').length} prestadores de serviço</span>
                </span>}
                acoes={
                    <button onClick={openCreate} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-semibold">
                        <Plus size={16} aria-hidden /> Novo cadastro
                    </button>
                } />

            <FiltroPainel>
                <FiltroLinha rotulo="Buscar">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[240px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
                            <input type="text" placeholder="Buscar por nome, especialidade, CNPJ ou CPF..." aria-label="Buscar cadastros" value={search} onChange={e => setSearch(e.target.value)}
                                className={`${CAMPO} w-full pl-9`} />
                        </div>
                        <div className={ALTERNADOR} role="group" aria-label="Módulo">
                            {(['TODOS', 'MATERIAL', 'PRESTADOR'] as const).map(m => {
                                // Material verde, Prestadores azul (cores dos ramos Material e Mão de obra).
                                const tomM = m === 'MATERIAL' ? TOM_RAMO.MATERIAL : m === 'PRESTADOR' ? TOM_RAMO.MAO_DE_OBRA : null;
                                const ativoM = filtroModulo === m;
                                const clsM = ativoM
                                    ? (tomM ? `${SOLIDO[tomM]} text-background` : 'bg-primary text-primary-foreground')
                                    : (tomM ? `${TEXTO[tomM]} hover:bg-secondary` : 'text-muted-foreground hover:text-foreground');
                                return (
                                <button key={m} onClick={() => { setFiltroModulo(m); setFiltroCategoria(''); setFiltroEspecialidade(''); }}
                                    aria-pressed={ativoM}
                                    className={`${SEGMENTO} ${clsM}`}>
                                    {m === 'MATERIAL' && <Factory size={14} aria-hidden />}
                                    {m === 'PRESTADOR' && <HardHat size={14} aria-hidden />}
                                    {m === 'TODOS' ? 'Todos' : m === 'MATERIAL' ? 'Material' : 'Prestadores'}
                                </button>
                                );
                            })}
                        </div>
                    </div>
                </FiltroLinha>

                {/* Ramo de atividade: categoria em chips; especialidade e UF em listas */}
                <FiltroLinha rotulo="Ramo">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => { setFiltroCategoria(''); setFiltroEspecialidade(''); }}
                            aria-pressed={!filtroCategoria}
                            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold leading-none ${!filtroCategoria ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                            Todos
                        </button>
                        {categoriasPresentes.map(c => {
                            const info = CATEGORIA_INFO[c.id];
                            const ativo = filtroCategoria === c.id;
                            const Icone = info.icon;
                            const tomC = tomDe(TOM_RAMO, c.id);
                            return (
                                <button key={c.id} onClick={() => { setFiltroCategoria(ativo ? '' : c.id); setFiltroEspecialidade(''); }}
                                    aria-pressed={ativo}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold leading-none ${ativo ? `${SOLIDO[tomC]} text-background border border-transparent` : `${CHIP[tomC]} hover:brightness-110`}`}>
                                    <Icone size={14} aria-hidden /> {info.label} <span className="tabular-nums opacity-70">{c.total}</span>
                                </button>
                            );
                        })}
                    </div>
                </FiltroLinha>

                <FiltroLinha rotulo="Especialidade, UF e SST">
                    <GradeSeletores>
                        <select value={filtroEspecialidade} onChange={e => setFiltroEspecialidade(e.target.value)} aria-label="Especialidade" className={`${CAMPO} w-full`}>
                            <option value="">Toda especialidade</option>
                            {especialidades.map(e => <option key={e.chave} value={e.chave}>{e.rotulo} ({e.total})</option>)}
                        </select>
                        <select value={filtroUf} onChange={e => setFiltroUf(e.target.value)} aria-label="UF" className={`${CAMPO} w-full`}>
                            <option value="">Toda UF</option>
                            {ufsPresentes.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                        <select value={filtroSst} onChange={e => setFiltroSst(e.target.value)} aria-label="Segurança do trabalho" className={`${CAMPO} w-full`}>
                            <option value="">Segurança do trabalho: todos</option>
                            <option value="PENDENTE">Com pendência</option>
                            <option value="VENCE_EM_BREVE">Vencendo em até 30 dias</option>
                            <option value="EM_DIA">Em dia</option>
                        </select>
                    </GradeSeletores>
                </FiltroLinha>
            </FiltroPainel>

            {/* Contagem e limpeza presas à grade que descrevem. */}
            <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
                <span><strong className="font-semibold text-foreground tabular-nums">{filtered.length}</strong> de {suppliers.length} cadastro(s)</span>
                {temFiltro && (
                    <button onClick={limparFiltros} className="h-7 px-2 text-xs font-semibold text-primary hover:underline">Limpar filtros</button>
                )}
            </div>

            {/* Cartões de uma fileira com a mesma altura (stretch) e rodapé preso
                embaixo (mt-auto): os rodapés ficam na mesma linha. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                {loading ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">Carregando...</div>
                ) : filtered.length === 0 ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">
                        {temFiltro ? 'Nenhum cadastro com esses filtros.' : 'Nenhum fornecedor cadastrado. Clique em "Novo cadastro" para começar.'}
                    </div>
                ) : filtered.map(s => {
                    const ci = catInfo(s.categoria);
                    const IconeCat = ci.icon;
                    const tomCat = tomDe(TOM_RAMO, s.categoria, 'slate');
                    const temCondicao = (s._condicoesCount || 0) > 0;
                    const local = s.cidade ? [s.cidade, ufDe(s)].filter(Boolean).join('/') : s.uf;
                    const regiao = s.regiao ? (REGIAO_LABEL[s.regiao] || s.regiao) : null;
                    return (
                        <div key={s.id} className={`bg-card text-foreground rounded-lg border border-border border-l-4 ${FAIXA[tomCat]} p-5 flex h-full flex-col`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${VEU[tomCat]} ${TEXTO[tomCat]}`}>
                                    <IconeCat size={18} aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-base truncate" title={s.nome}>{s.nome}</h3>
                                    {s.cnpj || s.cpf
                                        ? <p className="text-xs text-muted-foreground font-id">{s.cnpj || s.cpf}</p>
                                        : <p className="text-xs text-muted-foreground">—</p>}
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    {sst[s.id] && sst[s.id].situacao !== 'NAO_SE_APLICA' && (
                                        <button onClick={() => setSstAberto(s)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                            aria-label={`Segurança do trabalho de ${s.nome}`} title="Segurança do trabalho: documentos e equipe"><ShieldCheck size={15} aria-hidden /></button>
                                    )}
                                    <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                        aria-label={`Editar ${s.nome}`} title="Editar cadastro"><Pencil size={15} aria-hidden /></button>
                                    {ehAdmin && (
                                        <button onClick={() => handleDelete(s.id, s.nome)} className="p-1.5 rounded-md hover:bg-crit/10 text-muted-foreground hover:text-crit"
                                            aria-label={`Desativar ${s.nome}`} title="Desativar cadastro"><Trash2 size={15} aria-hidden /></button>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1.5 flex-wrap mb-3">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${CHIP[tomCat]}`}>
                                    <IconeCat size={14} aria-hidden /> {ci.label}
                                </span>
                                {s.especialidade && <span className="max-w-full truncate text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground" title={s.especialidade}>{s.especialidade}</span>}
                                {s.tipo && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s.tipo === 'PESSOA_FISICA' ? 'PF' : 'PJ'}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1 mb-3">
                                {s.email && <p className="flex items-center gap-1.5 min-w-0"><Mail size={14} aria-hidden className="flex-shrink-0" /><span className="sr-only">E-mail: </span><span className="truncate">{s.email}</span></p>}
                                {s.telefone && <p className="flex items-center gap-1.5"><Phone size={14} aria-hidden className="flex-shrink-0" /><span className="sr-only">Telefone: </span>{s.telefone}</p>}
                                {s.pix && <p className="flex items-center gap-1.5 min-w-0"><CreditCard size={14} aria-hidden className="flex-shrink-0" /><span>PIX</span><span className="font-id truncate text-foreground">{s.pix}</span></p>}
                                {(local || regiao) && (
                                    <p className="flex items-center gap-1.5 flex-wrap">
                                        <MapPin size={14} aria-hidden className="flex-shrink-0" />
                                        <span className="sr-only">Local: </span>
                                        {local && <span>{local}</span>}
                                        {regiao && <span className={local ? 'ml-2' : ''}>{regiao}</span>}
                                    </p>
                                )}
                            </div>
                            {sst[s.id] && sst[s.id].situacao !== 'NAO_SE_APLICA' && (
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <SeloSst resumo={sst[s.id]} onClick={() => setSstAberto(s)} compacto />
                                    {sst[s.id].membros > 0 && <span className="text-[11px] text-muted-foreground">Equipe: {sst[s.id].membros}</span>}
                                </div>
                            )}
                            <div className={`mt-auto flex items-center gap-1.5 pt-2 border-t border-border text-xs font-medium ${temCondicao ? 'text-ok' : 'text-muted-foreground'}`}>
                                <Wallet size={14} aria-hidden />
                                <span>
                                    {temCondicao ? `${s._condicoesCount} condição(ões) de pagamento cadastrada(s)` : 'Nenhuma condição de pagamento'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {editando !== undefined && (
                <FornecedorFormModal supplier={editando} onClose={() => setEditando(undefined)}
                    onSaved={() => { setEditando(undefined); loadSuppliers(); carregarSst(); }} />
            )}
            {sstAberto && <SegurancaTrabalhoModal supplier={sstAberto} onClose={() => setSstAberto(null)} onMudou={carregarSst} />}
        </div>
    );
}

export default Fornecedores;
