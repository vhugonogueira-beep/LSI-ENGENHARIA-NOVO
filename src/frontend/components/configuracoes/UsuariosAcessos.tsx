import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Mail, Pencil, Plus, ShieldCheck, UserX, UserCheck, X } from 'lucide-react';
import { CHIP, FAIXA, SOLIDO, TOM_MODULO, tomDe, type Tom } from '../../lib/cores';

// Usuários e acessos — só para o administrador (o backend confere de novo).
//
// Cadastrar não define senha: gera um link de convite de 72h que a própria
// pessoa usa para criar a senha. O link aparece UMA vez, na hora — o sistema
// guarda só o hash dele —, então aqui ele é mostrado para copiar ou mandar
// por e-mail pelo Outlook.

interface Permissao { chave: string; rotulo: string; descricao: string }
interface Modelo { id: string; rotulo: string; permissoes: string[]; aprovacao_pagamento: string }
interface Usuario {
    id: string; nome: string; nome_exibicao: string | null; email: string; cargo: string | null; telefone: string | null;
    role: string; ativo: boolean; status_acesso: string; convite_expira_em: string | null; ultimo_acesso_em: string | null;
    aprovacao_pagamento: string; limite_pagamento: number | null; email_cc_padrao: string | null; permissoes: string[];
}

const FORM_VAZIO = {
    nome: '', email: '', cargo: '', telefone: '', role: 'USUARIO', permissoes: [] as string[],
    aprovacao_pagamento: 'ACIMA_DO_LIMITE', limite_pagamento: '', email_cc_padrao: '',
};
type Form = typeof FORM_VAZIO;

/** Autonomia de pagamento só faz sentido para quem pede pagamento e não aprova. */
const usaRegraAprovacao = (f: Form) =>
    f.role !== 'ADMIN' && f.permissoes.includes('pagamentos.solicitar') && !f.permissoes.includes('pagamentos.aprovar');

const APROVACAO_LABEL: Record<string, string> = {
    NUNCA: 'Solicita sem aprovação',
    SEMPRE: 'Toda solicitação passa por aprovação',
    ACIMA_DO_LIMITE: 'Aprovação acima de um limite',
};
const STATUS_COR: Record<string, string> = { ATIVO: CHIP.green, CONVIDADO: CHIP.amber, SUSPENSO: CHIP.rose };
/** Grupo da permissão (prefixo da chave) → cor do módulo correspondente. */
const TOM_GRUPO_PERMISSAO: Record<string, Tom> = { ...TOM_MODULO, orcamentos: 'amber', cadastros: 'teal' };
const tomPermissao = (chave: string) => tomDe(TOM_GRUPO_PERMISSAO, chave.split('.')[0], 'slate');
const STATUS_ROTULO: Record<string, string> = { ATIVO: 'Ativo', CONVIDADO: 'Convidado', SUSPENSO: 'Suspenso' };
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (v: string | null) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const campo = 'w-full rounded-lg border border-border bg-secondary/40 p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
const rotulo = 'mb-1 block text-xs font-semibold text-muted-foreground';

async function pedir(url: string, init?: RequestInit) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(corpo?.error || `Erro ${r.status}`);
    return corpo;
}

