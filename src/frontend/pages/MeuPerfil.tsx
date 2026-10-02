import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, UserRound, Mail, User, type LucideIcon } from 'lucide-react';
import { TEXTO, TOM_MODULO, type Tom } from '../lib/cores';
import PageHeader from '../components/PageHeader';
import MinhaAssinaturaEmail from '../components/perfil/MinhaAssinaturaEmail';
import { authFetch } from '../lib/authFetch';
import { useSessao } from '../lib/permissoes';

// ─────────────────────────────────────────────────────────────────────────────
// Meu Perfil — o que pertence ao usuário, não à LS Office.
//
// A separação é deliberada: Configurações trata da empresa (CNPJ, contas,
// cartões, roteamento de e-mail) e é compartilhada; aqui ficam dados pessoais,
// senha e a assinatura de e-mail individual. Nenhum template pode embutir nome,
// contato ou imagem de pessoa — ver docs/HANDOFF-ASSINATURA-EMAIL.md.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'dados' | 'acesso' | 'assinatura';

// Cada aba com o seu ícone e a sua cor (lib/cores.ts); a ativa segue azul de ação.
const ABAS: { id: Aba; rotulo: string; icone: LucideIcon; tom: Tom }[] = [
  { id: 'dados', rotulo: 'Dados pessoais', icone: UserRound, tom: 'blue' },
  { id: 'acesso', rotulo: 'Acesso e senha', icone: KeyRound, tom: 'amber' },
  { id: 'assinatura', rotulo: 'Assinatura de e-mail', icone: Mail, tom: 'cyan' },
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
    // Alinhado à esquerda como as demais telas (antes centralizado em 5xl,
    // o título ficava fora da linha dos outros módulos).
    <main className="max-w-[1088px] space-y-4 p-8 text-foreground">
      <PageHeader icone={User} tom={TOM_MODULO.perfil} titulo="Meu perfil"
        descricao="Dados e preferências pertencem ao seu usuário, não à configuração da LS Office." />

      {(erro || mensagem) && (
        <div role={erro ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-xs ${
          erro ? 'border-crit/40 bg-crit/10 text-crit' : 'border-ok/40 bg-ok/10 text-ok'
        }`}>
          {erro || mensagem}
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {ABAS.map(({ id, rotulo, icone: Icone, tom }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            aria-pressed={aba === id}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold ${
              aba === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
            }`}
          >
            <Icone size={14} aria-hidden className={aba === id ? '' : TEXTO[tom]} />
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === 'dados' && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <UserRound size={16} aria-hidden />Dados pessoais e profissionais
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
                <input className={`${inputClass} opacity-70`} value={perfil.role === 'ADMIN' ? 'Administrador' : 'Usuário'} disabled />
              </Campo>

              <div className="md:col-span-2">
                <Campo rotulo="Sempre copiar nos e-mails que eu gerar (CC)">
                  <input className={inputClass} value={perfil.email_cc_padrao || ''} placeholder="gestor@lsoffice.com.br; outro@lsoffice.com.br"
                    onChange={e => setPerfil({ ...perfil, email_cc_padrao: e.target.value })} />
                </Campo>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Somado aos destinatários definidos em Configurações, aba Comunicação, nas solicitações de pagamento, reembolso e faturamento.
                </p>
              </div>

              <div className="md:col-span-2">
                <button className={botaoClass} onClick={salvarPerfil}>Salvar perfil</button>
              </div>
            </div>
          )}
        </section>
      )}

      {aba === 'acesso' && <MeuAcesso />}

      {aba === 'acesso' && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <KeyRound size={16} aria-hidden />Alterar senha
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

// O que a pessoa pode fazer — só leitura; quem altera é o administrador.
const ROTULO_PERMISSAO: Record<string, string> = {
  'atividades.gerenciar': 'Atividades e projetos',
  'orcamentos.gerenciar': 'Orçamentos',
  'pagamentos.solicitar': 'Solicitar pagamentos e anexar comprovantes',
  'pagamentos.baixar': 'Registrar pagamentos',
  'pagamentos.aprovar': 'Aprovar pagamentos',
  'faturamento.gerenciar': 'PO e faturamento',
  'cadastros.gerenciar': 'Cadastros',
  'configuracoes.gerenciar': 'Configurações',
};

function MeuAcesso() {
  const sessao = useSessao();
  if (!sessao) return null;
  const admin = sessao.role === 'ADMIN';
  const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const aprova = admin || sessao.permissoes.includes('pagamentos.aprovar');
  const regra = aprova ? 'Você aprova pagamentos — suas solicitações não passam por aprovação.'
    : sessao.aprovacao_pagamento === 'SEMPRE' ? 'Toda solicitação de pagamento sua passa por aprovação do administrador.'
      : sessao.aprovacao_pagamento === 'ACIMA_DO_LIMITE' ? `Você solicita sozinho até ${moeda(sessao.limite_pagamento ?? 0)}; acima disso, vai para aprovação.`
        : 'Você solicita pagamentos sem aprovação prévia.';
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} aria-hidden />O que você pode fazer</h2>
      <p className="mb-3 text-xs text-muted-foreground">Você vê o sistema inteiro. As ações abaixo foram liberadas pelo administrador.</p>
      <div className="flex flex-wrap gap-1.5">
        {admin
          ? <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">Administrador — todas as ações</span>
          : sessao.permissoes.length
            ? sessao.permissoes.map(p => <span key={p} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold">{ROTULO_PERMISSAO[p] || p}</span>)
            : <span className="text-xs text-muted-foreground">Somente consulta.</span>}
      </div>
      {(admin || sessao.permissoes.includes('pagamentos.solicitar')) && <p className="mt-3 text-xs">{regra}</p>}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
      <span className="block">{rotulo}</span>
      {children}
    </label>
  );
}
