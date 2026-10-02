import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, Building2, Cog, CreditCard, DraftingCompass, Factory, Forklift, HardHat, Mail, MapPin,
    Microscope, Package, Pencil, Phone, Plus, Search, Trash2, Truck, Wallet, Wrench, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DadosBancariosForm from '../components/cadastros/DadosBancariosForm';
import MunicipioInput from '../components/cadastros/MunicipioInput';
import { useEhAdmin } from '../lib/permissoes';
import { UFS, REGIAO_LABEL, chaveTexto, normalizarUf, regiaoPorUf } from '../components/atividades/constants';
import { CHIP, FAIXA, SOLIDO, TEXTO, TOM_MODULO, TOM_RAMO, VEU, tomDe } from '../lib/cores';
import PageHeader from '../components/PageHeader';
import { FiltroPainel, FiltroLinha, GradeSeletores, CAMPO, ALTERNADOR, SEGMENTO } from '../components/FiltroPainel';

interface CondicaoPagamento {
    id: string;
    nome: string;
    percentual_entrada: number;
    percentual_saldo: number;
    gatilho_saldo: string;
}

interface Supplier {
    id: string;
    nome: string;
    nome_fantasia: string | null;
    cnpj: string | null;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    regiao: string | null;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    pix: string | null;
    pix_tipo: string | null;
    tipo_conta: string | null;
    forma_pagamento: string | null;
    tipo: string | null;
    categoria: string | null;
    especialidade: string | null;
    observacoes: string | null;
    ativo: boolean;
    _condicoesCount?: number;
}

// Categoria = ramo: cada ramo tem a sua cor (TOM_RAMO), igual em toda tela; a pílula sempre diz o nome.
const CATEGORIA_INFO: Record<string, { label: string; icon: LucideIcon }> = {
    MATERIAL: { label: 'Material', icon: Factory },
    MAO_DE_OBRA: { label: 'Mão de obra', icon: HardHat },
    SERVICO: { label: 'Serviço', icon: Wrench },
    LOCACAO: { label: 'Locação', icon: Forklift },
    EQUIPAMENTO: { label: 'Equipamento', icon: Cog },
    TRANSPORTE: { label: 'Transporte', icon: Truck },
    ENGENHARIA: { label: 'Engenharia', icon: DraftingCompass },
    SONDAGEM: { label: 'Sondagem', icon: Microscope },
    ANALISE: { label: 'Análise', icon: BarChart3 },
    OUTROS: { label: 'Outros', icon: Package },
};
const CATEGORIAS_PRESTADOR = ['MAO_DE_OBRA', 'SERVICO', 'LOCACAO', 'EQUIPAMENTO', 'TRANSPORTE', 'ENGENHARIA', 'SONDAGEM', 'ANALISE', 'OUTROS'];
const REGIOES = ['NACIONAL', 'NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'];

const FORM_INIT = {
    nome: '', nome_fantasia: '', tipo: 'PESSOA_JURIDICA', cnpj: '', cpf: '', categoria: 'MAO_DE_OBRA',
    especialidade: '', email: '', telefone: '', endereco: '', cidade: '', uf: '', regiao: '',
    banco: '', agencia: '', conta: '', tipo_conta: '', pix_tipo: 'CNPJ', pix: '', forma_pagamento: 'PIX', observacoes: '',
};
const CONDICAO_FORM_INIT = { nome: '', percentual_entrada: '20', percentual_saldo: '80', gatilho_saldo: 'CONCLUSAO' };

