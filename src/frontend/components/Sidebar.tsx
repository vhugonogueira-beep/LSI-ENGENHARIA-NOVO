import React from 'react';

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
    T: Record<string, any>;
    iconBox: (accent: string, active?: boolean) => React.CSSProperties;
    LOGO_B64: string;
}

export default function Sidebar(props: SidebarProps) {
    const {
        tab, setTab, sidePinned, setSidePinned, sideHovered, setSideHovered,
        historico, exportarBackup,
        importarBackup, user, onLogout, onAbrirConfiguracoes, T, iconBox, LOGO_B64,
    } = props;

    const isExpanded = sidePinned || sideHovered;
    const NAV_COLORS: Record<string, string> = {
        orcv2: T.blue,
        historico: T.purple,
        novo_orcamento: T.blue,
        fornecedores: T.purple,
        funcionarios: T.green,
        relatorios: T.cyan,
        faturamento: T.green,
        clientes: T.cyan,
        lpus: T.amber,
    };

    const NavItem = ({ id, icon, label, badge, indent = false, onClick, activeOverride = undefined, color = null }: any) => {
        const active = typeof activeOverride === "boolean" ? activeOverride : (tab === id && !onClick);
        const handleClick = onClick || (() => setTab(id));
        const accent = color || NAV_COLORS[id] || T.blue;
        return (
            <button onClick={handleClick} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: indent ? (isExpanded ? "7px 12px 7px 28px" : "7px 0") : "10px 14px",
                borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 3,
                textAlign: "left",
                background: active
                    ? `linear-gradient(90deg, ${accent}22, ${accent}08)`
                    : "transparent",
                color: active ? T.txPri : indent ? T.txSec : T.txMut,
                fontWeight: active ? 600 : indent ? 500 : 500,
                fontSize: (indent ? 12 : 13),
                borderLeft: active ? `3px solid ${accent}` : "3px solid transparent",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                justifyContent: isExpanded ? "flex-start" : "center",
                minHeight: 40,
            }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = T.bgHover; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
                {indent
                    ? (isExpanded ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? accent : (badge || T.txMut), flexShrink: 0, boxShadow: active ? `0 0 6px ${accent}` : "none" }} /> : null)
                    : (
                        <span style={iconBox(accent, active)}>
                            <span style={{ fontSize: 14, opacity: active ? 1 : 0.85, filter: "grayscale(1)" }}>{icon}</span>
                        </span>
                    )
                }
                {isExpanded && <span style={{ flex: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
                {isExpanded && badge && !indent && <span style={{ background: T.red, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 9, fontWeight: 700, boxShadow: `0 0 8px ${T.red}60` }}>{badge}</span>}
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
                background: isExpanded ? T.bg2 : T.bgSidebar,
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
            >
                {sidePinned ? "📌" : "📍"}
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
                        <div style={{
                            position: "relative", zIndex: 2, width: "100%", height: "100%", borderRadius: 12,
                            background: "#fff",
                            border: `1px solid ${T.brBase}`,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                        }}>
                            {/* A logo abre as Configurações da LS (CNPJ, IE, contas, logo). */}
                            <img src={LOGO_B64} alt="LS Office" title="Configurações da LS Office"
                                onClick={onAbrirConfiguracoes}
                                style={{ width: isExpanded ? 50 : 30, height: isExpanded ? 50 : 30, objectFit: "contain", transition: "all 0.25s", cursor: onAbrirConfiguracoes ? "pointer" : "default" }} />
                        </div>
                    </div>
                    {isExpanded && (
                        <div style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: T.txSec,
                            background: T.bg1,
                            borderRadius: 6, padding: "4px 12px",
                            border: `1px solid ${T.brBase}`,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            animation: "fadeIn 0.3s ease"
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue, flexShrink: 0, boxShadow: `0 0 8px ${T.blue}40` }} />
                            LS OFFICE ERP
                        </div>
                    )}
                    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
                </div>

                <nav style={{ padding: isExpanded ? "8px 6px" : "8px 4px", flex: 1, overflowX: "hidden" }}>

                    {/* ── Seção DEMANDAS ── */}
                    {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>DEMANDAS</div>}
                    <NavItem id="overview" icon="🏠" label="Visão Geral" color={T.indigo} />
                    <NavItem id="demandas" icon="📋" label="Pipeline" color={T.indigo} />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção DASHBOARD ── */}
                    {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>DASHBOARD</div>}
                    <NavItem id="dashboard" icon="📈" label="Dashboard Financeiro" />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção ORÇAMENTO ── */}
                    {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>ORÇAMENTO</div>}

                    {/* Orçamento nasce dentro da Atividade (abas PV Highline e Cotação LS).
                        "Novo Orçamento" saiu da sidebar para não existir um segundo caminho,
                        que criava orçamento solto, sem obra. */}
                    <NavItem id="historico" icon="📁" label="Orçamentos" badge={historico.length > 0 ? historico.length.toString() : null} />
                    <NavItem id="lpus" icon="📚" label="Bases (LPUs)" />

                    {/* ── Divisor ── */}
                    {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

                    {/* ── Seção OBRAS ── */}
                    {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>OBRAS</div>}

                    <NavItem id="atividades" icon="🎯" label="Atividades" badge={isExpanded ? "novo" : null} color={T.green} />

                    <NavItem id="fornecedores" icon="🏢" label="Pessoas e Fornecedores" />
                    <NavItem id="relatorios" icon="📊" label="Relatórios" />
                    <NavItem id="faturamento" icon="🧾" label="Faturamento" />
                    <NavItem id="pagamentos" icon="💳" label="Controle de Pagamentos" color={T.amber} />
                    <NavItem id="clientes" icon="🤝" label="Clientes" />

                    {/* ── Divisor ── */}
                </nav>

                {/* Usuário logado + logout */}
                <div style={{ borderTop: `1px solid ${T.brStrong}`, background: T.bg1 }}>
                    {/* Backup buttons */}
                    <div style={{ padding: "8px 10px 4px", display: "flex", gap: 6 }}>
                        <button onClick={exportarBackup}
                            title="Exportar backup JSON"
                            style={{
                                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 10, fontWeight: 600,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.blue}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
                        >
                            ⬇ Backup
                        </button>
                        <label title="Restaurar dados de um backup JSON"
                            style={{
                                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 10, fontWeight: 600,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.blue}
                            onMouseLeave={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.brBase}
                        >
                            ⬆ Restaurar
                            <input type="file" accept=".json" style={{ display: "none" }}
                                onChange={e => e.target.files && e.target.files[0] && importarBackup(e.target.files[0])} />
                        </label>
                    </div>
                    {/* Auto-save indicator */}
                    <div style={{ padding: "2px 14px 6px", display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
                        <span style={{ fontSize: 10, color: T.txDis, fontWeight: 500 }}>Auto-save ativo</span>
                    </div>
                    <div style={{ padding: "6px 12px 12px", display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${T.brStrong}40` }}>
                        <div onClick={onAbrirConfiguracoes} title="Configurações da LS Office"
                            style={{ position: "relative", width: 36, height: 36, flexShrink: 0, cursor: onAbrirConfiguracoes ? "pointer" : "default" }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 13, fontWeight: 800, color: "#fff",
                                boxShadow: `0 4px 12px ${T.blue}40`,
                                border: `1px solid ${T.blue}55`
                            }}>
                                {user?.nome?.charAt(0) || "U"}
                            </div>
                            <span style={{
                                position: "absolute", right: -1, bottom: -1,
                                width: 9, height: 9, borderRadius: "50%",
                                background: T.green, border: `2px solid ${T.bg1}`,
                                boxShadow: `0 0 6px ${T.green}`
                            }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nome || "Usuário"}</div>
                            <div style={{ fontSize: 10, color: T.txMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8 }}>{user?.email || ""}</div>
                        </div>
                        <button onClick={onLogout}
                            title="Sair"
                            style={{
                                background: "transparent", border: `1px solid ${T.brBase}`, borderRadius: 8,
                                padding: "6px", cursor: "pointer", color: T.txMut, fontSize: 14, flexShrink: 0,
                                transition: "all 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.red}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
                        >
                            ⏻
                        </button>
                    </div>
                    <div style={{ padding: "1px 8px 6px", fontSize: 8, color: T.txDis, textAlign: "center", opacity: 0.5 }}>
                        v3.5 · LS Office ERP
                    </div>
                </div>
            </div>
        </aside>
    );
}
