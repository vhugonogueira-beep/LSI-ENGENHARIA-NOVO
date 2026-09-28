import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Carimba data-theme no elemento raiz antes do primeiro render, para nao
// haver piscada de tema errado enquanto os componentes carregam.
import './theme';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