const inputCls = "w-full border border-border rounded-lg p-2.5 bg-secondary/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const smallInputCls = "text-xs border border-border rounded-md px-2 py-1.5 bg-secondary/40 text-foreground placeholder:text-muted-foreground focus:outline-none";
const labelCls = "block text-sm font-medium mb-1 text-foreground";

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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(FORM_INIT);
    const [condicoesModal, setCondicoesModal] = useState<CondicaoPagamento[]>([]);
    const [condicaoForm, setCondicaoForm] = useState(CONDICAO_FORM_INIT);
    const [saving, setSaving] = useState(false);

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

    useEffect(() => { loadSuppliers(); }, []);

    const resetForm = () => { setForm(FORM_INIT); setEditingId(null); setCondicoesModal([]); setCondicaoForm(CONDICAO_FORM_INIT); };
    const openCreate = () => { resetForm(); setIsModalOpen(true); };
    const openEdit = async (s: Supplier) => {
        setForm({
            nome: s.nome, nome_fantasia: s.nome_fantasia || '',
            tipo: s.tipo || 'PESSOA_JURIDICA', cnpj: s.cnpj || '', cpf: s.cpf || '',
            categoria: s.categoria || 'MAO_DE_OBRA', especialidade: s.especialidade || '',
            email: s.email || '', telefone: s.telefone || '',
            endereco: s.endereco || '', cidade: s.cidade || '', uf: s.uf || '', regiao: s.regiao || '',
            banco: s.banco || '', agencia: s.agencia || '', conta: s.conta || '', tipo_conta: s.tipo_conta || '', pix_tipo: s.pix_tipo || (s.tipo === 'PESSOA_FISICA' ? 'CPF' : 'CNPJ'), pix: s.pix || '', forma_pagamento: s.forma_pagamento || (s.pix ? 'PIX' : 'TED'),
            observacoes: s.observacoes || '',
        });
        setEditingId(s.id);
        setCondicaoForm(CONDICAO_FORM_INIT);
        setIsModalOpen(true);
        const r = await fetch(`/api/suppliers/${s.id}/condicoes-pagamento`);
        setCondicoesModal(r.ok ? await r.json() : []);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                nome: form.nome,
                nome_fantasia: form.nome_fantasia || null,
                tipo: form.tipo,
                cnpj: form.tipo === 'PESSOA_JURIDICA' ? (form.cnpj || null) : null,
                cpf: form.tipo === 'PESSOA_FISICA' ? (form.cpf || null) : null,
                categoria: form.categoria,
                especialidade: form.especialidade || null,
                email: form.email || null,
                telefone: form.telefone || null,
                endereco: form.endereco || null,
                cidade: form.cidade || null,
                uf: form.uf || null,
                regiao: form.regiao || null,
                banco: form.banco || null,
                agencia: form.agencia || null,
                conta: form.conta || null,
                tipo_conta: form.tipo_conta || null,
                pix_tipo: form.pix_tipo || null,
                pix: form.pix || null,
                forma_pagamento: form.forma_pagamento || null,
                observacoes: form.observacoes || null,
            };
            const resp = await fetch(editingId ? `/api/suppliers/${editingId}` : '/api/suppliers', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const saved = await resp.json();
            const supplierId = editingId || saved.id;

            // Condição de pagamento preenchida no próprio cadastro (não exige passo separado).
            if (condicaoForm.nome.trim()) {
                const entrada = parseFloat(condicaoForm.percentual_entrada);
                const saldo = parseFloat(condicaoForm.percentual_saldo);
                if (Math.round(entrada + saldo) === 100) {
                    await fetch(`/api/suppliers/${supplierId}/condicoes-pagamento`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome: condicaoForm.nome, percentual_entrada: entrada, percentual_saldo: saldo, gatilho_saldo: condicaoForm.gatilho_saldo }),
                    });
                }
            }

            setIsModalOpen(false);
            resetForm();
            loadSuppliers();
        } catch (e) {
            alert('Erro ao salvar fornecedor');
        } finally {
            setSaving(false);
        }
    };

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
        return matchSearch && noModulo(s) && matchCategoria && matchEspecialidade && matchUf;
    });
    const temFiltro = Boolean(filtroCategoria || filtroEspecialidade || filtroUf || search);
    const limparFiltros = () => { setFiltroCategoria(''); setFiltroEspecialidade(''); setFiltroUf(''); setSearch(''); };

    const isPF = form.tipo === 'PESSOA_FISICA';
    const isMaterial = form.categoria === 'MATERIAL';
    const catInfo = (cat: string | null) => CATEGORIA_INFO[cat || 'OUTROS'];

    return (
        <div className="p-8 text-foreground">
            <PageHeader icone={Building2} tom={TOM_MODULO.fornecedores} titulo="Fornecedores & Prestadores"
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

                <FiltroLinha rotulo="Especialidade e UF">
                    <GradeSeletores>
                        <select value={filtroEspecialidade} onChange={e => setFiltroEspecialidade(e.target.value)} aria-label="Especialidade" className={`${CAMPO} w-full`}>
                            <option value="">Toda especialidade</option>
                            {especialidades.map(e => <option key={e.chave} value={e.chave}>{e.rotulo} ({e.total})</option>)}
                        </select>
                        <select value={filtroUf} onChange={e => setFiltroUf(e.target.value)} aria-label="UF" className={`${CAMPO} w-full`}>
                            <option value="">Toda UF</option>
                            {ufsPresentes.map(uf => <option key={uf} value={uf}>{uf}</option>)}
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

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-background text-foreground rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold">{editingId ? 'Editar cadastro' : 'Novo cadastro'}</h3>
                            <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground"
                                aria-label="Fechar cadastro" title="Fechar cadastro"><X size={18} aria-hidden /></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-5">

                            {/* Tipo de cadastro — dois grandes cartões, como no modelo anterior */}
                            <div className="grid grid-cols-2 gap-3">
                                <button type="button" onClick={() => setForm(f => ({ ...f, categoria: 'MATERIAL' }))}
                                    aria-pressed={isMaterial}
                                    className={`text-left rounded-lg p-4 transition-colors border-2 ${isMaterial ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'}`}>
                                    <Factory size={24} aria-hidden className={`mb-1 ${isMaterial ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <div className={`text-sm font-bold ${isMaterial ? 'text-primary' : ''}`}>Fornecedor de material</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Vende produtos e insumos (CNPJ)</div>
                                </button>
                                <button type="button" onClick={() => setForm(f => ({ ...f, categoria: 'MAO_DE_OBRA' }))}
                                    aria-pressed={!isMaterial}
                                    className={`text-left rounded-lg p-4 transition-colors border-2 ${!isMaterial ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'}`}>
                                    <HardHat size={24} aria-hidden className={`mb-1 ${!isMaterial ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <div className={`text-sm font-bold ${!isMaterial ? 'text-primary' : ''}`}>Prestador de serviço</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Executa obras e serviços (PF ou PJ)</div>
                                </button>
                            </div>

                            <div>
                                <label className={labelCls}>{isMaterial ? 'Razão social' : 'Nome / razão social'} *</label>
                                <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                                    className={inputCls} placeholder={isMaterial ? 'Razão social do fornecedor' : 'Nome ou empresa prestadora'} />
                            </div>
                            <div>
                                <label className={labelCls}>Nome fantasia</label>
                                <input value={form.nome_fantasia} onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))} className={inputCls} />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Tipo</label>
                                    <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, pix_tipo: ['CPF', 'CNPJ'].includes(f.pix_tipo) ? (e.target.value === 'PESSOA_FISICA' ? 'CPF' : 'CNPJ') : f.pix_tipo }))} className={inputCls}>
                                        <option value="PESSOA_JURIDICA">Pessoa Jurídica</option>
                                        <option value="PESSOA_FISICA">Pessoa Física</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>{isPF ? 'CPF' : 'CNPJ'}</label>
                                    <input value={isPF ? form.cpf : form.cnpj} onChange={e => setForm(f => isPF ? { ...f, cpf: e.target.value } : { ...f, cnpj: e.target.value })}
                                        className={inputCls} placeholder={isPF ? '000.000.000-00' : '00.000.000/0001-00'} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {!isMaterial && (
                                    <div>
                                        <label className={labelCls}>Categoria</label>
                                        <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={inputCls}>
                                            {CATEGORIAS_PRESTADOR.map(c => <option key={c} value={c}>{CATEGORIA_INFO[c].label}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className={isMaterial ? 'col-span-2' : ''}>
                                    <label className={labelCls}>Especialidade</label>
                                    <input value={form.especialidade} onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))}
                                        className={inputCls} placeholder="Ex: Civil, RF, Elétrico, Cabos & Conectores..." />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Telefone</label>
                                    <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>E-mail</label>
                                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className={labelCls}>UF</label>
                                    <select value={form.uf} className={inputCls}
                                        onChange={e => {
                                            const uf = e.target.value;
                                            // A região acompanha a UF enquanto ninguém a escolheu à mão
                                            // (vazia ou igual à da UF anterior); NACIONAL é escolha e fica.
                                            setForm(f => ({
                                                ...f, uf,
                                                cidade: uf === f.uf ? f.cidade : '',
                                                regiao: !f.regiao || f.regiao === regiaoPorUf(f.uf) ? regiaoPorUf(uf) : f.regiao,
                                            }));
                                        }}>
                                        <option value="">Selecione</option>
                                        {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Cidade</label>
                                    <MunicipioInput uf={form.uf} value={form.cidade} className={inputCls}
                                        onChange={nome => setForm(f => ({ ...f, cidade: nome }))} />
                                </div>
                                <div>
                                    <label className={labelCls}>Região de atuação</label>
                                    <select value={form.regiao} onChange={e => setForm(f => ({ ...f, regiao: e.target.value }))} className={inputCls}>
                                        <option value="">Selecione</option>
                                        {REGIOES.map(regiao => <option key={regiao} value={regiao}>{REGIAO_LABEL[regiao] || regiao}</option>)}
                                        {form.regiao && !REGIOES.includes(form.regiao) && <option value={form.regiao}>{form.regiao}</option>}
                                    </select>
                                </div>
                            </div>

                            <DadosBancariosForm
                                value={{ forma_pagamento: form.forma_pagamento, pix_tipo: form.pix_tipo, pix_chave: form.pix, banco: form.banco, agencia: form.agencia, conta: form.conta, tipo_conta: form.tipo_conta }}
                                onChange={(campo, valor) => setForm(f => ({ ...f, [campo === 'pix_chave' ? 'pix' : campo]: valor }))}
                            />

                            {/* Condição de pagamento — agora dentro do próprio cadastro */}
                            <div className="rounded-lg p-3.5 border border-primary/20 bg-primary/5">
                                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                                    <Wallet size={14} aria-hidden /> Condição de pagamento padrão
                                </div>
                                {condicoesModal.length > 0 && (
                                    <div className="flex flex-col gap-1.5 mb-3">
                                        {condicoesModal.map(c => (
                                            <div key={c.id} className="text-xs bg-secondary/50 rounded-md px-2.5 py-1.5">
                                                <span className="font-semibold">{c.nome}</span> — {c.percentual_entrada}% entrada + {c.percentual_saldo}% saldo ({c.gatilho_saldo === 'INICIO' ? 'no início' : c.gatilho_saldo === 'MARCO' ? 'em marco' : 'na conclusão'})
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="grid grid-cols-4 gap-2">
                                    <input value={condicaoForm.nome} onChange={e => setCondicaoForm(f => ({ ...f, nome: e.target.value }))}
                                        className={`col-span-2 ${smallInputCls}`} placeholder="Nome (ex: 20+80)" />
                                    <input type="number" value={condicaoForm.percentual_entrada}
                                        onChange={e => setCondicaoForm(f => ({ ...f, percentual_entrada: e.target.value, percentual_saldo: String(100 - parseFloat(e.target.value || '0')) }))}
                                        className={smallInputCls} placeholder="% Entrada" />
                                    <input type="number" value={condicaoForm.percentual_saldo} onChange={e => setCondicaoForm(f => ({ ...f, percentual_saldo: e.target.value }))}
                                        className={smallInputCls} placeholder="% Saldo" />
                                </div>
                                <select value={condicaoForm.gatilho_saldo} onChange={e => setCondicaoForm(f => ({ ...f, gatilho_saldo: e.target.value }))} className={`${smallInputCls} mt-2 w-full`}>
                                    <option value="INICIO">Saldo pago no início</option>
                                    <option value="MARCO">Saldo pago em marco intermediário</option>
                                    <option value="CONCLUSAO">Saldo pago na conclusão</option>
                                </select>
                                <p className="text-[11px] text-muted-foreground mt-1.5">Preencha o nome para salvar esta condição junto com o cadastro. Deixe em branco para não criar nenhuma agora.</p>
                            </div>

                            <div>
                                <label className={labelCls}>Observações</label>
                                <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                                    className={`${inputCls} resize-y`} />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2.5 border border-border rounded-lg hover:bg-muted font-medium">Cancelar</button>
                                <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary/90 font-semibold disabled:opacity-60">
                                    {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : `Adicionar ${isMaterial ? 'Fornecedor' : 'Prestador'}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Fornecedores;
