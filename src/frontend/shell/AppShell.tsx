import React from 'react';
import Sidebar from '../components/Sidebar';
import Atividades from '../pages/Atividades';
import Configuracoes from '../pages/Configuracoes';
import MeuPerfil from '../pages/MeuPerfil';
import Clientes from '../pages/Clientes';
import DashboardFinanceiro from '../pages/DashboardFinanceiro';
import ControlePagamentos from '../pages/ControlePagamentos';
import PessoasPrestadores from '../pages/PessoasPrestadores';
import FaturamentoReal from '../pages/Faturamento';
import { Dashboard } from '../pages/Dashboard';
import TabLpus from '../budget/TabLpus';
import { T, TMenu } from '../theme';
import TopBar from './TopBar';
import { caixaIcone } from './caixaIcone';

// Shell do LSI (Fase 4): moldura da aplicação — menu lateral, barra superior e o
// roteamento por `tab`. Movido de SimuladorLPU.tsx sem mudar comportamento.
//
// O estado (tab, menu fixado, dados de localStorage, backup) continua sendo do
// App legado em SimuladorLPU.tsx, porque as abas legadas ainda são closures que
// leem e escrevem esse estado. O shell recebe tudo por props e devolve a moldura.

// O menu lateral e marinho nos dois temas: usa a paleta propria, senao no
// tema claro o texto quase preto cairia sobre o fundo marinho.
const iconBoxMenu = caixaIcone(TMenu, true);

/** Telas que ainda vivem dentro do monólito (closures do App legado). */
export interface AbasLegadas {
    orcv2: () => React.ReactNode;
    relatorios: () => React.ReactNode;
    pvhighline: () => React.ReactNode;
    resumo: () => React.ReactNode;
    historico: () => React.ReactNode;
}

export interface AppShellProps {
    tab: string;
    setTab: (tab: string) => void;
    sidePinned: boolean;
    setSidePinned: (v: boolean | ((p: boolean) => boolean)) => void;
    sideHovered: boolean;
    setSideHovered: (v: boolean) => void;
    historico: any[];
    exportarBackup: () => void;
    importarBackup: (file: File) => void;
    user: { nome?: string; email?: string } | null;
    onLogout: () => void;
    /** Contexto mostrado nas pílulas da barra superior. */
    obra?: any;
    orcamentoSiteId?: string | null;
    orcArea?: string;
    abasLegadas: AbasLegadas;
    /** Modais globais do App legado, renderizados por cima de tudo. */
    modais?: React.ReactNode;
}

export default function AppShell(props: AppShellProps) {
    const {
        tab, setTab, sidePinned, setSidePinned, sideHovered, setSideHovered,
        historico, exportarBackup, importarBackup, user, onLogout,
        obra, orcamentoSiteId, orcArea, abasLegadas, modais,
    } = props;

    return (
        <div className="scroll-min" style={{ minHeight: "100vh", background: T.bg0, color: T.txPri, display: "flex", position: "relative", WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" } as React.CSSProperties}>
            <Sidebar
                tab={tab} setTab={setTab}
                sidePinned={sidePinned} setSidePinned={setSidePinned}
                sideHovered={sideHovered} setSideHovered={setSideHovered}
                historico={historico}
                exportarBackup={exportarBackup} importarBackup={importarBackup}
                user={user} onLogout={onLogout}
                onAbrirConfiguracoes={() => setTab("configuracoes")}
                onAbrirPerfil={() => setTab("perfil")}
                T={TMenu} iconBox={iconBoxMenu}
            />
            <div className="scroll-min" style={{
                flex: 1,
                overflowY: "auto",
                padding: "10px 12px 18px",
                marginLeft: sidePinned ? 260 : 64,
                transition: "margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
            }}>
                {tab !== "secretaria" && <TopBar tab={tab} user={user} obra={obra} orcamentoSiteId={orcamentoSiteId} orcArea={orcArea} />}
                {/* Grade comum: em monitor largo o conteúdo para em 1440px e centraliza.
                    Sem isso as tabelas esticavam até a borda e as colunas viravam ilhas. */}
                <div style={{ maxWidth: 1440, margin: "0 auto", width: "100%" }}>
                {tab === "overview" && <Dashboard onNavigateTo={setTab} />}
                {/* Pipeline = a mesma tela de Atividades em kanban. TabDemandas ficou sobre
                    o modelo Demanda (cadastro antigo) e mostrava outro conjunto de dados. */}
                {tab === "demandas" && <Atividades vistaInicial="kanban" />}
                {tab === "atividades" && <Atividades />}
                {tab === "configuracoes" && <Configuracoes />}
                {tab === "perfil" && <MeuPerfil />}
                {tab === "pagamentos" && <ControlePagamentos />}
                {/* Controladoria sobre o modelo real. A TabDashboard() antiga somava
                    `ls_projetos` do localStorage — cadastro paralelo ao banco. */}
                {tab === "dashboard" && <DashboardFinanceiro />}
                {tab === "orcv2" && abasLegadas.orcv2()}
                {tab === "lpus" && <TabLpus />}
                {(tab === "projetos" || tab === "controle") && <Atividades />}
                {tab === "fornecedores" && <PessoasPrestadores initialTab="fornecedores" />}
                {tab === "funcionarios" && <PessoasPrestadores initialTab="funcionarios" />}
                {tab === "relatorios" && abasLegadas.relatorios()}
                {tab === "clientes" && <Clientes />}
                {tab === "faturamento" && <FaturamentoReal />}
                {tab === "pvhighline" && abasLegadas.pvhighline()}
                {tab === "resumo" && abasLegadas.resumo()}
                {tab === "historico" && abasLegadas.historico()}
                {/* Tabela, Faturas e Secretária LS saíram da navegação (set/2026). */}
                </div>
            </div>
            {modais}
        </div>
    );
}
