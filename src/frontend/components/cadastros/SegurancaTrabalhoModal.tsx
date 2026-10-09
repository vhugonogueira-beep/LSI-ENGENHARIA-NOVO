import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Paperclip, Pencil, Plus, ShieldCheck, Trash2, Upload, UserPlus, Users, X,
} from 'lucide-react';
import { ErrorBanner, inputClass } from '../atividades/ui';
import { downloadAuthenticatedFile } from '../../lib/authFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Segurança do trabalho do prestador (09/10/2026): documentos pessoais e de SST
// com anexo e validade, trabalhos que executa (cada um exige seus certificados),
// equipe com os documentos de cada membro. Pendência só avisa, não bloqueia.
// ─────────────────────────────────────────────────────────────────────────────

interface DocCatalogo { codigo: string; nome: string; meses: number; grupo: string; personalizado?: boolean; id?: string }
interface TrabCatalogo { codigo: string; nome: string; exige: string[]; personalizado?: boolean; id?: string }
interface Catalogo { documentos: DocCatalogo[]; trabalhos: TrabCatalogo[] }
interface Arquivo { id: string; nome_original: string; tamanho_bytes: number }
interface Documento {
    id: string; tipo: string; rotulo: string; descricao?: string | null; numero?: string | null; entidade?: string | null;
    data_emissao?: string | null; data_validade?: string | null; situacao: string; diasRestantes: number | null; arquivos: Arquivo[];
}
interface Pendencia { pessoa: string; codigo: string; documento: string; motivo: 'FALTANDO' | 'VENCIDO' | 'VENCE_EM_BREVE'; dias?: number | null }
interface Resumo { situacao: 'EM_DIA' | 'VENCE_EM_BREVE' | 'PENDENTE' | 'NAO_SE_APLICA'; pendencias: number; vencendo: number }
interface Membro {
    id: string; nome: string; cpf?: string | null; rg?: string | null; funcao?: string | null; telefone?: string | null;
    sst_trabalhos: string[]; documentos: Documento[]; exigidos: string[]; pendencias: Pendencia[]; resumo: Resumo;
}
interface DadosSst {
    aplica: boolean; trabalhos: string[]; documentos: Documento[]; exigidos: string[]; pendencias: Pendencia[];
    membros: Membro[]; resumo: Resumo; pendencias_total: Pendencia[];
}

const GRUPO_ROTULO: Record<string, string> = { PESSOAL: 'Documentos pessoais', SST: 'Saúde e segurança', EMPRESA: 'Documentos da empresa' };
const dataBr = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const paraInput = (v?: string | null) => (v ? v.slice(0, 10) : '');

async function enviar(url: string, metodo: string, corpo?: unknown) {
    const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
    return r.status === 204 ? null : r.json();
}

/** Selo de situação: o mesmo no cartão do fornecedor e aqui dentro. */
export function SeloSst({ resumo, onClick, compacto }: { resumo?: Resumo | null; onClick?: () => void; compacto?: boolean }) {
    if (!resumo || resumo.situacao === 'NAO_SE_APLICA') return null;
    const cfg = resumo.situacao === 'PENDENTE'
        ? { cls: 'border-crit/40 bg-crit/10 text-crit', icone: AlertTriangle, texto: `${resumo.pendencias} pendência(s) de SST${resumo.vencendo ? ` · ${resumo.vencendo} vencendo` : ''}` }
        : resumo.situacao === 'VENCE_EM_BREVE'
            ? { cls: 'border-warn/40 bg-warn/10 text-warn', icone: AlertTriangle, texto: `${resumo.vencendo} documento(s) vencendo em até 30 dias` }
            : { cls: 'border-ok/40 bg-ok/10 text-ok', icone: CheckCircle2, texto: 'SST em dia' };
    const Icone = cfg.icone;
    const conteudo = <><Icone size={14} aria-hidden className="shrink-0" /> <span className={compacto ? 'truncate' : ''}>{cfg.texto}</span></>;
    const base = `inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`;
    return onClick
        ? <button type="button" onClick={onClick} className={`${base} hover:brightness-110`} title="Abrir segurança do trabalho">{conteudo}</button>
        : <span className={base}>{conteudo}</span>;
}

