import { useEffect, useMemo, useState } from 'react';
import { Building2, ImageUp, Plus, Save, Search, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import MunicipioInput from '../components/cadastros/MunicipioInput';
import { UFS, normalizarUf } from '../components/atividades/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Clientes — cadastro mestre de clientes, sharings e operadoras.
//
// Esta tela substitui o `TabClientes()` do monólito, que guardava tudo em
// `ls_clientes_v2` no localStorage. A fonte canônica agora é `Contratante`; a
// tabela `Operadora` continua existindo apenas como histórico de migração.
// Os logos usados no cabeçalho dos documentos (cronograma etc.) saem daqui.
// ─────────────────────────────────────────────────────────────────────────────

interface Cliente {
  id: string;
  nome: string;
  razao_social: string | null;
  sigla: string | null;
  tipo: string;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  logo_url: string | null;
}

const FORM_INIT = {
  nome: '', razao_social: '', sigla: '', tipo: 'CLIENTE', cnpj: '',
  contato_nome: '', contato_email: '', contato_telefone: '',
  endereco: '', cidade: '', uf: '', ativo: true,
};

/**
 * Um mesmo cadastro pode ser sharing e operadora ao mesmo tempo (a Vivo é
 * operadora numa atividade e contratante em outra) — por isso o quarto tipo.
 */
const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: 'CLIENTE', rotulo: 'Cliente' },
  { valor: 'SHARING', rotulo: 'Sharing' },
  { valor: 'OPERADORA', rotulo: 'Operadora' },
  { valor: 'SHARING_OPERADORA', rotulo: 'Sharing e operadora' },
];
const TIPO_ROTULO: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.valor, t.rotulo]));

const inputClass = 'h-9 w-full rounded-lg border border-border bg-secondary px-3 text-xs text-foreground outline-none focus:border-primary';

