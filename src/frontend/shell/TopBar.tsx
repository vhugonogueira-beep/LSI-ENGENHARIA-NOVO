import { Bell, Building2, LayoutGrid, MapPin, Moon, RefreshCw, Search, Settings, Sun, type LucideIcon } from 'lucide-react';
import { T, tema, aplicarTema } from '../theme';

// Movido de SimuladorLPU.tsx (Fase 4 — extração do shell). Mesmo layout de antes;
// os emojis de ícone viraram lucide-react e o que vinha da closure do App virou prop.

export const TAB_LABELS: Record<string, string> = {
    dashboard: "Dashboard Financeiro",
    orcv2: "Orçamento",
    orcamento: "Orçamento (LPU)",
    historico: "Orçamentos Salvos",
    projetos: "Projetos",
    controle: "Controle de Obras",
    fornecedores: "Fornecedores",
    funcionarios: "Funcionários",
    relatorios: "Relatórios",
    faturamento: "Faturamento",
    clientes: "Clientes",
    secretaria: "Secretária",
    resumo: "Resumo",
    pvhighline: "PV Highline",
    tabela: "Tabela",
    faturas: "Faturas",
};

export interface TopBarProps {
    tab: string;
    user: { nome?: string } | null;
    /** Obra selecionada no Controle de Obras legado (pílula de contexto). */
    obra?: { siteIdSharing?: string; siteIdOperadora?: string } | null;
    /** Site ID do orçamento V2 aberto (pílula de contexto). */
    orcamentoSiteId?: string | null;
    /** Área do orçamento LPU legado: "implantacao" | "operacao". */
    orcArea?: string;
}

const IconButton = ({ title, icon: Icone }: { title: string; icon: LucideIcon }) => (
    <button
        type="button"
        title={title}
        aria-label={title}
        style={{
            width: 32, height: 32, borderRadius: 10,
            background: T.bg2, border: `1px solid ${T.brBase}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.txMut, cursor: "pointer", transition: "all 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = T.blue)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = T.brBase)}
    >
        <Icone size={15} aria-hidden="true" />
    </button>
);

export default function TopBar({ tab, user, obra, orcamentoSiteId, orcArea }: TopBarProps) {
    const tabLabel = TAB_LABELS[tab] || "Painel";
    const pills: { icon: LucideIcon; label: string; color?: string }[] = [
        { icon: LayoutGrid, label: tabLabel, color: T.txPri },
    ];

    if (tab === "controle" && obra) {
        pills.push({ icon: Building2, label: obra.siteIdSharing || obra.siteIdOperadora || "Obra", color: T.blue });
    }
    if (tab === "orcv2" && orcamentoSiteId) {
        pills.push({ icon: MapPin, label: orcamentoSiteId, color: T.blue });
    }
    if (tab === "orcamento") {
        pills.push({ icon: Settings, label: orcArea === "implantacao" ? "Implantação" : "Operação", color: T.green });
    }

    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, marginBottom: 12, padding: "6px 6px 4px",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {pills.map((p, i) => {
                    const Icone = p.icon;
                    return (
                        <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            background: T.bg2, border: `1px solid ${T.brBase}`,
                            padding: "6px 14px", borderRadius: 10,
                            fontSize: 12, fontWeight: 700, color: p.color || T.txPri,
                            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
                        }}>
                            <Icone size={15} aria-hidden="true" style={{ opacity: 0.8 }} />
                            <span style={{ whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{p.label}</span>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Alternador de tema. A paleta e resolvida no carregamento do modulo,
                    entao trocar de tema recarrega a pagina — ver src/frontend/theme.ts. */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 2, padding: 2,
                    borderRadius: 9, background: T.bg1, border: `1px solid ${T.brBase}`,
                }}>
                    {([["claro", Sun, "Claro"], ["escuro", Moon, "Escuro"]] as const).map(([id, Icone, rotulo]) => (
                        <button
                            key={id}
                            type="button"
                            title={`Tema ${rotulo.toLowerCase()}`}
                            aria-pressed={tema === id}
                            onClick={() => tema !== id && aplicarTema(id)}
                            style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "5px 10px", borderRadius: 7, border: "none", cursor: "pointer",
                                fontSize: 12, fontWeight: 700,
                                background: tema === id ? T.blue : "transparent",
                                color: tema === id ? "#fff" : T.txMut,
                                transition: "all 0.15s",
                            }}
                        >
                            <Icone size={15} aria-hidden="true" />{rotulo}
                        </button>
                    ))}
                </div>
                <IconButton title="Buscar" icon={Search} />
                <IconButton title="Alertas" icon={Bell} />
                <IconButton title="Atualizar" icon={RefreshCw} />
                <div title={user?.nome || "Usuário"} style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 700, fontSize: 12,
                    border: `1px solid ${T.blue}66`, boxShadow: `0 4px 12px ${T.blue}40`,
                }}>
                    {(user?.nome || "U").charAt(0)}
                </div>
            </div>
        </div>
    );
}
