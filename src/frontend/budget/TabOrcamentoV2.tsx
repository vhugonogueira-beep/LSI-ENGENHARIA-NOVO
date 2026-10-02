import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Budget, BudgetSharingBlock, BudgetLineItem, SharingClient, LpuTemplate, calcBlocoTotal, calcBlocoCustoDireto, calcBudgetTotals, calcItemFinancials, calcItemTotal, calcItemUnitNet, getItemDiscountPct, getItemDiscountValor, newId } from "./types";
import { loadSharingClients } from "./sharingClients";
import { carregarTemplatesDoBanco, findTemplate, templatesDeFallback } from "./lpuTemplates";
import { gerarPdfBudgetV2 } from "./gerarPdfV2";
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';
import { BarChart3, Blocks, Check, ClipboardList, Cog, FileText, HardHat, Link2, MapPin, NotebookPen, Package, Plus, Save, ShoppingCart, Wallet, Wrench, X } from "lucide-react";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const iconeBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex", alignItems: "center", borderRadius: 6 };
const comIcone: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };

// Theme (original dark)

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Styles ──
const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 8, padding: "14px 16px" } as React.CSSProperties,
  input: { padding: "5px 10px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", fontFamily: "inherit", width: "100%", transition: "all 0.15s" } as React.CSSProperties,
  label: { fontSize: 11, color: T.txSec, display: "block", marginBottom: 3, fontWeight: 600 } as React.CSSProperties,
  btn: { padding: "5px 12px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, cursor: "pointer", color: T.txSec, fontWeight: 600, transition: "all 0.15s" } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "#fff", borderColor: T.blue } as React.CSSProperties,
  btnGreen: { background: T.greenD, color: "#fff", borderColor: T.greenD } as React.CSSProperties,
  ghost: { background: "transparent", border: `1px solid ${T.brBase}`, color: T.txSec, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 11, transition: "all 0.15s" } as React.CSSProperties,
};

interface TabOrcV2Props {
  dbImpl: any[];        // DB existente implantação
  dbOp: any[];          // DB existente operação
  dbHighline?: any[];   // DB Highline LPU
  onSaveBudget: (budget: Budget) => void;
  onCreateProjectFromBudget: (budget: Budget) => void;
  onLinkBudgetToProject: (budget: Budget) => void;
  onOpenLinkedProject: (projectId: string) => void;
  activeBudget: Budget | null;
  setActiveBudget: (b: Budget | null) => void;
  logoBase64?: string;
  projetos: any[];
  clientes: any[];
}

