import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SimuladorLPU from './pages/SimuladorLPU';
import Login from './pages/Login';

interface AuthUser {
    nome: string;
    email: string;
    role: string;
}

function App() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('ls_auth_token'));
    const [user, setUser] = useState<AuthUser | null>(() => {
        const saved = localStorage.getItem('ls_auth_user');
        return saved ? JSON.parse(saved) : null;
    });

    useEffect(() => {
        if (!token) return;
        // Verificar se token ainda é válido
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => { if (r.status === 401) { handleLogout(); } })
            .catch(() => {/* backend offline - manter sessão local */});
    }, []);

    function handleLogin(newToken: string, newUser: AuthUser) {
        setToken(newToken);
        setUser(newUser);
    }

    function handleLogout() {
        localStorage.removeItem('ls_auth_token');
        localStorage.removeItem('ls_auth_user');
        setToken(null);
        setUser(null);
    }

    return (
        <Router>
            <Routes>
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
    );
}

export default App;
