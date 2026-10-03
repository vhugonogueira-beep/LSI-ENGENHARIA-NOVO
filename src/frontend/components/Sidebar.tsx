import React from 'react';
import { LOGO_MARCA_B64 } from '../assets/logoMarca';
import {
    BarChart3, Building2, ClipboardList, CreditCard, Download, Folder, Handshake, Home,
    Library, LogOut, MapPin, Pin, PinOff, Receipt, Settings, Target, TrendingUp, Upload, User,
    type LucideIcon,
} from 'lucide-react';
import { TOM_MODULO, hexTom, tomDe, type Tom } from '../lib/cores';
import { tema } from '../theme';

// Extraído de SimuladorLPU.tsx (Blueprint LSI, Onda 0) — mesmo JSX e comportamento
// de antes, apenas com as dependências de closure convertidas em props explícitas.
// Próximas ondas (ver artifact "Blueprint LSI", seção 21) vão trocar cada seção
// desta sidebar de localStorage para as APIs já implementadas no backend.

export interface SidebarProps {
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
    onAbrirConfiguracoes?: () => void;
    onAbrirPerfil?: () => void;
    T: Record<string, any>;
    iconBox: (accent: string, active?: boolean) => React.CSSProperties;
}

interface NavItemProps {
    id: string;
    icon: LucideIcon;
    label: string;
    badge?: string | null;
    indent?: boolean;
    onClick?: () => void;
    activeOverride?: boolean;
    color?: string | null;
}