export default function TabOrcamentoV2({ dbImpl, dbOp, dbHighline, onSaveBudget, onCreateProjectFromBudget, onLinkBudgetToProject, onOpenLinkedProject, activeBudget, setActiveBudget, logoBase64, projetos, clientes }: TabOrcV2Props) {
  const [sharingClients, setSharingClients] = useState<SharingClient[]>([]);
  const [templates, setTemplates] = useState<LpuTemplate[]>([]);
  const [step, setStep] = useState<"site" | "config" | "itens" | "resumo">(activeBudget ? "itens" : "site");
  const [searchTerm, setSearchTerm] = useState("");
  const [catFilter, setCatFilter] = useState("TODOS");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sharingClientsList = useMemo(() => clientes.filter(c => c.tipo === "Sharing"), [clientes]);
  const operadoraClientsList = useMemo(() => clientes.filter(c => c.tipo === "Operadora"), [clientes]);

  // ── Init ──
  useEffect(() => {
    const c = loadSharingClients();
    setSharingClients(c);
    // As LPUs vêm do banco (tela "Bases (LPUs)"). Os catálogos fixos do código
    // só entram quando o banco ainda não tem base nenhuma, para o orçamento não
    // abrir vazio numa instalação nova.
    let cancelado = false;
    (async () => {
      let t: LpuTemplate[] = [];
      try {
        t = await carregarTemplatesDoBanco();
      } catch {
        t = [];
      }
      if (t.length === 0) t = templatesDeFallback(dbImpl, dbOp, dbHighline);
      if (!cancelado) setTemplates(t);
    })();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (activeBudget && activeBudget.blocos.length > 0 && !activeBlockId) {
      setActiveBlockId(activeBudget.blocos[0].id);
    }
  }, [activeBudget]);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Budget CRUD ──
  const createNewBudget = () => {
    const b: Budget = {
      id: `ORC-LSI-IMP-DETENTORA-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      versao: 1,
      data: new Date().toLocaleDateString("pt-BR"),
      status: "Rascunho",
      siteInfo: { 
        siteId: "", sharingNome: "", siteIdSharing: "", siteIdOperadora: "", operadora: "", uf: "", municipio: "", endereco: "",
        latitude: "", longitude: "",
        categoriaProjeto: "implantacao", tipoProjeto: "bts" 
      },
      blocos: [],
      contratante: "", objeto: "", vigencia: "10 DIAS", fornecedor: "LS Office", obs: "",
      totalCapex: 0, totalOpex: 0, totalGeral: 0,
    };
    setActiveBudget(b);
    setStep("site");
    setActiveBlockId(null);
  };

  const updateBudget = useCallback((updater: (prev: Budget) => Budget) => {
    if (!activeBudget) return;
    const updated = updater(activeBudget);

    // Auto-update ID (only for drafts to prevent breaking existing documents)
    if (updated.status === "Rascunho" && updated.id.startsWith("ORC-")) {
      const parts = updated.id.split("-");
      // Keep the unique 4-digit token at the end
      const hash = parts.length > 1 && parts[parts.length - 1].length === 4 ? parts[parts.length - 1] : String(Date.now()).slice(-4);
      
      const catCode = updated.siteInfo.categoriaProjeto === "manutencao" ? "OM" : "IMP";
      let sName = updated.siteInfo.sharingNome?.trim().toUpperCase() || "DETENTORA";
      sName = sName.replace(/[^A-Z0-9]/g, "").substring(0, 15) || "DETENTORA";
      const year = new Date().getFullYear();

      updated.id = `ORC-LSI-${catCode}-${sName}-${year}-${hash}`;
    }

    const totals = calcBudgetTotals(updated);
    setActiveBudget({ ...updated, ...totals });
  }, [activeBudget, setActiveBudget]);

  const updateSiteField = (k: string, v: string) => {
    updateBudget(b => ({ ...b, siteInfo: { ...b.siteInfo, [k]: v } }));
  };

  const updateField = (k: string, v: any) => {
    updateBudget(b => ({ ...b, [k]: v }));
  };

  // ── Sharing Block management ──
  const addSharingBlock = (sharingId: string, tipo: "implantacao" | "manutencao") => {
    const client = sharingClients.find(c => c.id === sharingId);
    if (!client) return;
    // Check duplicata
    if (activeBudget?.blocos.some(b => b.sharingId === sharingId && b.tipo === tipo)) {
      notify("Bloco já existe para este sharing/tipo");
      return;
    }
    const tpl = findTemplate(sharingId, tipo, templates);
    const itens: BudgetLineItem[] = [];

    const bloco: BudgetSharingBlock = {
      id: newId(), sharingId, sharingNome: client.nome, sharingCor: client.cor, tipo,
      templateId: tpl?.id, itens, bdi: client.bdiPadrao, lucro: client.lucroPadrao, discount: client.descontoPadrao, obs: "",
    };

    updateBudget(b => ({ ...b, blocos: [...b.blocos, bloco] }));
    setActiveBlockId(bloco.id);
    notify(`Bloco ${client.sigla} (${tipo === "implantacao" ? "Impl." : "Oper."}) adicionado!`);
  };

  const removeBlock = (blockId: string) => {
    if (!confirm("Remover este bloco de sharing?")) return;
    updateBudget(b => ({ ...b, blocos: b.blocos.filter(bl => bl.id !== blockId) }));
    if (activeBlockId === blockId) setActiveBlockId(activeBudget?.blocos.find(bl => bl.id !== blockId)?.id || null);
  };

  const updateBlockField = (blockId: string, field: string, val: any) => {
    updateBudget(b => ({ ...b, blocos: b.blocos.map(bl => bl.id === blockId ? { ...bl, [field]: val } : bl) }));
  };

  const addItemToBlock = (blockId: string, item: any) => {
    const li: BudgetLineItem = {
      id: newId(), cod: item.cod, descricao: item.solucao || item.descricao || "", config: item.config,
      unid: item.unid || "VB", tipoCusto: "Serviço", categoria: item.resumo || "GERAL",
      qtde: 1, vlUnitario: item.vl_medio ?? item.vlReferencia ?? 0, vlReferencia: item.vl_medio ?? item.vlReferencia ?? 0,
      descontoPct: 0, descontoValor: 0, desconto: 0,
    };
    updateBudget(b => ({ ...b, blocos: b.blocos.map(bl => bl.id === blockId ? { ...bl, itens: [...bl.itens, li] } : bl) }));
  };

  const removeItemFromBlock = (blockId: string, itemId: string) => {
    updateBudget(b => ({ ...b, blocos: b.blocos.map(bl => bl.id === blockId ? { ...bl, itens: bl.itens.filter(i => i.id !== itemId) } : bl) }));
  };

  const updateItemField = (blockId: string, itemId: string, field: string, val: number) => {
    updateBudget(b => ({ ...b, blocos: b.blocos.map(bl => bl.id === blockId ? { ...bl, itens: bl.itens.map(i => i.id === itemId ? { ...i, [field]: val } : i) } : bl) }));
  };

  const updateItemFields = (blockId: string, itemId: string, patch: Partial<BudgetLineItem>) => {
    updateBudget(b => ({
      ...b,
      blocos: b.blocos.map(bl => bl.id === blockId ? { ...bl, itens: bl.itens.map(i => i.id === itemId ? { ...i, ...patch } : i) } : bl)
    }));
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const updateItemDiscountPct = (blockId: string, item: BudgetLineItem, pctVal: number) => {
    const base = item.vlUnitario || 0;
    const pct = clamp(pctVal || 0, 0, 100);
    const valor = base * (pct / 100);
    updateItemFields(blockId, item.id, { descontoPct: pct, descontoValor: valor, desconto: pct });
  };

  const updateItemDiscountValor = (blockId: string, item: BudgetLineItem, valorVal: number) => {
    const base = item.vlUnitario || 0;
    const valor = clamp(valorVal || 0, 0, base);
    const pct = base > 0 ? (valor / base) * 100 : 0;
    updateItemFields(blockId, item.id, { descontoValor: valor, descontoPct: pct, desconto: pct });
  };

  const updateItemUnitNet = (blockId: string, item: BudgetLineItem, netVal: number) => {
    const currentBase = Math.max(0, item.vlUnitario || 0);
    const targetNet = Math.max(0, netVal || 0);
    const base = currentBase > 0 ? currentBase : targetNet;
    const valor = clamp(base - targetNet, 0, base);
    const pct = base > 0 ? (valor / base) * 100 : 0;
    updateItemFields(blockId, item.id, { vlUnitario: base, descontoValor: valor, descontoPct: pct, desconto: pct });
  };

  // ── Computed ──
  const activeBlock = activeBudget?.blocos.find(b => b.id === activeBlockId) || null;
  const implBlocks = activeBudget?.blocos.filter(b => b.tipo === "implantacao") || [];
  const operBlocks = activeBudget?.blocos.filter(b => b.tipo === "manutencao") || [];
  const totals = activeBudget ? calcBudgetTotals(activeBudget) : { totalCapex: 0, totalOpex: 0, totalGeral: 0 };

  const currentCatalog = useMemo(() => {
    if (!activeBlock) return [];
    const tpl = templates.find(t => t.id === activeBlock.templateId);
    if (tpl && tpl.itens) return tpl.itens;
    // Fallback just in case
    return activeBlock.tipo === "implantacao" ? dbImpl : dbOp;
  }, [activeBlock, templates, dbImpl, dbOp]);

  const catalogCats = useMemo(() => [...new Set(currentCatalog.map((i: any) => i.resumo))].sort(), [currentCatalog]);

  const filteredCatalog = useMemo(() => {
    let items = currentCatalog;
    if (catFilter !== "TODOS") items = items.filter((i: any) => i.resumo === catFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      items = items.filter((i: any) => i.cod.toLowerCase().includes(s) || i.solucao.toLowerCase().includes(s) || (i.config || "").toLowerCase().includes(s));
    }
    return items;
  }, [currentCatalog, catFilter, searchTerm]);

  const handleSave = () => {
    if (!activeBudget || activeBudget.blocos.length === 0) { notify("Adicione ao menos um bloco"); return; }
    const updated = { ...activeBudget, ...calcBudgetTotals(activeBudget) };
    onSaveBudget(updated);
    notify("Orçamento salvo!");
  };

  const getPreparedBudget = () => {
    if (!activeBudget || activeBudget.blocos.length === 0) {
      notify("Adicione ao menos um bloco antes de vincular ou abrir uma atividade");
      return null;
    }
    const updated = { ...activeBudget, ...calcBudgetTotals(activeBudget) };
    onSaveBudget(updated);
    return updated;
  };

  const handleCreateActivity = () => {
    const updated = getPreparedBudget();
    if (updated) onCreateProjectFromBudget(updated);
  };

  const handleLinkActivity = () => {
    const updated = getPreparedBudget();
    if (updated) onLinkBudgetToProject(updated);
  };

  // ── Smart Site Lookup ──
  const handleSiteIdChange = (sid: string) => {
    updateSiteField("siteId", sid);
    const proj = projetos.find(p => p.siteIdSharing === sid || p.siteIdOperadora === sid || p.siteId === sid);
    if (proj) {
      updateBudget(b => ({
        ...b,
        siteInfo: {
          ...b.siteInfo,
          siteId: sid,
          sharingNome: proj.sharing || proj.sharingNome || b.siteInfo.sharingNome,
          siteIdSharing: proj.siteIdSharing || b.siteInfo.siteIdSharing,
          siteIdOperadora: proj.siteIdOperadora || b.siteInfo.siteIdOperadora,
          operadora: proj.operadora || b.siteInfo.operadora,
          uf: proj.uf || b.siteInfo.uf,
          municipio: proj.municipio || b.siteInfo.municipio,
          endereco: proj.endereco || proj.logradouro || b.siteInfo.endereco,
          latitude: proj.latitude || b.siteInfo.latitude || "",
          longitude: proj.longitude || b.siteInfo.longitude || "",
          categoriaProjeto: proj.categoriaProjeto || b.siteInfo.categoriaProjeto,
          tipoProjeto: proj.tipoProjeto || b.siteInfo.tipoProjeto,
        },
        contratante: proj.sharing || proj.sharingNome || proj.cliente || b.contratante,
        objeto: proj.descricao || proj.objeto || b.objeto,
        projetoId: proj.id
      }));
      notify(`Site ${sid} vinculado: ${proj.municipio || proj.uf || "Localizado"}`);
    }
  };

  if (!activeBudget) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
        <ClipboardList size={32} aria-hidden style={{ color: T.txMut }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txPri }}>Orçamentos multi-sharing</div>
        <div style={{ fontSize: 11, color: T.txMut, textAlign: "center", maxWidth: 400 }}>
          Crie orçamentos com múltiplos clientes de sharing, cada um com seu próprio template de LPU, BDI e parâmetros independentes.
        </div>
        <button onClick={createNewBudget} style={{ ...S.btn, ...S.btnBlue, ...comIcone, padding: "8px 24px", fontSize: 12, fontWeight: 700 }}>
          <Plus size={14} aria-hidden /> Novo orçamento
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {toast && <div style={{ padding: "4px 12px", fontSize: 11, color: T.green, background: T.green + "22", borderRadius: 6, textAlign: "center", border: `1px solid ${T.green}40`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} aria-hidden /> {toast}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.blue, fontFamily: MONO }}>{activeBudget.id}</span>
        <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: T.bg4, color: T.txMut, fontWeight: 600 }}>{activeBudget.status}</span>
        <span style={{ fontSize: 11, color: T.txMut }}>{activeBudget.data}</span>
        <div style={{ flex: 1 }} />

        {(["site", "config", "itens", "resumo"] as const).map(s => (
          <button key={s} onClick={() => setStep(s)} style={{
            ...S.ghost, fontWeight: step === s ? 700 : 400, fontSize: 11,
            color: step === s ? T.blue : T.txMut,
            borderColor: step === s ? T.blue : T.brBase,
            background: step === s ? T.blue + "18" : "transparent",
          }}>
            {s === "site" ? "1. Dados iniciais" : s === "config" ? "2. Sharings" : s === "itens" ? "3. Catálogo de itens" : "4. Resumo final"}
          </button>
        ))}

        <button onClick={handleSave} style={{ ...S.btn, ...S.btnGreen, ...comIcone, fontWeight: 700 }}><Save size={14} aria-hidden /> Salvar</button>
        {activeBudget.blocos.length > 0 && (
          <button onClick={() => gerarPdfBudgetV2(activeBudget, logoBase64)} style={{ ...S.ghost, ...comIcone }}><FileText size={14} aria-hidden /> Gerar PDF</button>
        )}
        {activeBudget.projetoId ? (
          <button onClick={() => onOpenLinkedProject(activeBudget.projetoId!)} style={{ ...S.ghost, ...comIcone, color: T.blue, borderColor: T.blue + "40", fontWeight: 700 }}>
            <HardHat size={14} aria-hidden /> Ver atividade
          </button>
        ) : (
          <>
            <button onClick={handleLinkActivity} style={{ ...S.ghost, ...comIcone, color: T.blue, borderColor: T.blue + "40", fontWeight: 700 }}>
              <Link2 size={14} aria-hidden /> Vincular atividade
            </button>
            <button onClick={handleCreateActivity} style={{ ...S.ghost, ...comIcone, color: T.blue, borderColor: T.blue + "40", fontWeight: 700 }}>
              <Plus size={14} aria-hidden /> Criar atividade
            </button>
          </>
        )}
        <button onClick={() => { setActiveBudget(null); setStep("site"); }} aria-label="Fechar orçamento" title="Fechar orçamento" style={{ ...S.ghost, ...comIcone, padding: "5px 8px" }}><X size={14} aria-hidden /></button>
      </div>

      {step === "site" && (
        <div className="step-enter" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: T.txPri, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={15} aria-hidden style={{ color: T.txMut }} /> Identificação do site
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Buscar Site ID</label>
                <input 
                  list="sites-list"
                  defaultValue={activeBudget.siteInfo.siteId || ""} 
                  onChange={e => handleSiteIdChange(e.target.value)} 
                  style={{ ...S.input, padding: "8px 10px", fontSize: 12, fontWeight: 700, fontFamily: MONO }} 
                  placeholder="Busque pelo Site ID do Sharing, Operadora ou Interno..." 
                />
                <datalist id="sites-list">
                  {projetos.map(p => (
                    <option key={p.id} value={p.siteIdSharing || p.siteIdOperadora || p.siteId}>
                      {p.municipio ? `${p.sharing || "Sem sharing"} (${p.municipio})` : (p.sharing || "Sem sharing")}
                    </option>
                  ))}
                </datalist>
                <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>Dica: Se o site existir no Controle de Obras, os dados abaixo serão preenchidos.</div>
              </div>

              <div>
                <label style={S.label}>Site ID Sharing</label>
                <input value={activeBudget.siteInfo.siteIdSharing || ""} onChange={e => updateSiteField("siteIdSharing", e.target.value)} style={S.input} placeholder="ID do Site no Sharing" />
              </div>
              <div>
                <label style={S.label}>Site ID Operadora</label>
                <input value={activeBudget.siteInfo.siteIdOperadora || ""} onChange={e => updateSiteField("siteIdOperadora", e.target.value)} style={S.input} placeholder="ID do Site na Operadora" />
              </div>
              
              <div>
                <label style={S.label}>Sharing</label>
                <input 
                  list="sharing-clients"
                  value={activeBudget.siteInfo.sharingNome || ""} 
                  onChange={e => {
                    const val = e.target.value;
                    updateSiteField("sharingNome", val);
                    // Se o contratante estiver vazio, sugere a sharing selecionada
                    if (!activeBudget.contratante) updateField("contratante", val);
                  }} 
                  style={S.input} 
                  placeholder="Selecione ou digite a Sharing..." 
                />
                <datalist id="sharing-clients">
                  {sharingClientsList.map(c => <option key={c.id} value={c.nome} />)}
                </datalist>
              </div>
              <div>
                <label style={S.label}>Operadora</label>
                <input 
                  list="operadora-clients"
                  value={activeBudget.siteInfo.operadora || ""} 
                  onChange={e => updateSiteField("operadora", e.target.value)} 
                  style={S.input} 
                  placeholder="Selecione ou digite a Operadora..." 
                />
                <datalist id="operadora-clients">
                  {operadoraClientsList.map(c => <option key={c.id} value={c.nome} />)}
                </datalist>
              </div>
              <div>
                <label style={S.label}>Município</label>
                <input value={activeBudget.siteInfo.municipio || ""} onChange={e => updateSiteField("municipio", e.target.value)} style={S.input} placeholder="Ex: Campinas" />
              </div>
              <div>
                <label style={S.label}>UF</label>
                <input value={activeBudget.siteInfo.uf || ""} onChange={e => updateSiteField("uf", e.target.value)} style={S.input} placeholder="SP" />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Endereço completo</label>
                <input value={activeBudget.siteInfo.endereco || ""} onChange={e => updateSiteField("endereco", e.target.value)} style={S.input} placeholder="Rua, número, bairro..." />
              </div>
              <div>
                <label style={S.label}>Latitude</label>
                <input value={activeBudget.siteInfo.latitude || ""} onChange={e => updateSiteField("latitude", e.target.value)} style={S.input} placeholder="-23.5505" />
              </div>
              <div>
                <label style={S.label}>Longitude</label>
                <input value={activeBudget.siteInfo.longitude || ""} onChange={e => updateSiteField("longitude", e.target.value)} style={S.input} placeholder="-46.6333" />
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontWeight: 700, color: T.txPri, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <NotebookPen size={15} aria-hidden style={{ color: T.txMut }} /> Dados do orçamento
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Contratante</label>
                <select 
                  value={activeBudget.contratante || ""} 
                  onChange={e => updateField("contratante", e.target.value)} 
                  style={{ ...S.input, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="">Selecione o cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </div>
              
              <div style={{ gridColumn: "span 2" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={S.label}>Categoria de projeto</label>
                    <select 
                      value={activeBudget.siteInfo.categoriaProjeto || "implantacao"} 
                      onChange={e => {
                        const cat = e.target.value;
                        const defaultType = cat === "manutencao" ? "manutencao_geral" : "bts";
                        updateBudget(b => ({
                          ...b,
                          siteInfo: { ...b.siteInfo, categoriaProjeto: cat, tipoProjeto: defaultType }
                        }));
                      }} 
                      style={{ ...S.input, fontSize: 12 }}
                    >
                      <option value="manutencao">Manutenção O&M</option>
                      <option value="implantacao">Implantação</option>
                    </select>
                  </div>
                  {activeBudget.siteInfo.categoriaProjeto === "manutencao" ? (
                    <div>
                      <label style={S.label}>Subtipo O&M</label>
                      <select 
                        value={activeBudget.siteInfo.tipoProjeto || "manutencao_geral"} 
                        onChange={e => updateBudget(b => ({
                          ...b,
                          siteInfo: { ...b.siteInfo, tipoProjeto: e.target.value }
                        }))} 
                        style={{ ...S.input, fontSize: 12, color: T.greenL, fontWeight: 700 }}
                      >
                        <option value="manutencao_preventiva">Preventiva O&M</option>
                        <option value="manutencao_corretiva">Corretiva O&M</option>
                        <option value="manutencao_emergencial">Emergencial O&M</option>
                        <option value="vistoria_tecnica">Vistoria Técnica</option>
                        <option value="manutencao_geral">Outros O&M</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={S.label}>Tipo de implantação</label>
                      <select 
                        value={activeBudget.siteInfo.tipoProjeto || "bts"} 
                        onChange={e => updateBudget(b => ({
                          ...b,
                          siteInfo: { ...b.siteInfo, tipoProjeto: e.target.value }
                        }))} 
                        style={{ ...S.input, fontSize: 12, color: T.blueL, fontWeight: 700 }}
                      >
                        <option value="bts">BTS (Greenfield)</option>
                        <option value="rt">Roof Top (RT)</option>
                        <option value="collo">Collo</option>
                        <option value="sls">SLS</option>
                        <option value="adequacao_infra">Adequação de Infra</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Assunto</label>
                <input value={activeBudget.objeto || ""} onChange={e => updateField("objeto", e.target.value)} style={S.input} placeholder="Ex: Remanejamento de Cabos, Adequação de Infra..." />
              </div>

              <div>
                <label style={S.label}>Vigência da proposta</label>
                <input value={activeBudget.vigencia || ""} onChange={e => updateField("vigencia", e.target.value)} style={S.input} placeholder="Ex: 10 DIAS" />
              </div>
              <div>
                <label style={S.label}>Fornecedor</label>
                <input value={activeBudget.fornecedor || "LS Office"} readOnly style={{ ...S.input, background: T.bg1, color: T.txMut }} />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Notas e observações</label>
                <textarea value={activeBudget.obs || ""} onChange={e => updateField("obs", e.target.value)} style={{ ...S.input, resize: "vertical", minHeight: 60 }} placeholder="Notas operacionais, prazos ou condições comerciais..." />
              </div>
            </div>
            <button onClick={() => setStep("config")} style={{ ...S.btn, ...S.btnBlue, marginTop: 12, width: "100%", padding: "10px", fontWeight: 700 }}>
              Confirmar dados e seguir para sharings
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 2: CONFIG SHARINGS */}
      {/* ══════════════════════════════════════════ */}
      {step === "config" && (
        <div className="step-enter" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Add sharing */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: T.txPri, fontSize: 13, marginBottom: 8, ...comIcone }}><Plus size={15} aria-hidden style={{ color: T.txMut }} /> Adicionar bloco de sharing</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sharingClients.filter(c => c.ativo).map(c => (
                <div key={c.id} style={{ display: "flex", gap: 3 }}>
                  <button onClick={() => addSharingBlock(c.id, "implantacao")} title={`Adicionar bloco de implantação ${c.nome}`} style={{ ...S.ghost, ...comIcone, borderColor: c.cor + "60", color: c.cor, fontSize: 11 }}>
                    <span style={{ fontWeight: 700 }}>{c.sigla}</span><span>Impl.</span>
                  </button>
                  <button onClick={() => addSharingBlock(c.id, "manutencao")} title={`Adicionar bloco de manutenção ${c.nome}`} style={{ ...S.ghost, ...comIcone, borderColor: c.cor + "60", color: c.cor, fontSize: 11 }}>
                    <span style={{ fontWeight: 700 }}>{c.sigla}</span><span>Mant.</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Block list */}
          {activeBudget.blocos.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 30, color: T.txMut }}>
              <Blocks size={24} aria-hidden style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 12 }}>Nenhum bloco ainda. Adicione um bloco de sharing acima.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
              {activeBudget.blocos.map(bloco => {
                const custo = calcBlocoCustoDireto(bloco);
                const total = calcBlocoTotal(bloco);
                return (
                  <div key={bloco.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: bloco.sharingCor }}>{bloco.sharingNome}</span>
                        <span style={{ fontSize: 11, color: T.txMut, marginLeft: 8, ...comIcone, gap: 4, verticalAlign: "middle" }}>
                          {bloco.tipo === "implantacao" ? <Wrench size={14} aria-hidden /> : <Cog size={14} aria-hidden />}
                          {bloco.tipo === "implantacao" ? "Implantação" : "Manutenção"}
                        </span>
                      </div>
                      <button onClick={() => removeBlock(bloco.id)} aria-label={`Remover bloco ${bloco.sharingNome}`} title="Remover bloco"
                        style={{ ...iconeBtn, color: T.txMut }}><X size={14} aria-hidden /></button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: T.txMut, display: "flex", gap: 12 }}><span>{bloco.itens.length} itens</span><span>Custo {fmt(custo)}</span></span>
                      <span style={{ fontWeight: 700, color: T.txPri }}>{fmt(total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeBudget.blocos.length > 0 && (
            <button onClick={() => { setStep("itens"); setActiveBlockId(activeBudget.blocos[0].id); }} style={{ ...S.btn, ...S.btnBlue, alignSelf: "flex-end" }}>
              Editar itens
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 3: ITENS (por bloco) */}
      {/* ══════════════════════════════════════════ */}
      {step === "itens" && (
        <div className="step-enter" style={{ display: "flex", gap: 8, flex: 1, overflow: "hidden" }}>
          {/* Block tabs (left) */}
          <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
            {activeBudget.blocos.map(bl => (
              <button key={bl.id} onClick={() => { setActiveBlockId(bl.id); setCatFilter("TODOS"); setSearchTerm(""); }}
                style={{
                  ...S.ghost, textAlign: "left", fontSize: 11, padding: "6px 8px",
                  borderLeft: `3px solid ${activeBlockId === bl.id ? bl.sharingCor : "transparent"}`,
                  background: activeBlockId === bl.id ? bl.sharingCor + "18" : "transparent",
                  color: activeBlockId === bl.id ? bl.sharingCor : T.txMut,
                  fontWeight: activeBlockId === bl.id ? 700 : 400,
                }}>
                <div>{bl.sharingNome}</div>
                <div style={{ fontSize: 11, opacity: 0.7, display: "flex", gap: 8 }}><span>{bl.tipo === "implantacao" ? "Implantação" : "Operação"}</span><span>{bl.itens.length} itens</span></div>
              </button>
            ))}
            <div style={{ height: 1, background: T.brSub, margin: "4px 0" }} />
            <div style={{ fontSize: 11, color: T.txMut, padding: "4px 8px" }}>
              <div>CAPEX <span style={{ color: T.txPri, fontWeight: 600 }}>{fmt(totals.totalCapex)}</span></div>
              <div>OPEX <span style={{ color: T.txPri, fontWeight: 600 }}>{fmt(totals.totalOpex)}</span></div>
              <div style={{ borderTop: `1px solid ${T.brSub}`, paddingTop: 3, marginTop: 3 }}>
                Total <span style={{ color: T.txPri, fontWeight: 700 }}>{fmt(totals.totalGeral)}</span>
              </div>
            </div>
          </div>

          {/* Main content: catalog + selected */}
          {activeBlock ? (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 300px", gap: 8, overflow: "hidden" }}>
              {/* Catalog */}
              <div style={{ ...S.card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: T.txPri, marginBottom: 6, ...comIcone }}>
                  <Package size={14} aria-hidden style={{ color: T.txMut }} />
                  <span>Catálogo de {activeBlock.tipo === "implantacao" ? "implantação" : "operação"}</span>
                  <span style={{ color: T.txMut, fontWeight: 400 }}>{currentCatalog.length} itens</span>
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <input placeholder="Buscar código, solução..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...S.input, flex: 1 }} />
                  <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...S.input, width: 120 }}>
                    <option value="TODOS">Todas</option>
                    {catalogCats.map((c: string) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: T.txMut, marginBottom: 3 }}>{filteredCatalog.length} encontrados</div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                      {["Cód", "Cat.", "Solução", "Unid", "Valor", ""].map(h => (
                        <th key={h} style={{ padding: "3px 4px", textAlign: "left", color: T.txMut, fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filteredCatalog.slice(0, 100).map((item: any, i: number) => (
                        <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 ? T.bg1 + "50" : "transparent" }}>
                          <td style={{ padding: "2px 4px", color: T.blue, fontWeight: 700, fontFamily: MONO }}>{item.cod}</td>
                          <td style={{ padding: "2px 4px" }}><span style={{ background: T.bg4, color: T.txSec, padding: "0px 4px", borderRadius: 3, fontSize: 11 }}>{item.resumo}</span></td>
                          <td style={{ padding: "2px 4px", color: T.txSec, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.solucao}>{item.solucao}</td>
                          <td style={{ padding: "2px 4px", color: T.txMut }}>{item.unid}</td>
                          <td style={{ padding: "2px 4px", color: (item.vl_medio ?? item.vlReferencia ?? item.vlUnitario ?? 0) > 0 ? T.txPri : T.txMut }}>{(item.vl_medio ?? item.vlReferencia ?? item.vlUnitario ?? 0) > 0 ? fmt(item.vl_medio ?? item.vlReferencia ?? item.vlUnitario) : "—"}</td>
                          <td style={{ padding: "2px 4px" }}>
                            <button onClick={() => addItemToBlock(activeBlock.id, item)} aria-label={`Adicionar ${item.cod} ao bloco`} title="Adicionar ao bloco" style={{ ...S.btn, ...comIcone, padding: "2px 5px" }}><Plus size={14} aria-hidden /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected items */}
              <div style={{ ...S.card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: activeBlock.sharingCor, ...comIcone }}>
                    <ShoppingCart size={14} aria-hidden /> {activeBlock.sharingNome} ({activeBlock.itens.length})
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.txPri }}>{fmt(calcBlocoTotal(activeBlock))}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {activeBlock.itens.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: T.txMut, fontSize: 12 }}>
                      <ClipboardList size={18} aria-hidden style={{ marginBottom: 4 }} />
                      <div>Nenhum item. Adicione itens do catálogo.</div>
                    </div>
                  ) : activeBlock.itens.map(item => {
                    const baseUnit = item.vlUnitario || 0;
                    const descPct = getItemDiscountPct(item);
                    const descValor = getItemDiscountValor(item);
                    const netUnit = calcItemUnitNet(item);
                    return (
                      <div key={item.id} style={{ background: T.bg0, borderRadius: 6, padding: "5px 6px", marginBottom: 3, border: `1px solid ${T.brSub}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: T.blue, fontWeight: 700, fontSize: 11, fontFamily: MONO }}>{item.cod}</span>
                          <button onClick={() => removeItemFromBlock(activeBlock.id, item.id)} aria-label={`Remover ${item.cod} do bloco`} title="Remover item"
                            style={{ ...iconeBtn, padding: 1, color: T.txMut }}><X size={14} aria-hidden /></button>
                        </div>
                        <div style={{ fontSize: 11, color: T.txMut, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.descricao}</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                          <div>
                            <label style={{ ...S.label, fontSize: 11 }}>Qtde</label>
                            <input type="number" value={item.qtde} min={0} onChange={e => updateItemField(activeBlock.id, item.id, "qtde", Number(e.target.value) || 0)} style={{ ...S.input, textAlign: "center", fontSize: 11 }} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize: 11 }}>Vl. unit. líquido</label>
                            <input type="number" value={Number(netUnit.toFixed(2))} min={0} step={0.01} onChange={e => updateItemUnitNet(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, fontSize: 11 }} />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <label style={{ ...S.label, fontSize: 11 }}>Total</label>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.txPri, paddingTop: 4 }}>{fmt(calcItemTotal(item))}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                          <div>
                            <label style={{ ...S.label, fontSize: 11 }}>Desc. %</label>
                            <input type="number" value={Number(descPct.toFixed(2))} min={0} max={100} step={0.01} onChange={e => updateItemDiscountPct(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, fontSize: 11 }} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize: 11 }}>Desc. R$</label>
                            <input type="number" value={Number(descValor.toFixed(2))} min={0} step={0.01} onChange={e => updateItemDiscountValor(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, fontSize: 11 }} />
                          </div>
                        </div>

                        {descValor > 0 && (
                          <div style={{ marginTop: 3, fontSize: 11, color: T.txMut }}>
                            Base: {fmt(baseUnit)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, ...S.card, display: "flex", alignItems: "center", justifyContent: "center", color: T.txMut }}>
              Selecione um bloco à esquerda
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 4: RESUMO */}
      {/* ══════════════════════════════════════════ */}
      {step === "resumo" && (
        <div className="step-enter" style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[{ l: "CAPEX (implantação)", v: totals.totalCapex, Icone: Wrench }, { l: "OPEX (operação)", v: totals.totalOpex, Icone: Cog }, { l: "Total geral", v: totals.totalGeral, Icone: Wallet }].map(kpi => (
              <div key={kpi.l} style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: T.txMut }}>
                  <kpi.Icone size={14} aria-hidden />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{kpi.l}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: kpi.v > 0 ? T.txPri : T.txMut }}>{kpi.v > 0 ? fmt(kpi.v) : "—"}</div>
              </div>
            ))}
          </div>

          {/* Resumo por Sharing */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.txPri, marginBottom: 8, ...comIcone }}><BarChart3 size={14} aria-hidden style={{ color: T.txMut }} /> Resumo por sharing</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                {["Sharing", "Tipo", "Custo direto", "BDI", "Lucro", "Desc.", "Total"].map(h => (
                  <th key={h} style={{ padding: "4px 6px", textAlign: "left", color: T.txMut, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {activeBudget.blocos.map(bl => {
                  const custo = calcBlocoCustoDireto(bl);
                  const total = calcBlocoTotal(bl);
                  return (
                    <tr key={bl.id} style={{ borderBottom: `1px solid ${T.brSub}` }}>
                      <td style={{ padding: "4px 6px", fontWeight: 700, color: bl.sharingCor }}>{bl.sharingNome}</td>
                      <td style={{ padding: "4px 6px", color: T.txMut }}><span style={{ ...comIcone, gap: 4 }}>{bl.tipo === "implantacao" ? <Wrench size={14} aria-hidden /> : <Cog size={14} aria-hidden />}{bl.tipo === "implantacao" ? "Impl." : "Oper."}</span></td>
                      <td style={{ padding: "4px 6px", color: T.txSec }}>{fmt(custo)}</td>
                      <td style={{ padding: "4px 6px", color: T.txMut }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.bdi} onChange={e => updateBlockField(bl.id, "bdi", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", color: T.txMut }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.lucro} onChange={e => updateBlockField(bl.id, "lucro", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", color: T.txMut }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.discount} onChange={e => updateBlockField(bl.id, "discount", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", fontWeight: 700, color: T.txPri }}>{fmt(total)}</td>
                    </tr>
                  );
                })}
                {/* Subtotals */}
                {implBlocks.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${T.brBase}` }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 600, color: T.txSec, fontSize: 11 }}>Subtotal CAPEX</td>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: T.txPri }}>{fmt(totals.totalCapex)}</td>
                  </tr>
                )}
                {operBlocks.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${T.brBase}` }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 600, color: T.txSec, fontSize: 11 }}>Subtotal OPEX</td>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: T.txPri }}>{fmt(totals.totalOpex)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: `2px solid ${T.brStrong}`, background: T.bg3 }}>
                  <td colSpan={6} style={{ padding: "6px", fontWeight: 700, color: T.txPri, fontSize: 12 }}>Total geral</td>
                  <td style={{ padding: "6px", fontWeight: 700, color: T.txPri, fontSize: 15 }}>{fmt(totals.totalGeral)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Detalhamento por bloco */}
          {activeBudget.blocos.map(bl => (
            <div key={bl.id} style={S.card}>
              <div style={{ fontSize: 12, marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, color: bl.sharingCor }}>{bl.sharingNome}</span>
                <span style={{ color: T.txSec }}>{bl.tipo === "implantacao" ? "Implantação" : "Operação"}</span>
                <span style={{ color: T.txMut, fontSize: 11 }}>{bl.itens.length} itens</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                  {["Item", "Categoria", "Descrição", "Config.", "Qtd", "Unid", "Vl. unitário", "Desc. R$", "Vl. unit. c/ desc.", "Vl. total"].map(h => (
                    <th key={h} style={{ padding: "3px 4px", textAlign: h.startsWith("Vl.") ? "right" : "left", color: T.txMut, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bl.itens.map((item, i) => {
                    const itemFinance = calcItemFinancials(item);
                    return (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 ? T.bg1 + "50" : "transparent" }}>
                      <td style={{ padding: "4px 4px", color: T.txMut, fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</td>
                      <td style={{ padding: "4px 4px", color: T.txMut }}>{item.categoria || "Geral"}</td>
                      <td style={{ padding: "4px 4px", color: T.txSec, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.descricao}>{item.descricao}</td>
                      <td style={{ padding: "4px 4px", color: T.txMut }}>{item.config || "—"}</td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>{item.qtde}</td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>{item.unid}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.txSec }}>{fmt(itemFinance.unitBase)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: itemFinance.discountUnit > 0 ? T.txSec : T.txMut }}>{itemFinance.discountUnit > 0 ? fmt(itemFinance.discountUnit) : "—"}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.txSec }}>{fmt(itemFinance.unitNet)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", fontWeight: 700, color: T.txPri }}>{fmt(itemFinance.totalNet)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, fontSize: 11 }}>
                <span style={{ color: T.txMut }}>Total com BDI, lucro e desconto</span>
                <span style={{ fontWeight: 700, color: T.txPri, marginLeft: 8 }}>{fmt(calcBlocoTotal(bl))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