function PillDocumento({ d }: { d: Documento }) {
    if (d.situacao === 'VENCIDO') return <span className="rounded-full bg-crit/10 px-2 py-0.5 text-[11px] font-semibold text-crit">Vencido há {Math.abs(d.diasRestantes || 0)} dia(s)</span>;
    if (d.situacao === 'VENCE_EM_BREVE') return <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">Vence em {d.diasRestantes} dia(s)</span>;
    if (d.situacao === 'VALIDO') return <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">Válido até {dataBr(d.data_validade)}</span>;
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Sem vencimento</span>;
}

const motivoTexto = (p: Pendencia) => (p.motivo === 'FALTANDO' ? 'não enviado' : p.motivo === 'VENCIDO' ? 'vencido' : `vence em ${p.dias} dia(s)`);

/** Trabalhos que a pessoa executa: liga/desliga e salva na hora. */
function Trabalhos({ catalogo, marcados, onMudar, onNovo }: { catalogo: Catalogo; marcados: string[]; onMudar: (t: string[]) => void; onNovo: () => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {catalogo.trabalhos.map(t => {
                const ativo = marcados.includes(t.codigo);
                const exige = t.exige.map(c => catalogo.documentos.find(d => d.codigo === c)?.nome.split(' — ')[0] || c).join(', ');
                return (
                    <button key={t.codigo} type="button" aria-pressed={ativo} title={`Exige: ${exige}`}
                        onClick={() => onMudar(ativo ? marcados.filter(x => x !== t.codigo) : [...marcados, t.codigo])}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {ativo && <CheckCircle2 size={14} aria-hidden />} {t.nome}
                        <span className={`font-normal ${ativo ? 'opacity-80' : 'opacity-70'}`}>· {exige}</span>
                    </button>
                );
            })}
            <button type="button" onClick={onNovo} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-semibold text-primary hover:bg-primary/10">
                <Plus size={14} aria-hidden /> Novo trabalho
            </button>
        </div>
    );
}

