import { useEffect, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import MinhaAssinaturaEmail from '../components/perfil/MinhaAssinaturaEmail';
import { authFetch } from '../lib/authFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Meu Perfil — o que pertence ao usuário, não à LS Office.
//
// A separação é deliberada: Configurações trata da empresa (CNPJ, contas,
// cartões, roteamento de e-mail) e é compartilhada; aqui ficam dados pessoais,
// senha e a assinatura de e-mail individual. Nenhum template pode embutir nome,
// contato ou imagem de pessoa — ver docs/HANDOFF-ASSINATURA-EMAIL.md.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'dados' | 'acesso' | 'assinatura';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'dados', rotulo: 'Dados pessoais' },
  { id: 'acesso', rotulo: 'Acesso e senha' },
  { id: 'assinatura', rotulo: 'Assinatura de e-mail' },
];

const inputClass = 'h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary';
const botaoClass = 'inline-flex h-9 items-center justify-center rounded-lg border border-border bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50';

export default function MeuPerfil() {
  const [aba, setAba] = useState<Aba>('dados');
  const [perfil, setPerfil] = useState<any>(null);
  const [senha, setSenha] = useState({ senha_atual: '', nova_senha: '', confirmar: '' });
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    authFetch('/api/profile')
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body;
      })
      .then(setPerfil)
      .catch(e => setErro(e.message));
  }, []);

  function avisar(texto: string) {
    setErro('');
    setMensagem(texto);
    setTimeout(() => setMensagem(''), 3500);
  }

  async function salvarPerfil() {
    const r = await authFetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(perfil),
    });
    const body = await r.json();
    if (!r.ok) return setErro(body.error || 'Erro ao salvar perfil');

    setPerfil(body);
    // A sidebar lê o usuário do localStorage; sem o evento ela continuaria
    // mostrando o nome antigo até o próximo login.
    const cache = JSON.parse(localStorage.getItem('ls_auth_user') || '{}');
    localStorage.setItem('ls_auth_user', JSON.stringify({ ...cache, ...body }));
    window.dispatchEvent(new Event('lsi:user-updated'));
    avisar('Perfil atualizado.');
  }

  async function alterarSenha() {
    if (senha.nova_senha !== senha.confirmar) return setErro('A confirmação da nova senha não confere');
    const r = await authFetch('/api/profile/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(senha),
    });
    const body = await r.json();
    if (!r.ok) return setErro(body.error || 'Erro ao alterar senha');

    setSenha({ senha_atual: '', nova_senha: '', confirmar: '' });
    avisar('Senha alterada.');
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-5">
      <div>
        <h1 className="text-xl font-extrabold text-[hsl(var(--titulo))]">Meu perfil</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Dados e preferências pertencem ao seu usuário, não à configuração da LS Office.
        </p>
      </div>

      {(erro || mensagem) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          erro ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
        }`}>
          {erro || mensagem}
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`rounded-lg border px-4 py-2 text-xs font-bold ${
              aba === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === 'dados' && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <UserRound size={16} />Dados pessoais e profissionais
          </h2>
          {!perfil ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Nome completo">
                <input className={inputClass} value={perfil.nome || ''} onChange={e => setPerfil({ ...perfil, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Nome de exibição">
                <input className={inputClass} value={perfil.nome_exibicao || ''} onChange={e => setPerfil({ ...perfil, nome_exibicao: e.target.value })} />
              </Campo>
              <Campo rotulo="Cargo / função">
                <input className={inputClass} value={perfil.cargo || ''} onChange={e => setPerfil({ ...perfil, cargo: e.target.value })} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className={inputClass} value={perfil.telefone || ''} onChange={e => setPerfil({ ...perfil, telefone: e.target.value })} />
              </Campo>

              {/* E-mail e papel de acesso são geridos pelo administrador. */}
              <Campo rotulo="E-mail de acesso">
                <input className={`${inputClass} opacity-70`} value={perfil.email || ''} disabled />
              </Campo>
              <Campo rotulo="Perfil de acesso">
                <input className={`${inputClass} opacity-70`} value={perfil.role || ''} disabled />
              </Campo>

              <div className="md:col-span-2">
                <button className={botaoClass} onClick={salvarPerfil}>Salvar perfil</button>
              </div>
            </div>
          )}
        </section>
      )}

      {aba === 'acesso' && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <KeyRound size={16} />Alterar senha
          </h2>
          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            <Campo rotulo="Senha atual">
              <input type="password" className={inputClass} value={senha.senha_atual} onChange={e => setSenha({ ...senha, senha_atual: e.target.value })} />
            </Campo>
            <div />
            <Campo rotulo="Nova senha">
              <input type="password" className={inputClass} value={senha.nova_senha} onChange={e => setSenha({ ...senha, nova_senha: e.target.value })} />
            </Campo>
            <Campo rotulo="Confirmar nova senha">
              <input type="password" className={inputClass} value={senha.confirmar} onChange={e => setSenha({ ...senha, confirmar: e.target.value })} />
            </Campo>
            <button className={botaoClass} onClick={alterarSenha}>Alterar senha</button>
          </div>
        </section>
      )}

      {aba === 'assinatura' && <MinhaAssinaturaEmail />}
    </main>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      <span>{rotulo}</span>
      {children}
    </label>
  );
}