export default function UsuariosAcessos() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [catalogo, setCatalogo] = useState<{ permissoes: Permissao[]; modelos: Modelo[]; horas_convite: number } | null>(null);
    const [erro, setErro] = useState('');
    const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);
    const [form, setForm] = useState<Form>(FORM_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [link, setLink] = useState<{ usuario: Usuario; url: string; expira: string; tipo: string } | null>(null);

    const carregar = useCallback(async () => {
        try {
            const [lista, cat] = await Promise.all([pedir('/api/usuarios'), pedir('/api/usuarios/catalogo')]);
            setUsuarios(lista);
            setCatalogo(cat);
        } catch (e: any) { setErro(e.message); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const abrirNovo = () => { setForm(FORM_VAZIO); setEditando('novo'); setErro(''); };
    const abrirEdicao = (u: Usuario) => {
        setForm({
            nome: u.nome, email: u.email, cargo: u.cargo || '', telefone: u.telefone || '', role: u.role === 'ADMIN' ? 'ADMIN' : 'USUARIO',
            permissoes: u.permissoes, aprovacao_pagamento: u.aprovacao_pagamento,
            limite_pagamento: u.limite_pagamento == null ? '' : String(u.limite_pagamento), email_cc_padrao: u.email_cc_padrao || '',
        });
        setEditando(u); setErro('');
    };
    const aplicarModelo = (m: Modelo) => setForm(f => ({ ...f, permissoes: m.permissoes, aprovacao_pagamento: m.aprovacao_pagamento }));
    const alternar = (chave: string) => setForm(f => ({
        ...f, permissoes: f.permissoes.includes(chave) ? f.permissoes.filter(p => p !== chave) : [...f.permissoes, chave],
    }));

    const mostrarLink = (usuario: Usuario, token: string, expira: string, tipo: string) =>
        setLink({ usuario, url: `${window.location.origin}/convite/${token}`, expira, tipo });

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setSalvando(true); setErro('');
        // A regra de aprovação só existe para quem pede pagamento e não aprova.
        // Sem isso, a seção do limite fica escondida mas a regra padrão
        // ("acima do limite") ia junto, e o servidor recusava sem a pessoa ter
        // onde digitar o valor.
        const regraSeAplica = usaRegraAprovacao(form);
        const aprovacao = regraSeAplica ? form.aprovacao_pagamento : 'NUNCA';
        const payload = {
            nome: form.nome, cargo: form.cargo, telefone: form.telefone, role: form.role, permissoes: form.permissoes,
            aprovacao_pagamento: aprovacao,
            limite_pagamento: aprovacao === 'ACIMA_DO_LIMITE' ? (form.limite_pagamento === '' ? null : Number(String(form.limite_pagamento).replace(',', '.'))) : null,
            email_cc_padrao: form.email_cc_padrao,
        };
        try {
            if (editando === 'novo') {
                const r = await pedir('/api/usuarios', { method: 'POST', body: JSON.stringify({ ...payload, email: form.email }) });
                mostrarLink(r.usuario, r.token_convite, r.expira_em, 'CONVITE');
            } else if (editando) {
                await pedir(`/api/usuarios/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            }
            setEditando(null);
            await carregar();
        } catch (e: any) { setErro(e.message); }
        finally { setSalvando(false); }
    }

    async function novoLink(u: Usuario) {
        const acao = u.status_acesso === 'CONVIDADO' ? 'gerar um novo convite' : 'gerar um link de redefinição de senha';
        if (!confirm(`${acao[0].toUpperCase()}${acao.slice(1)} para ${u.nome}? O link anterior deixa de valer.`)) return;
        try {
            const r = await pedir(`/api/usuarios/${u.id}/link`, { method: 'POST' });
            mostrarLink(u, r.token_convite, r.expira_em, r.tipo);
        } catch (e: any) { setErro(e.message); }
    }

    async function alterarStatus(u: Usuario, status: 'ATIVO' | 'SUSPENSO') {
        const msg = status === 'SUSPENSO'
            ? `Suspender o acesso de ${u.nome}? A sessão dele cai na hora; o histórico é preservado.`
            : `Reativar o acesso de ${u.nome}?`;
        if (!confirm(msg)) return;
        try { await pedir(`/api/usuarios/${u.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await carregar(); }
        catch (e: any) { setErro(e.message); }
    }

    const ativos = useMemo(() => usuarios.filter(u => u.status_acesso !== 'SUSPENSO').length, [usuarios]);
    const nomePermissao = (chave: string) => catalogo?.permissoes.find(p => p.chave === chave)?.rotulo || chave;

    return (
        <div className="space-y-4 text-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold">Usuários e acessos</h2>
                    <p className="max-w-2xl text-xs text-muted-foreground">
                        Todos veem o sistema inteiro; aqui se define o que cada pessoa pode <b>fazer</b>. Excluir registros e gerir
                        usuários é só do administrador. {ativos} acesso(s) ativo(s) ou em convite.
                    </p>
                </div>
                <button onClick={abrirNovo} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                    <Plus size={16} aria-hidden /> Novo usuário
                </button>
            </div>

            {erro && !editando && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b border-border bg-secondary/40 text-left text-[11px] text-muted-foreground">
                            <th className="px-3 py-2.5 font-semibold">Usuário</th>
                            <th className="px-3 py-2.5 font-semibold">Acesso</th>
                            <th className="px-3 py-2.5 font-semibold">Pode fazer</th>
                            <th className="px-3 py-2.5 font-semibold">Pagamentos</th>
                            <th className="px-3 py-2.5 font-semibold">Último acesso</th>
                            <th className="px-3 py-2.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map(u => (
                            <tr key={u.id} className={`border-b border-border last:border-0 ${u.status_acesso === 'SUSPENSO' ? 'opacity-55' : ''}`}>
                                <td className="px-3 py-3 align-top">
                                    <div className="font-semibold">{u.nome}</div>
                                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground"><span>{u.email}</span>{u.cargo && <span>{u.cargo}</span>}</div>
                                </td>
                                <td className="px-3 py-3 align-top">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COR[u.status_acesso] || ''}`}>{STATUS_ROTULO[u.status_acesso] || u.status_acesso}</span>
                                    {u.role === 'ADMIN' && <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Administrador</span>}
                                    {u.status_acesso === 'CONVIDADO' && u.convite_expira_em && (
                                        <div className="mt-1 text-[11px] text-muted-foreground">
                                            {new Date(u.convite_expira_em) < new Date() ? 'convite vencido' : `convite até ${dataHora(u.convite_expira_em)}`}
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-3 align-top text-[11px] text-muted-foreground">
                                    {u.role === 'ADMIN' ? 'Tudo' : u.permissoes.length ? u.permissoes.map(nomePermissao).join(', ') : 'Somente consulta'}
                                </td>
                                <td className="px-3 py-3 align-top text-[11px]">
                                    {u.role === 'ADMIN' || u.permissoes.includes('pagamentos.aprovar') ? 'Aprova pagamentos'
                                        : u.aprovacao_pagamento === 'ACIMA_DO_LIMITE' ? `Aprovação acima de ${moeda(u.limite_pagamento ?? 0)}`
                                            : APROVACAO_LABEL[u.aprovacao_pagamento]}
                                </td>
                                <td className="px-3 py-3 align-top text-[11px] text-muted-foreground">{dataHora(u.ultimo_acesso_em)}</td>
                                <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                                    <button title="Editar acesso" aria-label={`Editar acesso de ${u.nome}`} onClick={() => abrirEdicao(u)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={15} aria-hidden /></button>
                                    {u.status_acesso !== 'SUSPENSO' && (
                                        <button title={u.status_acesso === 'CONVIDADO' ? 'Gerar novo link de convite' : 'Gerar link para redefinir senha'} aria-label={u.status_acesso === 'CONVIDADO' ? `Gerar novo link de convite para ${u.nome}` : `Gerar link para redefinir senha de ${u.nome}`} onClick={() => novoLink(u)} className="p-1.5 text-muted-foreground hover:text-foreground"><KeyRound size={15} aria-hidden /></button>
                                    )}
                                    {u.status_acesso === 'SUSPENSO'
                                        ? <button title="Reativar acesso" aria-label={`Reativar acesso de ${u.nome}`} onClick={() => alterarStatus(u, 'ATIVO')} className="p-1.5 text-ok"><UserCheck size={15} aria-hidden /></button>
                                        : <button title="Suspender acesso" aria-label={`Suspender acesso de ${u.nome}`} onClick={() => alterarStatus(u, 'SUSPENSO')} className="p-1.5 text-crit"><UserX size={15} aria-hidden /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editando && catalogo && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4">
                    <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-xl border border-border bg-card p-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">{editando === 'novo' ? 'Novo usuário' : `Acesso de ${editando.nome}`}</h3>
                            <button type="button" onClick={() => setEditando(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground"><X size={20} aria-hidden /></button>
                        </div>

                        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label><span className={rotulo}>Nome completo *</span><input required className={campo} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></label>
                            <label><span className={rotulo}>E-mail @lsoffice.com.br *</span>
                                <input required type="email" disabled={editando !== 'novo'} className={`${campo} disabled:opacity-60`} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="nome@lsoffice.com.br" />
                            </label>
                            <label><span className={rotulo}>Cargo</span><input className={campo} value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Engenheiro de projetos" /></label>
                            <label><span className={rotulo}>Telefone</span><input className={campo} value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} /></label>
                        </section>

                        <section className="space-y-3 rounded-xl border border-border bg-secondary/20 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} aria-hidden /> O que pode fazer</h4>
                                <label className="flex items-center gap-2 text-xs font-semibold">
                                    <input type="checkbox" checked={form.role === 'ADMIN'} onChange={e => setForm(f => ({ ...f, role: e.target.checked ? 'ADMIN' : 'USUARIO' }))} />
                                    Administrador (tudo, inclusive excluir e gerir usuários)
                                </label>
                            </div>
                            {form.role !== 'ADMIN' && (
                                <>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[11px] text-muted-foreground">Preencher com:</span>
                                        {catalogo.modelos.map(m => (
                                            <button type="button" key={m.id} onClick={() => aplicarModelo(m)} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">{m.rotulo}</button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        {catalogo.permissoes.map(p => (
                                            <label key={p.chave} className={`flex cursor-pointer gap-2.5 rounded-lg border border-l-4 ${FAIXA[tomPermissao(p.chave)]} p-2.5 ${form.permissoes.includes(p.chave) ? 'border-primary/50 bg-primary/[0.06]' : 'border-border'}`}>
                                                <input type="checkbox" className="mt-0.5" checked={form.permissoes.includes(p.chave)} onChange={() => alternar(p.chave)} />
                                                <span><span className="flex items-center gap-1.5 text-[13px] font-semibold"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${SOLIDO[tomPermissao(p.chave)]}`} />{p.rotulo}</span><span className="block text-[11px] text-muted-foreground">{p.descricao}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">Sem nenhuma marcada, a pessoa só consulta. Ver o sistema inteiro não depende destas opções.</p>
                                </>
                            )}
                        </section>

                        {!usaRegraAprovacao(form) && form.role !== 'ADMIN' && (
                            <p className="-mt-2 text-[11px] text-muted-foreground">
                                Limite de pagamento: marque <strong>Solicitar pagamentos</strong> acima para definir até quanto esta pessoa pede sem aprovação.
                            </p>
                        )}
                        {usaRegraAprovacao(form) && (
                            <section className="space-y-3 rounded-xl border border-border bg-secondary/20 p-4">
                                <h4 className="text-sm font-bold">Aprovação das solicitações de pagamento</h4>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                    {Object.entries(APROVACAO_LABEL).map(([id, l]) => (
                                        <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs font-semibold ${form.aprovacao_pagamento === id ? 'border-primary/50 bg-primary/[0.06]' : 'border-border'}`}>
                                            <input type="radio" name="aprovacao" checked={form.aprovacao_pagamento === id} onChange={() => setForm(f => ({ ...f, aprovacao_pagamento: id }))} />{l}
                                        </label>
                                    ))}
                                </div>
                                {form.aprovacao_pagamento === 'ACIMA_DO_LIMITE' && (
                                    <label className="block max-w-xs"><span className={rotulo}>Pode solicitar sozinho até (R$) *</span>
                                        <input required type="number" min="0" step="0.01" className={campo} value={form.limite_pagamento} onChange={e => setForm(f => ({ ...f, limite_pagamento: e.target.value }))} placeholder="Ex.: 2000" />
                                    </label>
                                )}
                                <p className="text-[11px] text-muted-foreground">Acima disso, o pedido vai para a fila de aprovação em Controle de Pagamentos e o pagamento só sai depois de aprovado.</p>
                            </section>
                        )}

                        <section className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
                            <h4 className="flex items-center gap-2 text-sm font-bold"><Mail size={15} aria-hidden /> E-mails gerados por esta pessoa</h4>
                            <label className="block"><span className={rotulo}>Sempre copiar (CC)</span>
                                <input className={campo} value={form.email_cc_padrao} onChange={e => setForm(f => ({ ...f, email_cc_padrao: e.target.value }))} placeholder="gestor@lsoffice.com.br; outro@lsoffice.com.br" />
                            </label>
                            <p className="text-[11px] text-muted-foreground">Somado ao roteamento de Comunicação. A assinatura cada um cadastra no próprio Meu Perfil.</p>
                        </section>

                        {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</div>}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancelar</button>
                            <button disabled={salvando} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                                {salvando ? 'Salvando...' : editando === 'novo' ? 'Cadastrar e gerar convite' : 'Salvar acesso'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {link && <LinkGerado {...link} horas={catalogo?.horas_convite || 72} onClose={() => setLink(null)} />}
        </div>
    );
}

function LinkGerado({ usuario, url, expira, tipo, horas, onClose }: { usuario: Usuario; url: string; expira: string; tipo: string; horas: number; onClose: () => void }) {
    const [copiado, setCopiado] = useState(false);
    const convite = tipo === 'CONVITE';
    const assunto = convite ? 'Seu acesso ao LS Office Rumo' : 'Redefinição de senha — LS Office Rumo';
    const corpo = [
        `Olá, ${usuario.nome.split(' ')[0]}!`, '',
        convite ? 'Seu acesso ao LS Office Rumo foi criado. Para definir sua senha e entrar, use o link abaixo:' : 'Para definir uma nova senha no LS Office Rumo, use o link abaixo:',
        '', url, '',
        `O link vale por ${horas} horas e só pode ser usado uma vez. Seu login é ${usuario.email}.`,
    ].join('\n');
    const copiar = async () => {
        try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* seleciona manualmente */ }
    };
    return (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{convite ? 'Convite gerado' : 'Link de redefinição gerado'}</h3>
                    <button onClick={onClose} aria-label="Fechar" title="Fechar" className="text-muted-foreground"><X size={20} aria-hidden /></button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Envie este link para <b className="text-foreground">{usuario.nome}</b> ({usuario.email}). Ele vale até{' '}
                    {new Date(expira).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} e <b className="text-foreground">não aparece de novo</b> — se perder, gere outro.
                </p>
                <div className="break-all rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs">{url}</div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={copiar} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold"><Copy size={15} aria-hidden /> {copiado ? 'Copiado!' : 'Copiar link'}</button>
                    <a href={`mailto:${usuario.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Mail size={15} aria-hidden /> Enviar pelo Outlook</a>
                </div>
            </div>
        </div>
    );
}
