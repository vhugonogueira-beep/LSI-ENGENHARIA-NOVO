import { useEffect, useState } from 'react';
import {
    BarChart3, Cog, DraftingCompass, Factory, Forklift, HardHat, Microscope, Package, Truck, UserRound, Wallet, Wrench, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DadosBancariosForm from './DadosBancariosForm';
import MunicipioInput from './MunicipioInput';
import { UFS, REGIAO_LABEL, regiaoPorUf } from '../atividades/constants';

// Janela única "Novo cadastro" de fornecedor de material e prestador de serviço.
// Usada na aba Pessoas e Fornecedores e no pagamento da atividade (08/10/2026),
// onde ganha o terceiro cartão "Funcionário LS" — a mesma organização da aba do
// menu lateral, que reúne fornecedores, prestadores e funcionários.

export interface CondicaoPagamento {
    id: string;
    nome: string;
    percentual_entrada: number;
    percentual_saldo: number;
    gatilho_saldo: string;
}

export interface Supplier {
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
export const CATEGORIA_INFO: Record<string, { label: string; icon: LucideIcon }> = {
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

function formDoSupplier(s: Supplier) {
    return {
        nome: s.nome, nome_fantasia: s.nome_fantasia || '',
        tipo: s.tipo || 'PESSOA_JURIDICA', cnpj: s.cnpj || '', cpf: s.cpf || '',
        categoria: s.categoria || 'MAO_DE_OBRA', especialidade: s.especialidade || '',
        email: s.email || '', telefone: s.telefone || '',
        endereco: s.endereco || '', cidade: s.cidade || '', uf: s.uf || '', regiao: s.regiao || '',
        banco: s.banco || '', agencia: s.agencia || '', conta: s.conta || '', tipo_conta: s.tipo_conta || '', pix_tipo: s.pix_tipo || (s.tipo === 'PESSOA_FISICA' ? 'CPF' : 'CNPJ'), pix: s.pix || '', forma_pagamento: s.forma_pagamento || (s.pix ? 'PIX' : 'TED'),
        observacoes: s.observacoes || '',
    };
}

export default function FornecedorFormModal({ supplier, onClose, onSaved, onEscolherFuncionario }: {
    /** Cadastro existente para editar; ausente = novo. */
    supplier?: Supplier | null;
    onClose: () => void;
    /** Recebe o cadastro gravado. */
    onSaved: (s: Supplier) => void;
    /** Presente = mostra o terceiro cartão "Funcionário LS" (uso no pagamento). */
    onEscolherFuncionario?: () => void;
}) {
    const editingId = supplier?.id || null;
    const [form, setForm] = useState(() => (supplier ? formDoSupplier(supplier) : FORM_INIT));
    const [condicoesModal, setCondicoesModal] = useState<CondicaoPagamento[]>([]);
    const [condicaoForm, setCondicaoForm] = useState(CONDICAO_FORM_INIT);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState('');
    const isPF = form.tipo === 'PESSOA_FISICA';
    const isMaterial = form.categoria === 'MATERIAL';

    useEffect(() => {
        if (!editingId) return;
        fetch(`/api/suppliers/${editingId}/condicoes-pagamento`).then(r => (r.ok ? r.json() : [])).then(setCondicoesModal);
    }, [editingId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSaving(true);
        setErro('');
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
            const saved = await resp.json().catch(() => ({}));
            if (!resp.ok) { setErro(saved.error || 'Erro ao salvar o cadastro'); return; }
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
            onSaved({ ...(supplier || {}), ...saved, id: supplierId });
        } catch {
            setErro('Erro ao salvar o cadastro');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9500] p-4">
            <div className={`bg-background text-foreground rounded-xl shadow-2xl p-6 w-full ${onEscolherFuncionario && !editingId ? 'max-w-3xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto border border-border`}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold">{editingId ? 'Editar cadastro' : 'Novo cadastro'}</h3>
                    <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"
                        aria-label="Fechar cadastro" title="Fechar cadastro"><X size={18} aria-hidden /></button>
                </div>
                <form onSubmit={handleSave} className="space-y-5">
                    {erro && <div role="alert" className="rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">{erro}</div>}
                    {/* Tipo de cadastro — dois grandes cartões, como no modelo anterior */}
                    <div className={`grid gap-3 ${onEscolherFuncionario && !editingId ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                        {onEscolherFuncionario && !editingId && <CartaoFuncionario onClick={onEscolherFuncionario} />}
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
                        <button type="button" onClick={onClose} className="px-4 py-2.5 border border-border rounded-lg hover:bg-muted font-medium">Cancelar</button>
                        <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary/90 font-semibold disabled:opacity-60">
                            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : `Adicionar ${isMaterial ? 'Fornecedor' : 'Prestador'}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/** Terceiro cartão do "Novo cadastro" no pagamento: leva à janela de funcionário. */
export function CartaoFuncionario({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            className="text-left rounded-lg p-4 transition-colors border-2 border-border bg-secondary/30 hover:border-primary/60">
            <UserRound size={24} aria-hidden className="mb-1 text-muted-foreground" />
            <div className="text-sm font-bold">Funcionário LS</div>
            <div className="text-xs text-muted-foreground mt-0.5">Equipe própria da LS (CPF)</div>
        </button>
    );
}
