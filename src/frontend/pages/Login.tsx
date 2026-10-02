import { useState, FormEvent } from 'react';
// Paleta unica do sistema, com tema claro e escuro.
import { T as T0 } from '../theme';
import { HardHat, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface LoginProps {
    onLogin: (token: string, user: { nome: string; email: string; role: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [mostrarSenha, setMostrarSenha] = useState(false);

    const T = {
        bg: T0.bg0,
        card: T0.bg2,
        border: T0.brBase,
        accent: T0.blue,
        accentHover: T0.blueD,
        tx: T0.txPri,
        txSub: T0.txSec,
        inputBg: T0.bg3,
        error: T0.red,
        success: T0.green,
    };

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setErro('');
        setCarregando(true);
        try {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha }),
            });
            const contentType = resp.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await resp.json()
                : null;
            if (!resp.ok) {
                setErro(data?.error || `Falha no servidor (${resp.status})`);
                return;
            }
            if (!data?.token || !data?.user) {
                setErro('Resposta inválida do servidor. Tente novamente.');
                return;
            }
            localStorage.setItem('ls_auth_token', data.token);
            localStorage.setItem('ls_auth_user', JSON.stringify(data.user));
            onLogin(data.token, data.user);
        } catch {
            setErro('Erro ao conectar ao servidor. Verifique sua conexão.');
        } finally {
            setCarregando(false);
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: T.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{
                width: 420,
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: '40px 36px',
            }}>
                {/* Logo / Marca */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 56,
                        height: 56,
                        background: T.accent,
                        color: '#fff',
                        borderRadius: 14,
                        marginBottom: 16,
                    }}>
                        <HardHat size={28} aria-hidden />
                    </div>
                    <h1 style={{ color: T.tx, fontSize: 24, fontWeight: 700, margin: 0 }}>
                        LS Office ERP
                    </h1>
                    <p style={{ color: T.txSub, fontSize: 13, margin: '6px 0 0' }}>
                        Sistema de Orçamentação de Engenharia
                    </p>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 18 }}>
                        <label htmlFor="login-email" style={{ display: 'block', color: T.txSub, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                            E-mail
                        </label>
                        <input
                            id="login-email"
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            required
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: T.inputBg,
                                border: `1px solid ${erro ? T.error : T.border}`,
                                borderRadius: 8,
                                color: T.tx,
                                fontSize: 15,
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={e => (e.target.style.borderColor = T.accent)}
                            onBlur={e => (e.target.style.borderColor = erro ? T.error : T.border)}
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label htmlFor="login-senha" style={{ display: 'block', color: T.txSub, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                            Senha
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="login-senha"
                                autoComplete="current-password"
                                type={mostrarSenha ? 'text' : 'password'}
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: '100%',
                                    padding: '10px 42px 10px 14px',
                                    background: T.inputBg,
                                    border: `1px solid ${erro ? T.error : T.border}`,
                                    borderRadius: 8,
                                    color: T.tx,
                                    fontSize: 15,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => (e.target.style.borderColor = T.accent)}
                                onBlur={e => (e.target.style.borderColor = erro ? T.error : T.border)}
                            />
                            <button
                                type="button"
                                onClick={() => setMostrarSenha(v => !v)}
                                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                                title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                                aria-pressed={mostrarSenha}
                                style={{
                                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: T.txSub, padding: 0, display: 'inline-flex',
                                }}
                            >
                                {mostrarSenha ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                            </button>
                        </div>
                    </div>

                    {erro && (
                        <div role="alert" style={{
                            background: `${T.error}1a`,
                            border: `1px solid ${T.error}`,
                            borderRadius: 8,
                            padding: '10px 14px',
                            color: T.error,
                            fontSize: 13,
                            marginBottom: 18,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0 }} />
                            {erro}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={carregando}
                        style={{
                            width: '100%',
                            padding: '11px 0',
                            background: carregando ? T.border : T.accent,
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: carregando ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                        }}
                    >
                        {carregando ? (
                            <>
                                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                Entrando...
                            </>
                        ) : 'Entrar'}
                    </button>
                </form>

                <p style={{ color: T.txSub, fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 1.5 }}>
                    Acesso restrito a colaboradores LS Office.<br />
                    Em caso de dúvidas, contate o administrador.
                </p>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                input::placeholder { color: ${T0.txDis}; }
                input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px ${T.inputBg} inset !important; -webkit-text-fill-color: ${T.tx} !important; }
            `}</style>
        </div>
    );
}
