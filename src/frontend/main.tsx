import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Carimba data-theme no elemento raiz antes do primeiro render, para nao
// haver piscada de tema errado enquanto os componentes carregam.
import { EVENTO_TEMA } from './theme';
import { instalarSessao } from './lib/sessao';

// Antes de qualquer tela: todo fetch/link para /api passa a levar o token.
instalarSessao();

/**
 * Trocar o tema redesenha a aplicação inteira, sem recarregar a página
 * (14/10/2026): a tela aberta, os filtros e o que estava digitado ficam.
 */
function RaizComTema() {
    const [, setVersao] = useState(0);
    useEffect(() => {
        const redesenhar = () => setVersao(v => v + 1);
        window.addEventListener(EVENTO_TEMA, redesenhar);
        return () => window.removeEventListener(EVENTO_TEMA, redesenhar);
    }, []);
    return <App />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <RaizComTema />
    </React.StrictMode>
);
