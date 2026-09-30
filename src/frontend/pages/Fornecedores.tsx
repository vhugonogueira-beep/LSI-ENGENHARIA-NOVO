import { useState, useEffect, useMemo } from 'react';
import { Building2, HardHat, Plus, Search, Pencil, Trash2, Wallet, X } from 'lucide-react';
import DadosBancariosForm from '../components/cadastros/DadosBancariosForm';
import MunicipioInput from '../components/cadastros/MunicipioInput';
import { useEhAdmin } from '../lib/permissoes';
import { UFS, REGIAO_LABEL, chaveTexto, normalizarUf, regiaoPorUf } from '../components/atividades/constants';

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

const CATEGORIA_INFO: Record<string, { label: string; color: string; icon: string }> = {
    MATERIAL: { label: 'Material', color: '#22c55e', icon: '🏭' },
    MAO_DE_OBRA: { label: 'Mão de Obra', color: '#1768D5', icon: '👷' },
    SERVICO: { label: 'Serviço', color: '#8b5cf6', icon: '🔧' },
    LOCACAO: { label: 'Locação', color: '#f59e0b', icon: '🚚' },
    EQUIPAMENTO: { label: 'Equipamento', color: '#06b6d4', icon: '⚙️' },
    TRANSPORTE: { label: 'Transporte', color: '#fb923c', icon: '🚛' },
    ENGENHARIA: { label: 'Engenharia', color: '#6366f1', icon: '🏗️' },
    SONDAGEM: { label: 'Sondagem', color: '#ec4899', icon: '🔬' },
    ANALISE: { label: 'Análise', color: '#14b8a6', icon: '📊' },
    OUTROS: { label: 'Outros', color: '#94a3b8', icon: '📦' },
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
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                        <Building2 className="text-primary" size={28} />
                        Fornecedores & Prestadores
                    </h2>
                    <p className="text-muted-foreground mt-1">{suppliers.filter(s => s.categoria === 'MATERIAL').length} fornecedores de material · {suppliers.filter(s => s.categoria !== 'MATERIAL').length} prestadores de serviço</p>
                </div>
                <button onClick={openCreate} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 flex items-center gap-2 font-semibold shadow-md shadow-primary/20">
                    <Plus size={18} /> Novo Cadastro
                </button>
            </div>

            <div className="flex gap-3 mb-5 flex-wrap items-center">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input type="text" placeholder="Buscar por nome, especialidade, CNPJ ou CPF..." value={search} onChange={e => setSearch(e.target.value)}
                        className={`${inputCls} pl-10`} />
                </div>
                <div className="flex gap-1 bg-secondary/40 rounded-lg p-1">
                    {(['TODOS', 'MATERIAL', 'PRESTADOR'] as const).map(m => (
                        <button key={m} onClick={() => { setFiltroModulo(m); setFiltroCategoria(''); setFiltroEspecialidade(''); }}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium ${filtroModulo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            {m === 'TODOS' ? 'Todos' : m === 'MATERIAL' ? '🏭 Material' : '👷 Prestadores'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Ramo de atividade: categoria em chips; especialidade e UF em listas */}
            <div className="flex gap-2 mb-5 flex-wrap items-center">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Ramo</span>
                <button onClick={() => { setFiltroCategoria(''); setFiltroEspecialidade(''); }}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${!filtroCategoria ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    Todos
                </button>
                {categoriasPresentes.map(c => {
                    const info = CATEGORIA_INFO[c.id];
                    const ativo = filtroCategoria === c.id;
                    return (
                        <button key={c.id} onClick={() => { setFiltroCategoria(ativo ? '' : c.id); setFiltroEspecialidade(''); }}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={ativo ? { background: info.color, borderColor: info.color, color: '#fff' } : { borderColor: `${info.color}55`, color: info.color }}>
                            {info.label} <span className="opacity-70">{c.total}</span>
                        </button>
                    );
                })}
                <select value={filtroEspecialidade} onChange={e => setFiltroEspecialidade(e.target.value)}
                    className="ml-auto h-8 rounded-lg border border-border bg-card px-2 text-xs">
                    <option value="">Toda especialidade</option>
                    {especialidades.map(e => <option key={e.chave} value={e.chave}>{e.rotulo} ({e.total})</option>)}
                </select>
                <select value={filtroUf} onChange={e => setFiltroUf(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
                    <option value="">Toda UF</option>
                    {ufsPresentes.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
                {temFiltro && (
                    <button onClick={limparFiltros} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                        Limpar · {filtered.length} resultado(s)
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">Carregando...</div>
                ) : filtered.length === 0 ? (
                    <div className="col-span-3 text-center py-12 text-muted-foreground">
                        {temFiltro ? 'Nenhum cadastro com esses filtros.' : 'Nenhum fornecedor cadastrado. Clique em "Novo Cadastro" para começar.'}
                    </div>
                ) : filtered.map(s => {
                    const ci = catInfo(s.categoria);
                    return (
                        <div key={s.id} className="bg-card text-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow p-5"
                            style={{ borderLeft: `3px solid ${ci.color}` }}>
                            <div className="flex items-start justify-between mb-2">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-base truncate">{ci.icon} {s.nome}</h3>
                                    <p className="text-xs text-muted-foreground">{s.cnpj || s.cpf || '—'}</p>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-muted" title="Editar"><Pencil size={15} className="text-muted-foreground" /></button>
                                    {ehAdmin && <button onClick={() => handleDelete(s.id, s.nome)} className="p-1.5 rounded-md hover:bg-red-500/10" title="Desativar"><Trash2 size={15} className="text-red-500" /></button>}
                                </div>
                            </div>
                            <div className="flex gap-1.5 flex-wrap mb-3">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${ci.color}22`, color: ci.color }}>{ci.label}</span>
                                {s.especialidade && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s.especialidade}</span>}
                                {s.tipo && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s.tipo === 'PESSOA_FISICA' ? 'PF' : 'PJ'}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                                {s.email && <p>✉ {s.email}</p>}
                                {s.telefone && <p>☎ {s.telefone}</p>}
                                {s.pix && <p>💳 PIX: {s.pix}</p>}
                                {(s.cidade || s.uf || s.regiao) && (
                                    <p>📍 {[s.cidade ? [s.cidade, ufDe(s)].filter(Boolean).join('/') : s.uf, s.regiao && (REGIAO_LABEL[s.regiao] || s.regiao)].filter(Boolean).join(' · ')}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 pt-2 border-t border-border text-xs font-medium" style={{ color: (s._condicoesCount || 0) > 0 ? '#22c55e' : undefined }}>
                                <Wallet size={13} className={(s._condicoesCount || 0) > 0 ? '' : 'text-muted-foreground'} />
                                <span className={(s._condicoesCount || 0) > 0 ? '' : 'text-muted-foreground'}>
                                    {s._condicoesCount ? `${s._condicoesCount} condição(ões) de pagamento cadastrada(s)` : 'Nenhuma condição de pagamento'}
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
                            <h3 className="text-xl font-bold">{editingId ? 'Editar Cadastro' : 'Novo Cadastro'}</h3>
                            <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-5">

                            {/* Tipo de cadastro — dois grandes cartões, como no modelo anterior */}
                            <div className="grid grid-cols-2 gap-3">
                                <button type="button" onClick={() => setForm(f => ({ ...f, categoria: 'MATERIAL' }))}
                                    className="text-left rounded-xl p-4 transition-colors"
                                    style={{
                                        border: `2px solid ${isMaterial ? CATEGORIA_INFO.MATERIAL.color : 'hsl(var(--border))'}`,
                                        background: isMaterial ? `${CATEGORIA_INFO.MATERIAL.color}18` : 'hsl(var(--secondary) / 0.3)',
                                    }}>
                                    <div className="text-2xl mb-1">🏭</div>
                                    <div className="text-sm font-bold" style={{ color: isMaterial ? CATEGORIA_INFO.MATERIAL.color : undefined }}>Fornecedor de Material</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Vende produtos e insumos (CNPJ)</div>
                                </button>
                                <button type="button" onClick={() => setForm(f => ({ ...f, categoria: 'MAO_DE_OBRA' }))}
                                    className="text-left rounded-xl p-4 transition-colors"
                                    style={{
                                        border: `2px solid ${!isMaterial ? CATEGORIA_INFO.MAO_DE_OBRA.color : 'hsl(var(--border))'}`,
                                        background: !isMaterial ? `${CATEGORIA_INFO.MAO_DE_OBRA.color}18` : 'hsl(var(--secondary) / 0.3)',
                                    }}>
                                    <div className="text-2xl mb-1"><HardHat size={26} /></div>
                                    <div className="text-sm font-bold" style={{ color: !isMaterial ? CATEGORIA_INFO.MAO_DE_OBRA.color : undefined }}>Prestador de Serviço</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Executa obras e serviços (PF ou PJ)</div>
                                </button>
                            </div>

                            <div>
                                <label className={labelCls}>{isMaterial ? 'Razão Social' : 'Nome / Razão Social'} *</label>
                                <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                                    className={inputCls} placeholder={isMaterial ? 'Razão social do fornecedor' : 'Nome ou empresa prestadora'} />
                            </div>
                            <div>
                                <label className={labelCls}>Nome Fantasia</label>
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
                            <div className="rounded-lg p-3.5 border" style={{ background: '#1768D50d', borderColor: '#1768D530' }}>
                                <div className="text-xs font-bold text-muted-foreground mb-2 tracking-wide flex items-center gap-1.5">
                                    <Wallet size={13} /> CONDIÇÃO DE PAGAMENTO PADRÃO
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
                                <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary/90 font-semibold shadow-md shadow-primary/20 disabled:opacity-60">
                                    {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : `Adicionar ${isMaterial ? 'Fornecedor' : 'Prestador'}`}
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