/** Lista de documentos de uma pessoa, com anexos e o formulário de inclusão. */
function Documentos({ docs, exigidos, catalogo, dono, onMudou, onNovoTipo, setErro }: {
    docs: Documento[]; exigidos: string[]; catalogo: Catalogo;
    dono: { supplier_id?: string; membro_id?: string };
    onMudou: () => void; onNovoTipo: () => void; setErro: (m: string) => void;
}) {
    const vazio = { tipo: '', descricao: '', numero: '', entidade: '', data_emissao: '', data_validade: '' };
    const [form, setForm] = useState<typeof vazio | null>(null);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [salvando, setSalvando] = useState(false);
    const faltando = exigidos.filter(c => !docs.some(d => d.tipo === c));
    const nome = (c: string) => catalogo.documentos.find(d => d.codigo === c)?.nome || c;

    const abrirNovo = (tipo = '') => { setEditandoId(null); setArquivo(null); setForm({ ...vazio, tipo }); };
    const abrirEdicao = (d: Documento) => {
        setEditandoId(d.id); setArquivo(null);
        setForm({ tipo: d.tipo, descricao: d.descricao || '', numero: d.numero || '', entidade: d.entidade || '', data_emissao: paraInput(d.data_emissao), data_validade: paraInput(d.data_validade) });
    };

    async function anexar(docId: string, f: File) {
        const fd = new FormData();
        fd.append('arquivo', f);
        const r = await fetch(`/api/sst/documentos/${docId}/arquivos`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao anexar o arquivo');
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        if (!form?.tipo) { setErro('Escolha o tipo de documento'); return; }
        setSalvando(true); setErro('');
        try {
            const corpo = { ...form, data_emissao: form.data_emissao || null, data_validade: form.data_validade || null };
            const doc = editandoId
                ? await enviar(`/api/qualificacoes/${editandoId}`, 'PUT', corpo)
                : await enviar('/api/qualificacoes', 'POST', { ...corpo, ...dono });
            if (arquivo) await anexar(doc.id, arquivo);
            setForm(null); setArquivo(null); setEditandoId(null);
            onMudou();
        } catch (er: any) { setErro(er.message); } finally { setSalvando(false); }
    }

    async function excluir(d: Documento) {
        if (!confirm(`Excluir o documento "${d.rotulo}" e os anexos dele?`)) return;
        try { await enviar(`/api/qualificacoes/${d.id}`, 'DELETE'); onMudou(); } catch (er: any) { setErro(er.message); }
    }
    async function excluirAnexo(a: Arquivo) {
        if (!confirm(`Excluir o anexo "${a.nome_original}"?`)) return;
        try { await enviar(`/api/sst/arquivos/${a.id}`, 'DELETE'); onMudou(); } catch (er: any) { setErro(er.message); }
    }
    async function anexarNoDoc(d: Documento, f?: File) {
        if (!f) return;
        try { await anexar(d.id, f); onMudou(); } catch (er: any) { setErro(er.message); }
    }

    const grupos = useMemo(() => {
        const g = new Map<string, DocCatalogo[]>();
        catalogo.documentos.forEach(d => g.set(d.grupo, [...(g.get(d.grupo) || []), d]));
        return [...g.entries()];
    }, [catalogo]);

    return (
        <div className="space-y-2">
            {faltando.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-crit/30 bg-crit/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-crit">Faltam:</span>
                    {faltando.map(c => (
                        <button key={c} type="button" onClick={() => abrirNovo(c)} title="Adicionar este documento"
                            className="inline-flex items-center gap-1 rounded-full border border-crit/40 px-2 py-0.5 font-semibold text-crit hover:bg-crit/10">
                            <Plus size={12} aria-hidden /> {nome(c)}
                        </button>
                    ))}
                </div>
            )}

            {docs.length === 0 && !faltando.length && <p className="text-xs text-muted-foreground">Nenhum documento enviado.</p>}
            {docs.map(d => (
                <div key={d.id} className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                                {d.rotulo} {exigidos.includes(d.tipo) && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">exigido</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {[d.numero && `Nº ${d.numero}`, d.entidade, d.data_emissao && `emitido em ${dataBr(d.data_emissao)}`].filter(Boolean).join(' · ') || 'Sem número ou emissor informado'}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <PillDocumento d={d} />
                            <button type="button" onClick={() => abrirEdicao(d)} aria-label={`Editar ${d.rotulo}`} title="Editar" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={14} aria-hidden /></button>
                            <button type="button" onClick={() => excluir(d)} aria-label={`Excluir ${d.rotulo}`} title="Excluir" className="rounded p-1.5 text-muted-foreground hover:bg-crit/10 hover:text-crit"><Trash2 size={14} aria-hidden /></button>
                        </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {d.arquivos.map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
                                <button type="button" onClick={() => downloadAuthenticatedFile(`/api/sst/arquivos/${a.id}`, a.nome_original)} className="inline-flex items-center gap-1 hover:text-primary hover:underline">
                                    <Paperclip size={12} aria-hidden /> {a.nome_original}
                                </button>
                                <button type="button" onClick={() => excluirAnexo(a)} aria-label={`Excluir o anexo ${a.nome_original}`} className="rounded p-0.5 text-muted-foreground hover:text-crit"><X size={12} aria-hidden /></button>
                            </span>
                        ))}
                        {d.arquivos.length === 0 && <span className="text-xs text-warn">Sem anexo</span>}
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10">
                            <Upload size={12} aria-hidden /> Anexar
                            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={e => { anexarNoDoc(d, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                    </div>
                </div>
            ))}

            {form ? (
                <form onSubmit={salvar} className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">Documento</span>
                            <div className="flex gap-2">
                                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} disabled={!!editandoId}>
                                    <option value="">Escolha…</option>
                                    {grupos.map(([g, lista]) => (
                                        <optgroup key={g} label={GRUPO_ROTULO[g] || g}>
                                            {lista.map(d => <option key={d.codigo} value={d.codigo}>{d.nome}{exigidos.includes(d.codigo) ? ' (exigido)' : ''}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                                {!editandoId && <button type="button" onClick={onNovoTipo} className="shrink-0 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-primary/10">Novo tipo</button>}
                            </div>
                        </label>
                        {form.tipo === 'OUTRO' && (
                            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">Qual documento</span>
                                <input className={inputClass} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Certificado de solda" /></label>
                        )}
                        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Número</span>
                            <input className={inputClass} value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} /></label>
                        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Emitido por</span>
                            <input className={inputClass} value={form.entidade} onChange={e => setForm({ ...form, entidade: e.target.value })} placeholder="Ex.: SSP/PA, SENAI" /></label>
                        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Data de emissão</span>
                            <input type="date" className={inputClass} value={form.data_emissao} onChange={e => setForm({ ...form, data_emissao: e.target.value })} /></label>
                        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Validade</span>
                            <input type="date" className={inputClass} value={form.data_validade} onChange={e => setForm({ ...form, data_validade: e.target.value })} />
                            {!form.data_validade && (catalogo.documentos.find(d => d.codigo === form.tipo)?.meses || 0) > 0 && (
                                <span className="mt-1 block text-[11px] text-muted-foreground">Em branco: calculada pela emissão ({catalogo.documentos.find(d => d.codigo === form.tipo)?.meses} meses).</span>
                            )}
                        </label>
                        <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">Anexo (PDF ou foto)</span>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={e => setArquivo(e.target.files?.[0] || null)}
                                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold" /></label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setForm(null); setEditandoId(null); }} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60">Cancelar</button>
                        <button type="submit" disabled={salvando} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {salvando ? 'Salvando…' : editandoId ? 'Salvar documento' : 'Adicionar documento'}
                        </button>
                    </div>
                </form>
            ) : (
                <button type="button" onClick={() => abrirNovo()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">
                    <FileText size={14} aria-hidden /> Adicionar documento
                </button>
            )}
        </div>
    );
}

/** Criar trabalho (com documentos exigidos) ou tipo de documento novo. */
function NovoItemCatalogo({ tipo, catalogo, onFechar, onCriado }: { tipo: 'TRABALHO' | 'DOCUMENTO'; catalogo: Catalogo; onFechar: () => void; onCriado: () => void }) {
    const [nome, setNome] = useState('');
    const [meses, setMeses] = useState('0');
    const [exige, setExige] = useState<string[]>([]);
    const [erro, setErro] = useState('');
    async function criar(e: React.FormEvent) {
        e.preventDefault(); setErro('');
        try { await enviar('/api/sst/catalogo', 'POST', { tipo, nome, meses: Number(meses), exige }); onCriado(); } catch (er: any) { setErro(er.message); }
    }
    return (
        <div className="fixed inset-0 z-[9700] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
            <form role="dialog" aria-modal="true" onSubmit={criar} onClick={e => e.stopPropagation()} className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl">
                <h3 className="text-base font-bold">{tipo === 'TRABALHO' ? 'Novo trabalho' : 'Novo tipo de documento'}</h3>
                <p className="text-xs text-muted-foreground">{tipo === 'TRABALHO'
                    ? 'Fica disponível para todos os prestadores. Quem marcar este trabalho passa a precisar dos documentos escolhidos.'
                    : 'Fica disponível para todos os prestadores e membros de equipe.'}</p>
                <ErrorBanner message={erro} />
                <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Nome</span>
                    <input autoFocus className={inputClass} value={nome} onChange={e => setNome(e.target.value)} placeholder={tipo === 'TRABALHO' ? 'Ex.: Solda e corte a quente' : 'Ex.: NR-34 — Solda'} /></label>
                {tipo === 'DOCUMENTO' ? (
                    <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Validade usual (meses; 0 = não vence)</span>
                        <input type="number" min={0} max={120} className={inputClass} value={meses} onChange={e => setMeses(e.target.value)} /></label>
                ) : (
                    <div><span className="mb-1 block text-xs font-medium text-muted-foreground">Documentos exigidos</span>
                        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                            {catalogo.documentos.filter(d => d.codigo !== 'OUTRO').map(d => {
                                const ativo = exige.includes(d.codigo);
                                return <button key={d.codigo} type="button" aria-pressed={ativo} onClick={() => setExige(ativo ? exige.filter(x => x !== d.codigo) : [...exige, d.codigo])}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{d.nome}</button>;
                            })}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Se o documento não estiver na lista, crie antes o tipo de documento.</p>
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onFechar} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60">Cancelar</button>
                    <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Criar</button>
                </div>
            </form>
        </div>
    );
}

function FormMembro({ inicial, onSalvar, onCancelar }: { inicial: Partial<Membro>; onSalvar: (m: any) => Promise<void>; onCancelar: () => void }) {
    const [m, setM] = useState({ nome: inicial.nome || '', cpf: inicial.cpf || '', rg: inicial.rg || '', funcao: inicial.funcao || '', telefone: inicial.telefone || '' });
    const [salvando, setSalvando] = useState(false);
    const campo = (k: keyof typeof m, rotulo: string, ph = '') => (
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</span>
            <input className={inputClass} value={m[k]} placeholder={ph} onChange={e => setM({ ...m, [k]: e.target.value })} /></label>
    );
    return (
        <form onSubmit={async e => { e.preventDefault(); setSalvando(true); try { await onSalvar(m); } finally { setSalvando(false); } }}
            className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">{campo('nome', 'Nome completo')}</div>
                {campo('cpf', 'CPF', '000.000.000-00')}
                {campo('rg', 'RG')}
                {campo('funcao', 'Função', 'Ex.: Eletricista, Ajudante')}
                {campo('telefone', 'Telefone')}
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancelar} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary/60">Cancelar</button>
                <button type="submit" disabled={salvando || !m.nome.trim()} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {salvando ? 'Salvando…' : inicial.id ? 'Salvar membro' : 'Adicionar à equipe'}
                </button>
            </div>
        </form>
    );
}

export default function SegurancaTrabalhoModal({ supplier, onClose, onMudou }: {
    supplier: { id: string; nome: string; tipo?: string | null };
    onClose: () => void;
    /** Avisa a lista para atualizar o selo do cartão. */
    onMudou?: () => void;
}) {
    const [dados, setDados] = useState<DadosSst | null>(null);
    const [catalogo, setCatalogo] = useState<Catalogo>({ documentos: [], trabalhos: [] });
    const [erro, setErro] = useState('');
    const [novoItem, setNovoItem] = useState<'TRABALHO' | 'DOCUMENTO' | null>(null);
    const [membroForm, setMembroForm] = useState<Partial<Membro> | null>(null);
    const [aberto, setAberto] = useState<Record<string, boolean>>({});
    const pj = supplier.tipo === 'PESSOA_JURIDICA';

    const carregar = useCallback(async () => {
        const [d, c] = await Promise.all([enviar(`/api/sst/fornecedores/${supplier.id}`, 'GET'), enviar('/api/sst/catalogo', 'GET')]);
        setDados(d); setCatalogo(c);
    }, [supplier.id]);
    useEffect(() => { carregar().catch(e => setErro(e.message)); }, [carregar]);
    const recarregar = () => { carregar().catch(e => setErro(e.message)); onMudou?.(); };

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !novoItem && !membroForm) onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose, novoItem, membroForm]);

    async function trabalhosDoFornecedor(t: string[]) {
        setErro('');
        try { setDados(await enviar(`/api/sst/fornecedores/${supplier.id}/trabalhos`, 'PUT', { trabalhos: t })); onMudou?.(); } catch (e: any) { setErro(e.message); }
    }
    async function trabalhosDoMembro(m: Membro, t: string[]) {
        setErro('');
        try { await enviar(`/api/sst/membros/${m.id}`, 'PUT', { sst_trabalhos: t }); recarregar(); } catch (e: any) { setErro(e.message); }
    }
    async function salvarMembro(v: any) {
        setErro('');
        try {
            if (membroForm?.id) await enviar(`/api/sst/membros/${membroForm.id}`, 'PUT', v);
            // Membro novo começa com os trabalhos do prestador; dá para ajustar depois.
            else { const novo = await enviar('/api/sst/membros', 'POST', { ...v, supplier_id: supplier.id, sst_trabalhos: dados?.trabalhos || [] }); setAberto(a => ({ ...a, [novo.id]: true })); }
            setMembroForm(null); recarregar();
        } catch (e: any) { setErro(e.message); }
    }
    async function removerMembro(m: Membro) {
        if (!confirm(`Tirar ${m.nome} da equipe? Os documentos ficam guardados no histórico.`)) return;
        try { await enviar(`/api/sst/membros/${m.id}`, 'DELETE'); recarregar(); } catch (e: any) { setErro(e.message); }
    }

    return (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-sst" onClick={e => e.stopPropagation()}
                className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card text-foreground shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2 id="titulo-sst" className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} aria-hidden /> Segurança do trabalho</h2>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{supplier.nome}</p>
                        {dados && <div className="mt-2"><SeloSst resumo={dados.resumo} /></div>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"><X size={18} aria-hidden /></button>
                </header>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
                    <ErrorBanner message={erro} />
                    {!dados ? <p className="text-sm text-muted-foreground">Carregando…</p> : !dados.aplica ? (
                        <p className="text-sm text-muted-foreground">Fornecedor de material ou equipamento: segurança do trabalho não se aplica.</p>
                    ) : (
                        <>
                            {dados.pendencias_total.length > 0 && (
                                <section className="rounded-lg border border-warn/40 bg-warn/5 px-4 py-3">
                                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle size={16} aria-hidden /> O que falta</h3>
                                    <ul className="space-y-0.5 text-xs">
                                        {dados.pendencias_total.map((p, i) => <li key={i}><b className="font-semibold">{p.pessoa}</b>: {p.documento} — {motivoTexto(p)}</li>)}
                                    </ul>
                                    <p className="mt-2 text-[11px] text-muted-foreground">Só um aviso: a contratação continua liberada.</p>
                                </section>
                            )}

                            <section>
                                <h3 className="mb-1 text-sm font-semibold">Trabalhos que {pj ? 'a empresa' : 'o prestador'} realiza</h3>
                                <p className="mb-2 text-xs text-muted-foreground">
                                    {pj ? 'Na empresa (PJ), os certificados são cobrados de cada membro da equipe, conforme os trabalhos marcados para ele.' : 'Cada trabalho marcado passa a exigir os certificados indicados.'}
                                </p>
                                <Trabalhos catalogo={catalogo} marcados={dados.trabalhos} onMudar={trabalhosDoFornecedor} onNovo={() => setNovoItem('TRABALHO')} />
                            </section>

                            <section>
                                <h3 className="mb-2 text-sm font-semibold">{pj ? 'Documentos da empresa' : 'Documentos do prestador'}</h3>
                                <Documentos docs={dados.documentos} exigidos={dados.exigidos} catalogo={catalogo} dono={{ supplier_id: supplier.id }}
                                    onMudou={recarregar} onNovoTipo={() => setNovoItem('DOCUMENTO')} setErro={setErro} />
                            </section>

                            <section>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Users size={16} aria-hidden /> Equipe <span className="font-normal text-muted-foreground">({dados.membros.length})</span></h3>
                                    {!membroForm && (
                                        <button type="button" onClick={() => setMembroForm({})} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60">
                                            <UserPlus size={14} aria-hidden /> Adicionar membro
                                        </button>
                                    )}
                                </div>
                                {membroForm && !membroForm.id && <div className="mb-2"><FormMembro inicial={membroForm} onSalvar={salvarMembro} onCancelar={() => setMembroForm(null)} /></div>}
                                {dados.membros.length === 0 && !membroForm && <p className="text-xs text-muted-foreground">Nenhum membro cadastrado. Cadastre quem vai a campo junto com o prestador.</p>}
                                <div className="space-y-2">
                                    {dados.membros.map(m => {
                                        const abertoM = !!aberto[m.id];
                                        return (
                                            <div key={m.id} className="rounded-lg border border-border">
                                                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                                                    <button type="button" onClick={() => setAberto(a => ({ ...a, [m.id]: !abertoM }))} aria-expanded={abertoM}
                                                        className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                                        {abertoM ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-semibold">{m.nome}</span>
                                                            <span className="block text-xs text-muted-foreground">{[m.funcao, m.cpf && `CPF ${m.cpf}`, m.telefone].filter(Boolean).join(' · ') || 'Sem dados complementares'}</span>
                                                        </span>
                                                    </button>
                                                    <SeloSst resumo={m.resumo} />
                                                    <button type="button" onClick={() => setMembroForm(m)} aria-label={`Editar ${m.nome}`} title="Editar dados" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={14} aria-hidden /></button>
                                                    <button type="button" onClick={() => removerMembro(m)} aria-label={`Tirar ${m.nome} da equipe`} title="Tirar da equipe" className="rounded p-1.5 text-muted-foreground hover:bg-crit/10 hover:text-crit"><Trash2 size={14} aria-hidden /></button>
                                                </div>
                                                {membroForm?.id === m.id && <div className="px-3 pb-3"><FormMembro inicial={m} onSalvar={salvarMembro} onCancelar={() => setMembroForm(null)} /></div>}
                                                {abertoM && (
                                                    <div className="space-y-4 border-t border-border px-3 py-3">
                                                        <div>
                                                            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Trabalhos que realiza</p>
                                                            <Trabalhos catalogo={catalogo} marcados={m.sst_trabalhos} onMudar={t => trabalhosDoMembro(m, t)} onNovo={() => setNovoItem('TRABALHO')} />
                                                        </div>
                                                        <div>
                                                            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Documentos</p>
                                                            <Documentos docs={m.documentos} exigidos={m.exigidos} catalogo={catalogo} dono={{ membro_id: m.id }}
                                                                onMudou={recarregar} onNovoTipo={() => setNovoItem('DOCUMENTO')} setErro={setErro} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
            {novoItem && <NovoItemCatalogo tipo={novoItem} catalogo={catalogo} onFechar={() => setNovoItem(null)} onCriado={() => { setNovoItem(null); recarregar(); }} />}
        </div>
    );
}