export default function Clientes() {
  const [itens, setItens] = useState<Cliente[]>([]);
  const [form, setForm] = useState<any>(FORM_INIT);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [mostrarInativos, setMostrarInativos] = useState(true);

  async function carregar() {
    const r = await authFetch('/api/clientes');
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setItens(body);
  }

  useEffect(() => { carregar().catch(e => setErro(e.message)); }, []);

  async function salvar() {
    setErro('');
    const r = await authFetch(editando ? `/api/clientes/${editando}` : '/api/clientes', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const body = await r.json();
    if (!r.ok) return setErro(body.error || 'Erro ao salvar');
    setForm(FORM_INIT);
    setEditando(null);
    await carregar();
  }

  function editar(item: Cliente) {
    setEditando(item.id);
    setForm({ ...FORM_INIT, ...item });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditando(null);
    setForm(FORM_INIT);
  }

  async function enviarLogo(id: string, arquivo: File) {
    const data = new FormData();
    data.append('logo', arquivo);
    const r = await authFetch(`/api/clientes/${id}/logo`, { method: 'POST', body: data });
    if (!r.ok) return setErro((await r.json()).error);
    await carregar();
  }

  async function alternarAtivo(item: Cliente) {
    const r = await authFetch(`/api/clientes/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, ativo: !item.ativo }),
    });
    if (!r.ok) return setErro((await r.json()).error);
    await carregar();
  }

  // A busca cobre nome, razão social, sigla e CNPJ: é por qualquer um deles que
  // o cadastro é procurado na prática.
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter(item => {
      if (!mostrarInativos && !item.ativo) return false;
      if (filtroTipo !== 'TODOS' && item.tipo !== filtroTipo) return false;
      if (!termo) return true;
      return [item.nome, item.razao_social, item.sigla, item.cnpj]
        .some(campo => String(campo || '').toLowerCase().includes(termo));
    });
  }, [itens, busca, filtroTipo, mostrarInativos]);

  const inativos = itens.filter(i => !i.ativo).length;

  return (
    <main className="space-y-4 p-5">
      <div>
        <h1 className="text-xl font-extrabold text-[hsl(var(--titulo))]">Clientes</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Cadastro mestre de clientes, sharings e operadoras. Os logos usados nos documentos passam a sair daqui.
        </p>
      </div>

      {erro && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">{erro}</div>}

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
          <Plus size={15} />{editando ? 'Editar cliente' : 'Novo cliente'}
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Nome *">
            <input className={inputClass} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="Razão social">
            <input className={inputClass} value={form.razao_social || ''} onChange={e => setForm({ ...form, razao_social: e.target.value })} />
          </Campo>
          <Campo rotulo="Sigla">
            <input className={inputClass} value={form.sigla || ''} onChange={e => setForm({ ...form, sigla: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo">
            <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
          </Campo>

          <Campo rotulo="CNPJ">
            <input className={inputClass} value={form.cnpj || ''} onChange={e => setForm({ ...form, cnpj: e.target.value })} />
          </Campo>
          <Campo rotulo="Contato">
            <input className={inputClass} value={form.contato_nome || ''} onChange={e => setForm({ ...form, contato_nome: e.target.value })} />
          </Campo>
          <Campo rotulo="E-mail">
            <input className={inputClass} value={form.contato_email || ''} onChange={e => setForm({ ...form, contato_email: e.target.value })} />
          </Campo>
          <Campo rotulo="Telefone">
            <input className={inputClass} value={form.contato_telefone || ''} onChange={e => setForm({ ...form, contato_telefone: e.target.value })} />
          </Campo>

          <Campo rotulo="Endereço">
            <input className={inputClass} value={form.endereco || ''} onChange={e => setForm({ ...form, endereco: e.target.value })} />
          </Campo>
          <Campo rotulo="UF">
            <select className={inputClass} value={normalizarUf(form.uf) || ''}
              onChange={e => setForm({ ...form, uf: e.target.value, cidade: e.target.value === normalizarUf(form.uf) ? form.cidade : '' })}>
              <option value="">Selecione</option>
              {UFS.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Cidade">
            <MunicipioInput uf={normalizarUf(form.uf)} value={form.cidade || ''} className={inputClass}
              onChange={nome => setForm({ ...form, cidade: nome })} />
          </Campo>
          <div className="flex items-end gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
              disabled={!form.nome.trim()}
              onClick={salvar}
            >
              <Save size={14} />Salvar
            </button>
            {editando && (
              <button className="h-9 rounded-lg border border-border px-3 text-xs" onClick={cancelarEdicao}>Cancelar</button>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputClass} pl-9 pr-8`}
            placeholder="Buscar por nome, razão social, sigla ou CNPJ..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ valor: 'TODOS', rotulo: 'Todos' }, ...TIPOS].map(t => (
            <button
              key={t.valor}
              onClick={() => setFiltroTipo(t.valor)}
              className={`h-9 rounded-lg border px-3 text-xs font-bold ${
                filtroTipo === t.valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        {inativos > 0 && (
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs">
            <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
            Mostrar inativos ({inativos})
          </label>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          {itens.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cadastro corresponde ao filtro.'}
        </p>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map(item => (
            // Inativo precisa ser visível no cartão, não só no rótulo do botão:
            // um cadastro desligado que parece ativo volta a ser usado por engano.
            <article
              key={item.id}
              className={`rounded-xl border bg-card p-4 ${item.ativo ? 'border-border' : 'border-border/50 opacity-60'}`}
            >
              <div className="flex gap-3">
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-white p-2">
                  {item.logo_url
                    ? <img src={item.logo_url} alt={item.nome} className="max-h-full max-w-full object-contain" />
                    : <Building2 className="text-slate-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{item.nome}</span>
                    {!item.ativo && (
                      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {TIPO_ROTULO[item.tipo] || item.tipo}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {item.razao_social || item.cnpj || 'Sem dados fiscais'}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => editar(item)} className="h-8 rounded-lg border border-border px-3 text-xs font-bold">
                  Editar
                </button>
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold">
                  <ImageUp size={13} />Logo
                  <input
                    type="file"
                    accept="image/*,.svg"
                    hidden
                    onChange={e => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = '';
                      if (arquivo) enviarLogo(item.id, arquivo);
                    }}
                  />
                </label>
                <button onClick={() => alternarAtivo(item)} className="ml-auto h-8 rounded-lg border border-border px-3 text-xs">
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      <span>{rotulo}</span>
      {children}
    </label>
  );
}
