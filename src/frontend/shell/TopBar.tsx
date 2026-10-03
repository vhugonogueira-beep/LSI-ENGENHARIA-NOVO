import {
    BarChart3, Bell, Building2, ClipboardList, CreditCard, Folder, Handshake, Home, LayoutGrid, Library,
    MapPin, Moon, Receipt, RefreshCw, Search, Settings, Sun, Target, TrendingUp, User, type LucideIcon,
} from 'lucide-react';
import { T, tema, aplicarTema } from '../theme';
import { TOM_MODULO, hexTom, type Tom } from '../lib/cores';

/** Ícone de cada módulo — o mesmo do menu lateral. */
const ICONE_MODULO: Record<string, LucideIcon> = {
    overview: Home, demandas: ClipboardList, dashboard: TrendingUp, historico: Folder, orcv2: Folder,
    lpus: Library, atividades: Target, projetos: Target, controle: Target, fornecedores: Building2,
    funcionarios: Building2, relatorios: BarChart3, faturamento: Receipt, pagamentos: CreditCard,
    clientes: Handshake, sites: MapPin, perfil: User, configuracoes: Settings,
};

// Movido de SimuladorLPU.tsx (Fase 4 — extração do shell). Mesmo layout de antes;
// os emojis de ícone viraram lucide-react e o que vinha da closure do App virou prop.

export const TAB_LABELS: Record<string, string> = {
    overview: "Visão Geral",
    demandas: "Pipeline",
    atividades: "Atividades",
    pagamentos: "Controle de Pagamentos",
    lpus: "Bases (LPUs)",
    perfil: "Meu Perfil",
    configuracoes: "Configurações",
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
    sites: "Sites",
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
    // Pílula do módulo atual: ícone do módulo na cor dele (TOM_MODULO).
    const tomModulo: Tom | undefined = TOM_MODULO[tab];
    const pills: { icon: LucideIcon; label: string; color?: string; tom?: Tom }[] = [
        { icon: ICONE_MODULO[tab] || LayoutGrid, label: tabLabel, color: T.txPri, tom: tomModulo },
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
                            padding: i === 0 && p.tom ? "4px 14px 4px 6px" : "6px 14px", borderRadius: 10,
                            fontSize: 12, fontWeight: 700, color: p.color || T.txPri,
                            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
                        }}>
                            {p.tom ? (
                                <span aria-hidden="true" style={{
                                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: `${hexTom(p.tom)}1f`, color: hexTom(p.tom),
                                }}>
                                    <Icone size={14} />
                                </span>
                            ) : <Icone size={15} aria-hidden="true" style={{ opacity: 0.8 }} />}
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
