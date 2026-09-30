import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SimuladorLPU from './pages/SimuladorLPU';
import Login from './pages/Login';
import AceitarConvite from './pages/AceitarConvite';
import { EVENTO_SESSAO_EXPIRADA, limparSessao, type SessaoUsuario } from './lib/sessao';
import { SessaoContext } from './lib/permissoes';

interface AuthUser {
    nome: string;
    email: string;
    role: string;
}

function App() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('ls_auth_token'));
    const [user, setUser] = useState<AuthUser | null>(() => {
        try {
            const saved = localStorage.getItem('ls_auth_user');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });
    const [sessao, setSessao] = useState<SessaoUsuario | null>(null);

    const handleLogout = useCallback(() => {
        limparSessao();
        setToken(null);
        setUser(null);
        setSessao(null);
    }, []);

    // Permissões vêm sempre do servidor: o que está no localStorage é só cache
    // de nome/e-mail para a primeira pintura.
    useEffect(() => {
        if (!token) return;
        fetch('/api/auth/me')
            .then(async r => {
                if (r.status === 401) { handleLogout(); return; }
                if (r.ok) setSessao(await r.json());
            })
            .catch(() => { /* backend offline — mantém a sessão local */ });
    }, [token, handleLogout]);

    // Qualquer 401 no meio do uso (token vencido, acesso suspenso) devolve ao login.
    useEffect(() => {
        window.addEventListener(EVENTO_SESSAO_EXPIRADA, handleLogout);
        return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, handleLogout);
    }, [handleLogout]);

    function handleLogin(newToken: string, newUser: AuthUser) {
        setToken(newToken);
        setUser(newUser);
    }

    return (
        <SessaoContext.Provider value={sessao}>
            <Router>
                <Routes>
                    <Route path="/convite/:token" element={<AceitarConvite />} />
                    <Route
                        path="/login"
                        element={token ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
                    />
                    <Route
                        path="*"
                        element={
                            token
                                ? <SimuladorLPU authUser={user} onLogout={handleLogout} authToken={token} />
                                : <Navigate to="/login" replace />
                        }
                    />
                </Routes>
            </Router>
        </SessaoContext.Provider>
    );
}

export default App;
