import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

// Página pública do link de convite (e de redefinição de senha). A pessoa
// escolhe a própria senha — o administrador nunca a conhece — e entra direto.

export default function AceitarConvite() {
    const { token = '' } = useParams();
    const [convite, setConvite] = useState<{ nome: string; email: string; primeiro_acesso: boolean } | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [senha, setSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        fetch(`/api/auth/convite/${encodeURIComponent(token)}`)
            .then(async r => {
                const corpo = await r.json().catch(() => null);
                if (!r.ok) throw new Error(corpo?.error || 'Link inválido');
                setConvite(corpo);
            })
            .catch(e => setErro(e.message))
            .finally(() => setCarregando(false));
    }, [token]);

    async function salvar(e: FormEvent) {
        e.preventDefault();
        setErro('');
        if (senha !== confirmacao) { setErro('As duas senhas não conferem'); return; }
        setSalvando(true);
        try {
            const r = await fetch(`/api/auth/convite/${encodeURIComponent(token)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha }),
            });
            const corpo = await r.json().catch(() => null);
            if (!r.ok) throw new Error(corpo?.error || 'Não foi possível salvar a senha');

            // Já entra com a senha nova, sem pedir para digitar de novo.
            const login = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: corpo.email, senha }),
            });
            const sessao = await login.json().catch(() => null);
            if (login.ok && sessao?.token) {
                localStorage.setItem('ls_auth_token', sessao.token);
                localStorage.setItem('ls_auth_user', JSON.stringify(sessao.user));
            }
            window.location.replace('/');
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    const campo = 'w-full rounded-lg border border-border bg-secondary/40 p-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><KeyRound size={22} aria-hidden /></div>
                    <div>
                        <h1 className="text-lg font-bold">LS Office Rumo</h1>
                        <p className="text-xs text-muted-foreground">
                            {convite?.primeiro_acesso === false ? 'Redefinir senha' : 'Criar seu acesso'}
                        </p>
                    </div>
                </div>

                {carregando ? (
                    <p className="text-sm text-muted-foreground">Conferindo o link...</p>
                ) : !convite ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {erro || 'Link inválido ou expirado. Peça um novo ao administrador.'}
                    </div>
                ) : (
                    <form onSubmit={salvar} className="space-y-4">
                        <div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm">
                            <div className="font-semibold">{convite.nome}</div>
                            <div className="text-xs text-muted-foreground">{convite.email}</div>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nova senha</span>
                            <input type="password" autoFocus required minLength={8} className={campo} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Repita a senha</span>
                            <input type="password" required className={campo} value={confirmacao} onChange={e => setConfirmacao(e.target.value)} autoComplete="new-password" />
                        </label>
                        <p className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</p>
                        {erro && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">{erro}</div>}
                        <button disabled={salvando} className="w-full rounded-lg bg-primary p-2.5 font-semibold text-primary-foreground disabled:opacity-60">
                            {salvando ? 'Salvando...' : 'Salvar senha e entrar'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