export default function Sidebar(props: SidebarProps) {
    const {
        tab, setTab, sidePinned, setSidePinned, sideHovered, setSideHovered,
        historico, exportarBackup,
        importarBackup, user, onLogout, onAbrirConfiguracoes, onAbrirPerfil, T, iconBox,
    } = props;

    const isExpanded = sidePinned || sideHovered;
    // Cor do modulo (lib/cores.ts → TOM_MODULO): cada item tem a sua familia,
    // a mesma do cabecalho da pagina. O menu e marinho nos dois temas; no tema
    // claro o hex do tom e escuro demais para o icone sobre o marinho, entao ele
    // e clareado com color-mix (sem hex novo).
    const corIcone = (t: Tom) => tema === 'claro' ? `color-mix(in srgb, ${hexTom(t)} 55%, white)` : hexTom(t);
    // Item ativo: preenchido com a cor do proprio modulo e texto branco. No
    // tema escuro os tons sao claros, entao um veu preto garante o contraste.
    const fundoAtivo = (t: Tom) => tema === 'claro'
        ? hexTom(t)
        : `linear-gradient(rgba(0,0,0,0.38), rgba(0,0,0,0.38)), ${hexTom(t)}`;

    const TituloSecao = ({ texto, tom }: { texto: string; tom: Tom }) => (
        <div style={{ fontSize: 11, fontWeight: 600, color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: corIcone(tom), flexShrink: 0 }} />
            {texto}
        </div>
    );

    const NavItem = ({ id, icon: Icone, label, badge, indent = false, onClick, activeOverride = undefined, color = null }: NavItemProps) => {
        const active = typeof activeOverride === "boolean" ? activeOverride : (tab === id && !onClick);
        const handleClick = onClick || (() => setTab(id));
        const tom = tomDe(TOM_MODULO, id, 'blue');
        const accent = color || hexTom(tom);
        return (
            <button onClick={handleClick} aria-label={label} title={isExpanded ? undefined : label}
                aria-current={active ? "page" : undefined} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: indent ? (isExpanded ? "7px 12px 7px 28px" : "7px 0") : "10px 14px",
                borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 3,
                textAlign: "left",
                // Rota ativa: preenchida com a cor do proprio modulo (TOM_MODULO),
                // texto branco — Pagamentos laranja, Faturamento verde etc.
                background: active ? fundoAtivo(tom) : "transparent",
                color: active ? "#FFFFFF" : indent ? T.txSec : T.txSec,
                fontWeight: active ? 600 : indent ? 500 : 500,
                fontSize: (indent ? 12 : 13),
                borderLeft: "3px solid transparent",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                justifyContent: isExpanded ? "flex-start" : "center",
                minHeight: 40,
            }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = T.bgHover; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
                {indent
                    ? (isExpanded ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#FFFFFF" : (badge || T.txMut), flexShrink: 0, boxShadow: "none" }} /> : null)
                    : (
                        <span style={{
                            ...iconBox(accent, active),
                            // Caixa tingida com o tom do modulo; no item ativo some
                            // (o item inteiro ja esta na cor) e o icone fica branco.
                            background: active ? "rgba(255,255,255,0.16)" : `${accent}1f`,
                            border: `1px solid ${active ? "transparent" : `${accent}40`}`,
                            color: active ? "#FFFFFF" : (color || corIcone(tom)),
                        }}>
                            {/* Icone lucide: herda a cor da caixa (branco no item ativo). */}
                            <Icone size={16} aria-hidden="true" style={{ opacity: active ? 1 : 0.9 }} />
                        </span>
                    )
                }
                {isExpanded && <span style={{ flex: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
                {isExpanded && badge && !indent && <span style={{ background: T.red, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 700, boxShadow: `0 0 8px ${T.red}60` }}>{badge}</span>}
            </button>
        );
    };

    return (
        <aside
            className="scroll-min"
            onMouseEnter={() => setSideHovered(true)}
            onMouseLeave={() => setSideHovered(false)}
            style={{
                width: isExpanded ? 260 : 64,
                minHeight: "100vh",
                // Menu lateral marinho nos dois estados. Antes o painel expandido
                // usava a cor de cartao (T.bg2), o que agora o descolaria da paleta.
                background: T.bgSidebar,
                borderRight: `1px solid ${T.brBase}`,
                boxShadow: isExpanded ? "4px 0 32px rgba(15, 23, 42, 0.08)" : "0 0 16px rgba(15, 23, 42, 0.05)",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                position: "fixed",
                left: 0,
                top: 0,
                height: "100vh",
                overflow: "hidden",
                zIndex: 1000,
                transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s"
            }}>

            {/* Toggle Pinned Button */}
            <button
                onClick={(e) => { e.stopPropagation(); setSidePinned(!sidePinned); }}
                style={{
                    position: "absolute", right: 10, top: 12, width: 28, height: 28,
                    borderRadius: 8, background: sidePinned ? T.blue + "33" : "transparent",
                    border: sidePinned ? `1px solid ${T.blue}66` : "1px solid transparent",
                    cursor: "pointer", display: isExpanded ? "flex" : "none",
                    alignItems: "center", justifyContent: "center", fontSize: 12,
                    color: sidePinned ? T.blue : T.txMut,
                    transition: "all 0.2s", zIndex: 1010
                }}
                title={sidePinned ? "Desafixar menu" : "Fixar menu"}
                aria-label={sidePinned ? "Desafixar menu" : "Fixar menu"}
            >
                {sidePinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
            </button>

            <div className="scroll-min" style={{ height: "100%", overflowY: "auto", paddingRight: 12, marginRight: -12, position: "relative", zIndex: 1 }}>
                {/* Logo — escala maior */}
                <div style={{
                    padding: isExpanded ? "20px 12px 16px" : "16px 0", borderBottom: `1px solid ${T.brSub}`,
                    textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center",
                    background: isExpanded ? `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)` : "transparent",
                    transition: "padding 0.25s"
                }}>
                    <div style={{
                        position: "relative", width: isExpanded ? 64 : 40, height: isExpanded ? 64 : 40, marginBottom: isExpanded ? 12 : 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.25s"
                    }}>
                        {/* Simbolo direto sobre o marinho. A placa branca existia porque a
                            arte completa e um JPEG com fundo branco gravado; este recorte
                            tem transparencia real, entao a placa deixou de ser necessaria. */}
                        <div style={{
                            position: "relative", zIndex: 2, width: "100%", height: "100%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <img src={LOGO_MARCA_B64} alt="LS Office" title="Configurações da LS Office"
                                onClick={onAbrirConfiguracoes}
                                style={{
                                    width: "100%", height: "100%", objectFit: "contain",
                                    transition: "all 0.25s",
                                    cursor: onAbrirConfiguracoes ? "pointer" : "default",
                                }} />
                        </div>
                    </div>
                    {isExpanded && (
                        <div style={{
                            fontSize: 11, fontWeight: 600, color: T.txSec,
                            background: T.bg1,
                            borderRadius: 6, padding: "4px 12px",
                            border: `1px solid ${T.brBase}`,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            animation: "fadeIn 0.3s ease"
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue, flexShrink: 0 }} />
                            LS Office ERP
                        </div>
                    )}
                    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
                </div>

                <nav style={{ padding: isExpanded ? "8px 6px" : "8px 4px", flex: 1, overflowX: "hidden" }}>

                    {/* ── Seção DEMANDAS ── */}
                    {isExpanded && <TituloSecao texto="Demandas" tom="indigo" />}
                    <NavItem id="overview" icon={Home} label="Visão Geral" />
                    <NavItem id="demandas" icon={ClipboardList} label="Pipeline" />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção DASHBOARD ── */}
                    {isExpanded && <TituloSecao texto="Dashboard" tom="violet" />}
                    <NavItem id="dashboard" icon={TrendingUp} label="Dashboard Financeiro" />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção ORÇAMENTO ── */}
                    {isExpanded && <TituloSecao texto="Orçamento" tom="amber" />}

                    {/* Orçamento nasce dentro da Atividade (abas PV Highline e Cotação LS).
                        "Novo Orçamento" saiu da sidebar para não existir um segundo caminho,
                        que criava orçamento solto, sem obra. */}
                    <NavItem id="historico" icon={Folder} label="Orçamentos" badge={historico.length > 0 ? historico.length.toString() : null} />
                    <NavItem id="lpus" icon={Library} label="Bases (LPUs)" />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção OBRAS ── */}
                    {isExpanded && <TituloSecao texto="Obras" tom="blue" />}

                    <NavItem id="atividades" icon={Target} label="Atividades" badge={isExpanded ? "novo" : null} />
                    <NavItem id="sites" icon={MapPin} label="Sites" />

                    <NavItem id="fornecedores" icon={Building2} label="Pessoas e Fornecedores" />
                    <NavItem id="relatorios" icon={BarChart3} label="Relatórios" />
                    <NavItem id="faturamento" icon={Receipt} label="Faturamento" />
                    <NavItem id="pagamentos" icon={CreditCard} label="Controle de Pagamentos" />
                    <NavItem id="clientes" icon={Handshake} label="Clientes" />

                    {/* ── Seção SISTEMA ──
                        O avatar e a logo continuam como atalhos, mas o acesso
                        principal a Meu Perfil e Configurações (empresa, contas,
                        cartões e roteamento de e-mail) precisa estar no menu. */}
                    {isExpanded && <TituloSecao texto="Sistema" tom="slate" />}

                    <NavItem id="perfil" icon={User} label="Meu Perfil" />
                    <NavItem id="configuracoes" icon={Settings} label="Configurações" />

                    {/* ── Divisor ── */}
                </nav>

                {/* Usuário logado + logout */}
                <div style={{ borderTop: `1px solid ${T.brStrong}`, background: T.bg1 }}>
                    {/* Backup buttons */}
                    <div style={{ padding: isExpanded ? "8px 10px 4px" : "8px 8px 4px", display: "flex", flexDirection: isExpanded ? "row" : "column", gap: 6 }}>
                        <button onClick={exportarBackup}
                            title="Exportar backup JSON" aria-label="Exportar backup"
                            style={{
                                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 11, fontWeight: 600,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.blue}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
                        >
                            <Download size={15} aria-hidden="true" />{isExpanded && " Backup"}
                        </button>
                        <label title="Restaurar dados de um backup JSON"
                            style={{
                                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 11, fontWeight: 600,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.blue}
                            onMouseLeave={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.brBase}
                        >
                            <Upload size={15} aria-hidden="true" />{isExpanded && " Restaurar"}
                            <input type="file" accept=".json" style={{ display: "none" }}
                                onChange={e => e.target.files && e.target.files[0] && importarBackup(e.target.files[0])} />
                        </label>
                    </div>
                    {/* Auto-save indicator */}
                    {isExpanded && (
                        <div style={{ padding: "2px 14px 6px", display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.green }} />
                            <span style={{ fontSize: 11, color: T.txDis, fontWeight: 500 }}>Auto-save ativo</span>
                        </div>
                    )}
                    <div style={{ padding: isExpanded ? "6px 12px 12px" : "8px 0 12px", display: "flex", flexDirection: isExpanded ? "row" : "column", alignItems: "center", gap: 10, borderTop: `1px solid ${T.brStrong}40` }}>
                        <div onClick={onAbrirPerfil} title="Meu perfil"
                            style={{ position: "relative", width: 36, height: 36, flexShrink: 0, cursor: onAbrirPerfil ? "pointer" : "default" }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 13, fontWeight: 700, color: "#fff",
                                                                border: `1px solid ${T.blue}55`
                            }}>
                                {user?.nome?.charAt(0) || "U"}
                            </div>
                            <span style={{
                                position: "absolute", right: -1, bottom: -1,
                                width: 9, height: 9, borderRadius: "50%",
                                background: T.green, border: `2px solid ${T.bg1}`,
                            }} />
                        </div>
                        {isExpanded && <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nome || "Usuário"}</div>
                            <div style={{ fontSize: 11, color: T.txMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8 }}>{user?.email || ""}</div>
                        </div>}
                        <button onClick={onLogout}
                            title="Sair"
                            aria-label="Sair"
                            style={{
                                background: "transparent", border: `1px solid ${T.brBase}`, borderRadius: 8,
                                padding: "6px", cursor: "pointer", color: T.txMut, fontSize: 15, flexShrink: 0,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.red}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
                        >
                            <LogOut size={15} aria-hidden="true" style={{ display: "block" }} />
                        </button>
                    </div>
                    {isExpanded && (
                        <div style={{ padding: "1px 8px 6px", fontSize: 11, color: T.txDis, textAlign: "center", opacity: 0.5 }}>
                            LS Office ERP v3.5
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
