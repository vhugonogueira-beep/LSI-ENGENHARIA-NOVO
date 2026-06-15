import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Budget, BudgetSharingBlock, BudgetLineItem, SharingClient, LpuTemplate, calcBlocoTotal, calcBlocoCustoDireto, calcBudgetTotals, calcItemFinancials, calcItemTotal, calcItemUnitNet, getItemDiscountPct, getItemDiscountValor, newId } from "./types";
import { loadSharingClients } from "./sharingClients";
import { loadLpuTemplates, saveLpuTemplates, findTemplate, seedTemplatesFromDB } from "./lpuTemplates";
import { gerarPdfBudgetV2 } from "./gerarPdfV2";

// Theme (original dark)
const T = {
  bg0: "#07090f", bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030", bg4: "#222a3a",
  brSub: "#1e2840", brBase: "#2d3a52", brStrong: "#3d5070",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", blueD: "#1d4ed8", blueL: "#93c5fd",
  green: "#34d399", greenD: "#0d9e74", greenL: "#6ee7b7",
  amber: "#fbbf24", amberD: "#d97706",
  red: "#f87171", redD: "#dc2626",
  purple: "#a78bfa", cyan: "#67e8f9", orange: "#fb923c",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Styles ──
const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 6px 16px rgba(0, 0, 0, 0.35)" } as React.CSSProperties,
  input: { padding: "5px 10px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", fontFamily: "inherit", width: "100%", transition: "all 0.15s" } as React.CSSProperties,
  label: { fontSize: 10, color: T.txSec, display: "block", marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" } as React.CSSProperties,
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
    let t = loadLpuTemplates();
    if (t.length === 0) {
      t = seedTemplatesFromDB(dbImpl, dbOp, dbHighline);
      saveLpuTemplates(t);
    }
    setTemplates(t);
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
        <div style={{ fontSize: 36 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>Sistema de Orçamentos Multi-Sharing</div>
        <div style={{ fontSize: 11, color: T.txMut, textAlign: "center", maxWidth: 400 }}>
          Crie orçamentos com múltiplos clientes de sharing, cada um com seu próprio template de LPU, BDI e parâmetros independentes.
        </div>
        <button onClick={createNewBudget} style={{ ...S.btn, ...S.btnBlue, padding: "8px 24px", fontSize: 12, fontWeight: 700 }}>
          + Novo Orçamento
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", animation: "fadeIn 0.4s ease-out" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .step-enter { animation: fadeIn 0.3s ease-out; }
      `}</style>
      {toast && <div style={{ padding: "4px 12px", fontSize: 10, color: T.green, background: T.green + "22", borderRadius: 6, textAlign: "center", border: `1px solid ${T.green}40` }}>✅ {toast}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.blue }}>{activeBudget.id}</span>
        <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 10, background: T.bg4, color: T.txMut, fontWeight: 600 }}>{activeBudget.status}</span>
        <span style={{ fontSize: 9, color: T.txDis }}>{activeBudget.data}</span>
        <div style={{ flex: 1 }} />

        {(["site", "config", "itens", "resumo"] as const).map(s => (
          <button key={s} onClick={() => setStep(s)} style={{
            ...S.ghost, fontWeight: step === s ? 700 : 400, fontSize: 10,
            color: step === s ? T.blue : T.txMut,
            borderColor: step === s ? T.blue : T.brBase,
            background: step === s ? T.blue + "18" : "transparent",
          }}>
            {s === "site" ? "1. Dados Iniciais" : s === "config" ? "2. Sharings" : s === "itens" ? "3. Catálogo de Itens" : "4. Resumo Final"}
          </button>
        ))}

        <button onClick={handleSave} style={{ ...S.btn, ...S.btnGreen, fontWeight: 700 }}>💾 Salvar</button>
        {activeBudget.blocos.length > 0 && (
          <button onClick={() => gerarPdfBudgetV2(activeBudget, logoBase64)} style={{ ...S.ghost, color: T.amber, borderColor: T.amber + "40" }}>📄 PDF</button>
        )}
        {activeBudget.projetoId ? (
          <button onClick={() => onOpenLinkedProject(activeBudget.projetoId!)} style={{ ...S.ghost, color: T.green, borderColor: T.green + "40", fontWeight: 700 }}>
            🏗️ Ver atividade
          </button>
        ) : (
          <>
            <button onClick={handleLinkActivity} style={{ ...S.ghost, color: T.blue, borderColor: T.blue + "40", fontWeight: 700 }}>
              🔗 Vincular atividade
            </button>
            <button onClick={handleCreateActivity} style={{ ...S.ghost, color: T.green, borderColor: T.green + "40", fontWeight: 700 }}>
              ➕ Criar atividade
            </button>
          </>
        )}
        <button onClick={() => { setActiveBudget(null); setStep("site"); }} style={S.ghost}>✕</button>
      </div>

      {step === "site" && (
        <div className="step-enter" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: T.blue, fontSize: 11, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>📍</span> Identificação do Site
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>BUSCA SITE ID (Autocomplete)</label>
                <input 
                  list="sites-list"
                  defaultValue={activeBudget.siteInfo.siteId || ""} 
                  onChange={e => handleSiteIdChange(e.target.value)} 
                  style={{ ...S.input, padding: "8px 10px", fontSize: 12, fontWeight: 700 }} 
                  placeholder="Busque pelo Site ID do Sharing, Operadora ou Interno..." 
                />
                <datalist id="sites-list">
                  {projetos.map(p => (
                    <option key={p.id} value={p.siteIdSharing || p.siteIdOperadora || p.siteId}>
                      {p.sharing || "—"} · {p.municipio}
                    </option>
                  ))}
                </datalist>
                <div style={{ fontSize: 9, color: T.txMut, marginTop: 4 }}>Dica: Se o site existir no Controle de Obras, os dados abaixo serão preenchidos.</div>
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
                <label style={S.label}>Endereço Completo</label>
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
            <div style={{ fontWeight: 700, color: T.purple, fontSize: 11, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>📝</span> Dados do Orçamento
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Contratante</label>
                <select 
                  value={activeBudget.contratante || ""} 
                  onChange={e => updateField("contratante", e.target.value)} 
                  style={{ ...S.input, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="">— Selecione o Cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </div>
              
              <div style={{ gridColumn: "span 2" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={S.label}>Categoria de Projeto</label>
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
                      <label style={S.label}>Sub-tipo O&M</label>
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
                      <label style={S.label}>Tipo de Implantação</label>
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
                <label style={S.label}>Vigência da Proposta</label>
                <input value={activeBudget.vigencia || ""} onChange={e => updateField("vigencia", e.target.value)} style={S.input} placeholder="Ex: 10 DIAS" />
              </div>
              <div>
                <label style={S.label}>Fornecedor</label>
                <input value={activeBudget.fornecedor || "LS Office"} readOnly style={{ ...S.input, background: T.bg1, color: T.txMut }} />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Notas e Observações</label>
                <textarea value={activeBudget.obs || ""} onChange={e => updateField("obs", e.target.value)} style={{ ...S.input, resize: "vertical", minHeight: 60 }} placeholder="Notas operacionais, prazos ou condições comerciais..." />
              </div>
            </div>
            <button onClick={() => setStep("config")} style={{ ...S.btn, ...S.btnBlue, marginTop: 12, width: "100%", padding: "10px", fontWeight: 700 }}>
              Confirmar Dados e Ir para Sharings →
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
            <div style={{ fontWeight: 700, color: T.amber, fontSize: 11, marginBottom: 8 }}>➕ Adicionar Bloco de Sharing</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sharingClients.filter(c => c.ativo).map(c => (
                <div key={c.id} style={{ display: "flex", gap: 3 }}>
                  <button onClick={() => addSharingBlock(c.id, "implantacao")} style={{ ...S.ghost, borderColor: c.cor + "60", color: c.cor, fontSize: 9 }}>
                    {c.sigla} · Impl.
                  </button>
                  <button onClick={() => addSharingBlock(c.id, "manutencao")} style={{ ...S.ghost, borderColor: c.cor + "60", color: c.cor, fontSize: 9 }}>
                    {c.sigla} · Mant.
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Block list */}
          {activeBudget.blocos.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 30, color: T.txDis }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🧱</div>
              <div style={{ fontSize: 11 }}>Adicione blocos de sharing acima</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
              {activeBudget.blocos.map(bloco => {
                const custo = calcBlocoCustoDireto(bloco);
                const total = calcBlocoTotal(bloco);
                return (
                  <div key={bloco.id} style={{ ...S.card, borderLeft: `3px solid ${bloco.sharingCor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: bloco.sharingCor }}>{bloco.sharingNome}</span>
                        <span style={{ fontSize: 9, color: T.txMut, marginLeft: 6 }}>{bloco.tipo === "implantacao" ? "🔧 Implantação" : "⚙️ Manutenção"}</span>
                      </div>
                      <button onClick={() => removeBlock(bloco.id)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: T.txMut }}>{bloco.itens.length} itens · Custo: {fmt(custo)}</span>
                      <span style={{ fontWeight: 700, color: bloco.sharingCor }}>{fmt(total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeBudget.blocos.length > 0 && (
            <button onClick={() => { setStep("itens"); setActiveBlockId(activeBudget.blocos[0].id); }} style={{ ...S.btn, ...S.btnBlue, alignSelf: "flex-end" }}>
              Próximo → Editar Itens
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
                  ...S.ghost, textAlign: "left", fontSize: 9, padding: "6px 8px",
                  borderLeft: `3px solid ${activeBlockId === bl.id ? bl.sharingCor : "transparent"}`,
                  background: activeBlockId === bl.id ? bl.sharingCor + "18" : "transparent",
                  color: activeBlockId === bl.id ? bl.sharingCor : T.txMut,
                  fontWeight: activeBlockId === bl.id ? 700 : 400,
                }}>
                <div>{bl.sharingNome}</div>
                <div style={{ fontSize: 8, opacity: 0.7 }}>{bl.tipo === "implantacao" ? "Implantação" : "Operação"} · {bl.itens.length} itens</div>
              </button>
            ))}
            <div style={{ height: 1, background: T.brSub, margin: "4px 0" }} />
            <div style={{ fontSize: 9, color: T.txMut, padding: "4px 8px" }}>
              <div>CAPEX: <span style={{ color: T.blue, fontWeight: 700 }}>{fmt(totals.totalCapex)}</span></div>
              <div>OPEX: <span style={{ color: T.green, fontWeight: 700 }}>{fmt(totals.totalOpex)}</span></div>
              <div style={{ borderTop: `1px solid ${T.brSub}`, paddingTop: 3, marginTop: 3 }}>
                TOTAL: <span style={{ color: T.amber, fontWeight: 700 }}>{fmt(totals.totalGeral)}</span>
              </div>
            </div>
          </div>

          {/* Main content: catalog + selected */}
          {activeBlock ? (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 300px", gap: 8, overflow: "hidden" }}>
              {/* Catalog */}
              <div style={{ ...S.card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: activeBlock.sharingCor, marginBottom: 6 }}>
                  📦 Catálogo {activeBlock.tipo === "implantacao" ? "Implantação" : "Operação"} — {currentCatalog.length} itens
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <input placeholder="Buscar código, solução..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...S.input, flex: 1 }} />
                  <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...S.input, width: 120 }}>
                    <option value="TODOS">Todas</option>
                    {catalogCats.map((c: string) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 8, color: T.txMut, marginBottom: 3 }}>{filteredCatalog.length} encontrados</div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                      {["Cód", "Cat.", "Solução", "Unid", "Valor", ""].map(h => (
                        <th key={h} style={{ padding: "3px 4px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 8 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filteredCatalog.slice(0, 100).map((item: any, i: number) => (
                        <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 ? T.bg1 + "50" : "transparent" }}>
                          <td style={{ padding: "2px 4px", color: T.blue, fontWeight: 700 }}>{item.cod}</td>
                          <td style={{ padding: "2px 4px" }}><span style={{ background: T.bg4, color: T.txSec, padding: "0px 4px", borderRadius: 3, fontSize: 8 }}>{item.resumo}</span></td>
                          <td style={{ padding: "2px 4px", color: T.txSec, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.solucao}>{item.solucao}</td>
                          <td style={{ padding: "2px 4px", color: T.txMut }}>{item.unid}</td>
                          <td style={{ padding: "2px 4px", color: T.green, fontWeight: 700 }}>{fmt(item.vl_medio ?? item.vlReferencia ?? item.vlUnitario ?? 0)}</td>
                          <td style={{ padding: "2px 4px" }}>
                            <button onClick={() => addItemToBlock(activeBlock.id, item)} style={{ ...S.btn, padding: "1px 6px", fontSize: 8 }}>+</button>
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
                  <span style={{ fontWeight: 700, fontSize: 10, color: activeBlock.sharingCor }}>
                    🛒 {activeBlock.sharingNome} ({activeBlock.itens.length})
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: T.amber }}>{fmt(calcBlocoTotal(activeBlock))}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {activeBlock.itens.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: T.txDis, fontSize: 10 }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📋</div>
                      Adicione itens do catálogo
                    </div>
                  ) : activeBlock.itens.map(item => {
                    const baseUnit = item.vlUnitario || 0;
                    const descPct = getItemDiscountPct(item);
                    const descValor = getItemDiscountValor(item);
                    const netUnit = calcItemUnitNet(item);
                    return (
                      <div key={item.id} style={{ background: T.bg0, borderRadius: 6, padding: "5px 6px", marginBottom: 3, border: `1px solid ${T.brSub}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: T.blue, fontWeight: 700, fontSize: 9 }}>{item.cod}</span>
                          <button onClick={() => removeItemFromBlock(activeBlock.id, item.id)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 10 }}>✕</button>
                        </div>
                        <div style={{ fontSize: 8, color: T.txMut, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.descricao}</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                          <div>
                            <label style={{ ...S.label, fontSize: 7 }}>Qtde</label>
                            <input type="number" value={item.qtde} min={0} onChange={e => updateItemField(activeBlock.id, item.id, "qtde", Number(e.target.value) || 0)} style={{ ...S.input, textAlign: "center", fontSize: 10 }} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize: 7 }}>VL Unit (Liq.)</label>
                            <input type="number" value={Number(netUnit.toFixed(2))} min={0} step={0.01} onChange={e => updateItemUnitNet(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, color: T.green, fontSize: 10 }} />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <label style={{ ...S.label, fontSize: 7 }}>Total</label>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.amber, paddingTop: 4 }}>{fmt(calcItemTotal(item))}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                          <div>
                            <label style={{ ...S.label, fontSize: 7 }}>Desc. %</label>
                            <input type="number" value={Number(descPct.toFixed(2))} min={0} max={100} step={0.01} onChange={e => updateItemDiscountPct(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, color: T.amber, fontSize: 10 }} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize: 7 }}>Desc. R$</label>
                            <input type="number" value={Number(descValor.toFixed(2))} min={0} step={0.01} onChange={e => updateItemDiscountValor(activeBlock.id, item, Number(e.target.value) || 0)} style={{ ...S.input, color: T.amber, fontSize: 10 }} />
                          </div>
                        </div>

                        {descValor > 0 && (
                          <div style={{ marginTop: 3, fontSize: 8, color: T.txMut }}>
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
            <div style={{ flex: 1, ...S.card, display: "flex", alignItems: "center", justifyContent: "center", color: T.txDis }}>
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
            {[{ l: "CAPEX (Implantação)", v: totals.totalCapex, c: T.blue, icon: "🔧" }, { l: "OPEX (Operação)", v: totals.totalOpex, c: T.green, icon: "⚙️" }, { l: "TOTAL GERAL", v: totals.totalGeral, c: T.amber, icon: "💰" }].map(kpi => (
              <div key={kpi.l} style={{ ...S.card, borderLeft: `3px solid ${kpi.c}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{kpi.icon}</span>
                  <span style={{ fontSize: 9, color: T.txMut, fontWeight: 700 }}>{kpi.l}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: kpi.c }}>{fmt(kpi.v)}</div>
              </div>
            ))}
          </div>

          {/* Resumo por Sharing */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 11, color: T.txPri, marginBottom: 8 }}>📊 Resumo por Sharing</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                {["Sharing", "Tipo", "Custo Direto", "BDI", "Lucro", "Desc.", "Total"].map(h => (
                  <th key={h} style={{ padding: "4px 6px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 9 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {activeBudget.blocos.map(bl => {
                  const custo = calcBlocoCustoDireto(bl);
                  const total = calcBlocoTotal(bl);
                  return (
                    <tr key={bl.id} style={{ borderBottom: `1px solid ${T.brSub}` }}>
                      <td style={{ padding: "4px 6px", fontWeight: 700, color: bl.sharingCor }}>{bl.sharingNome}</td>
                      <td style={{ padding: "4px 6px", color: T.txMut }}>{bl.tipo === "implantacao" ? "🔧 Impl." : "⚙️ Oper."}</td>
                      <td style={{ padding: "4px 6px", color: T.txSec }}>{fmt(custo)}</td>
                      <td style={{ padding: "4px 6px", color: T.purple }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.bdi} onChange={e => updateBlockField(bl.id, "bdi", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", color: T.green }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.lucro} onChange={e => updateBlockField(bl.id, "lucro", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", color: T.red }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={bl.discount} onChange={e => updateBlockField(bl.id, "discount", Number(e.target.value))} style={{ ...S.input, width: 45, padding: "2px 4px", textAlign: "center" }} /> %
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", fontWeight: 700, color: T.amber }}>{fmt(total)}</td>
                    </tr>
                  );
                })}
                {/* Subtotals */}
                {implBlocks.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${T.blue}40` }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 700, color: T.blue, fontSize: 10 }}>Subtotal CAPEX</td>
                    <td style={{ padding: "4px 6px", fontWeight: 900, color: T.blue }}>{fmt(totals.totalCapex)}</td>
                  </tr>
                )}
                {operBlocks.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${T.green}40` }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 700, color: T.green, fontSize: 10 }}>Subtotal OPEX</td>
                    <td style={{ padding: "4px 6px", fontWeight: 900, color: T.green }}>{fmt(totals.totalOpex)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: `2px solid ${T.amber}`, background: T.bg3 }}>
                  <td colSpan={6} style={{ padding: "6px", fontWeight: 900, color: T.amber, fontSize: 12 }}>TOTAL GERAL</td>
                  <td style={{ padding: "6px", fontWeight: 900, color: T.amber, fontSize: 14 }}>{fmt(totals.totalGeral)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Detalhamento por bloco */}
          {activeBudget.blocos.map(bl => (
            <div key={bl.id} style={{ ...S.card, borderLeft: `3px solid ${bl.sharingCor}` }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: bl.sharingCor, marginBottom: 6 }}>
                {bl.sharingNome} — {bl.tipo === "implantacao" ? "Implantação" : "Operação"} ({bl.itens.length} itens)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                  {["ITEM", "CATEGORIA", "DESCRIÇÃO", "CONFIG.", "QTD", "UNID", "VL UNITÁRIO", "DESC. R$", "VL UNIT. C/DESC", "VL TOTAL"].map(h => (
                    <th key={h} style={{ padding: "3px 4px", textAlign: h.startsWith("VL") ? "right" : "left", color: T.txMut, fontWeight: 700, fontSize: 8 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bl.itens.map((item, i) => {
                    const itemFinance = calcItemFinancials(item);
                    return (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 ? T.bg1 + "50" : "transparent" }}>
                      <td style={{ padding: "4px 4px", color: T.blue, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</td>
                      <td style={{ padding: "4px 4px", color: T.txMut }}>{item.categoria?.toUpperCase() || "GERAL"}</td>
                      <td style={{ padding: "4px 4px", color: T.txSec, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.descricao}>{item.descricao}</td>
                      <td style={{ padding: "4px 4px", color: T.txMut }}>{item.config || "—"}</td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>{item.qtde}</td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>{item.unid}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.txSec }}>{fmt(itemFinance.unitBase)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.red }}>{fmt(itemFinance.discountUnit)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", color: T.green }}>{fmt(itemFinance.unitNet)}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right", fontWeight: 700, color: T.amber }}>{fmt(itemFinance.totalNet)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, fontSize: 10 }}>
                <span style={{ color: T.txMut }}>Total com BDI/Lucro/Desc: </span>
                <span style={{ fontWeight: 900, color: bl.sharingCor, marginLeft: 8 }}>{fmt(calcBlocoTotal(bl))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
