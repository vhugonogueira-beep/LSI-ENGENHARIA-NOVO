import { useState, FormEvent } from 'react';

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
        bg: '#0f1117',
        card: '#1a1d27',
        border: '#2a2d3a',
        accent: '#3b82f6',
        accentHover: '#2563eb',
        tx: '#e2e8f0',
        txSub: '#94a3b8',
        inputBg: '#111827',
        error: '#f87171',
        success: '#34d399',
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
            const data = await resp.json();
            if (!resp.ok) {
                setErro(data.error || 'Credenciais inválidas');
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
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            <div style={{
                width: 420,
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: '40px 36px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}>
                {/* Logo / Marca */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 56,
                        height: 56,
                        background: `linear-gradient(135deg, ${T.accent}, #6366f1)`,
                        borderRadius: 14,
                        marginBottom: 16,
                        fontSize: 26,
                    }}>
                        🏗️
                    </div>
                    <h1 style={{ color: T.tx, fontSize: 22, fontWeight: 700, margin: 0 }}>
                        LS Office ERP
                    </h1>
                    <p style={{ color: T.txSub, fontSize: 13, margin: '6px 0 0' }}>
                        Sistema de Orçamentação de Engenharia
                    </p>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 18 }}>
                        <label style={{ display: 'block', color: T.txSub, fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            E-mail
                        </label>
                        <input
                            type="email"
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
                                fontSize: 14,
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={e => (e.target.style.borderColor = T.accent)}
                            onBlur={e => (e.target.style.borderColor = erro ? T.error : T.border)}
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', color: T.txSub, fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            Senha
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
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
                                    fontSize: 14,
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
                                style={{
                                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: T.txSub, fontSize: 16, padding: 0,
                                }}
                            >
                                {mostrarSenha ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    {erro && (
                        <div style={{
                            background: 'rgba(248,113,113,0.1)',
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
                            ⚠️ {erro}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={carregando}
                        style={{
                            width: '100%',
                            padding: '11px 0',
                            background: carregando ? '#374151' : T.accent,
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontSize: 14,
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
                input::placeholder { color: #4b5563; }
                input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #111827 inset !important; -webkit-text-fill-color: #e2e8f0 !important; }
            `}</style>
        </div>
    );
}
