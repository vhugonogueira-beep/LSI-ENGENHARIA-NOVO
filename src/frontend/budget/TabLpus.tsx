import React, { useState, useEffect } from "react";
import { LpuTemplate, LpuTemplateItem } from "./types";
import { loadLpuTemplates, saveLpuTemplates } from "./lpuTemplates";

const T = {
  bg0: "#07090f", bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030", bg4: "#222a3a",
  brSub: "#1e2840", brBase: "#2d3a52", brStrong: "#3d5070",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", green: "#34d399", amber: "#fbbf24", red: "#f87171", purple: "#a78bfa", cyan: "#67e8f9"
};

const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 6px 16px rgba(0, 0, 0, 0.35)" } as React.CSSProperties,
  input: { padding: "8px 10px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", width: "100%", boxSizing: "border-box", transition: "all 0.15s" } as React.CSSProperties,
  label: { fontSize: 10, color: T.txSec, display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" } as React.CSSProperties,
  btn: { padding: "8px 16px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg1, cursor: "pointer", color: T.txPri, fontWeight: 700, transition: "all 0.15s" } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "#fff", borderColor: T.blue } as React.CSSProperties,
};

const COMPANY_CODE = "LSI";

const normalizeToken = (v: string) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const getClientCode = (tpl: LpuTemplate) => {
  const fromSharing = normalizeToken(tpl.sharingId || "");
  if (fromSharing) return fromSharing.slice(0, 3);

  const name = tpl.nome || "";
  const m = name.match(/LPU\s+([^—-]+)/i);
  const raw = m ? m[1] : name;
  const cleaned = normalizeToken(raw);
  if (cleaned) return cleaned.slice(0, 3);
  return "GEN";
};

const getTypeCode = (tpl: LpuTemplate) => (tpl.tipo === "manutencao" ? "OP" : "IMP");

const getNextCode = (tpl: LpuTemplate, itens: LpuTemplateItem[]) => {
  if (!tpl) return "";
  const typeCode = getTypeCode(tpl);
  const clientCode = getClientCode(tpl);
  const prefix = `${typeCode}-${COMPANY_CODE}-${clientCode}-`;
  const re = new RegExp(`^${typeCode}-${COMPANY_CODE}-${clientCode}-(\\d+)$`, "i");
  let max = 0;
  (itens || []).forEach(i => {
    const m = re.exec((i.cod || "").trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
};

export default function TabLpus() {
  const [templates, setTemplates] = useState<LpuTemplate[]>([]);
  const [activeTplId, setActiveTplId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editCod, setEditCod] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LpuTemplateItem>>({});

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    // Carrega do localStorage as LPUs ativas (ou os defaults do sistema que foram jogados pro localstorage)
    const tpls = loadLpuTemplates();
    setTemplates(tpls);
    if (tpls.length > 0) setActiveTplId(tpls[0].id);
  }, []);

  const activeTpl = templates.find(t => t.id === activeTplId);

  const [newItem, setNewItem] = useState<Partial<LpuTemplateItem>>({ cod: "", resumo: "GERAL", solucao: "", config: "", unid: "Und", tipoCusto: "Serviço", vlReferencia: 0 });
  const autoCode = activeTpl ? getNextCode(activeTpl, activeTpl.itens || []) : "";

  useEffect(() => {
    if (!activeTpl) return;
    setNewItem(p => (p.cod === autoCode ? p : { ...p, cod: autoCode }));
  }, [activeTpl, autoCode]);

  const handleAddItem = () => {
    if (!activeTpl) return;
    if (!newItem.cod || !newItem.solucao) { notify("Preencha Código e Solução"); return; }
    
    // Evita conflitos de código duplicado
    if (activeTpl.itens.some(i => i.cod === newItem.cod)) {
      notify("Já existe um item com este código nesta LPU.");
      return;
    }
    
    const itemFull: LpuTemplateItem = {
      cod: newItem.cod,
      resumo: newItem.resumo || "GERAL",
      solucao: newItem.solucao,
      config: newItem.config || "",
      unid: newItem.unid || "Und",
      tipoCusto: newItem.tipoCusto as any || "Serviço",
      vlReferencia: Number(newItem.vlReferencia) || 0,
      obrigatorio: false
    };

    const newTpls = templates.map(t => t.id === activeTpl.id ? { ...t, itens: [itemFull, ...t.itens] } : t);
    setTemplates(newTpls);
    saveLpuTemplates(newTpls);
    notify("Item adicionado com sucesso!");
    setNewItem({ cod: "", resumo: "GERAL", solucao: "", config: "", unid: "Und", tipoCusto: "Serviço", vlReferencia: 0 });
  };

  const handleRemoveItem = (cod: string) => {
    if (!activeTpl || !confirm("Tem certeza que deseja remover este item desta Base/LPU?")) return;
    const newTpls = templates.map(t => t.id === activeTpl.id ? { ...t, itens: t.itens.filter(i => i.cod !== cod) } : t);
    setTemplates(newTpls);
    saveLpuTemplates(newTpls);
    notify("Item removido com sucesso!");
  };

  const startEdit = (item: LpuTemplateItem) => {
    setEditCod(item.cod);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditCod(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (!activeTpl || !editCod) return;
    if (!editForm.solucao || !editForm.resumo) { notify("Preencha Categoria e Solução"); return; }
    const newTpls = templates.map(t => {
      if (t.id !== activeTpl.id) return t;
      return {
        ...t,
        itens: t.itens.map(i => i.cod === editCod ? {
          ...i,
          resumo: editForm.resumo || i.resumo,
          solucao: editForm.solucao || i.solucao,
          config: editForm.config || "",
          unid: editForm.unid || i.unid,
          tipoCusto: (editForm.tipoCusto as any) || i.tipoCusto,
          vlReferencia: Number(editForm.vlReferencia) || 0,
        } : i)
      };
    });
    setTemplates(newTpls);
    saveLpuTemplates(newTpls);
    notify("Item atualizado com sucesso!");
    cancelEdit();
  };

  return (
    <div style={{ padding: 20, animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", height: "calc(100vh - 40px)", boxSizing: "border-box", gap: 16 }}>
      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, background: T.green, color: "#fff", padding: "10px 20px", borderRadius: 8, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>{toast}</div>}
      
      <div style={{ display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>
        {/* SIDEBAR LPUs */}
        <div style={{ ...S.card, width: 260, display: "flex", flexDirection: "column", gap: 12, padding: 16, overflow: "hidden" }}>
          <h3 style={{ margin: 0, fontSize: 14, color: T.amber, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📚</span> Bases e LPUs Cadastradas
          </h3>
          <div style={{ fontSize: 11, color: T.txMut }}>
            Selecione a tabela de preços (LPU) para editar seus itens e valores de referência.
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
            {templates.map(t => (
              <button key={t.id} onClick={() => setActiveTplId(t.id)}
                style={{
                  ...S.btn,
                  background: activeTplId === t.id ? T.amber + "22" : "transparent",
                  color: activeTplId === t.id ? T.amber : T.txMut,
                  border: `1px solid ${activeTplId === t.id ? T.amber + "66" : T.brBase}`,
                  textAlign: "left", padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 4
                }}>
                <div style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.nome}</div>
                <div style={{ fontSize: 9, opacity: 0.8, background: activeTplId === t.id ? T.amber+"44" : T.bg4, padding: "2px 6px", borderRadius: 10, alignSelf: "flex-start" }}>
                  {t.itens.length} itens {t.tipo === "implantacao" ? "🔧" : "⚙️"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* DETAILS */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
          {!activeTpl ? (
            <div style={{ ...S.card, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.txDis }}>
              Selecione uma Base LPU ao lado.
            </div>
          ) : (
            <>
              {/* HEADER TPL */}
              <div style={{...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.amber }}>{activeTpl.nome}</div>
                  <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>{activeTpl.itens.length} itens cadastrados nesta base. Versão: {activeTpl.versao}</div>
                </div>
              </div>

              {/* FORM ADICIONAR */}
              <div style={{...S.card, background: `linear-gradient(135deg, ${T.bg2}, ${T.bg3})`}}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 12 }}>➕ Novo Item na LPU</div>
                <div style={{ display: "grid", gridTemplateColumns: "100px 150px 1fr 100px", gap: 8, alignItems: "end", marginBottom: 8 }}>
                  <div>
                    <label style={S.label}>Código do Item (Auto)</label>
                    <input style={S.input} value={newItem.cod} readOnly placeholder="Gerado automaticamente" />
                  </div>
                  <div>
                    <label style={S.label}>Categoria / Resumo</label>
                    <input style={S.input} value={newItem.resumo} onChange={e => setNewItem(p => ({...p, resumo: e.target.value}))} placeholder="Ex: GERAL" />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={S.label}>Solução / Descrição</label>
                    <input style={S.input} value={newItem.solucao} onChange={e => setNewItem(p => ({...p, solucao: e.target.value}))} placeholder="Descrição completa..." />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 150px 150px", gap: 8, alignItems: "end" }}>
                  <div>
                    <label style={S.label}>Configuração (Opcional)</label>
                    <input style={S.input} value={newItem.config} onChange={e => setNewItem(p => ({...p, config: e.target.value}))} placeholder="3 metros, 50mm..." />
                  </div>
                  <div>
                    <label style={S.label}>Unidade</label>
                    <input style={S.input} value={newItem.unid} onChange={e => setNewItem(p => ({...p, unid: e.target.value}))} placeholder="Und, ML, UN..." />
                  </div>
                  <div>
                    <label style={S.label}>Tipo de Custo</label>
                    <select style={S.input} value={newItem.tipoCusto} onChange={e => setNewItem(p => ({...p, tipoCusto: e.target.value as any}))}>
                      <option>Serviço</option>
                      <option>Material</option>
                      <option>MO</option>
                      <option>Verba</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Valor (R$)</label>
                    <input type="number" style={{...S.input, color: T.green, fontWeight: 700}} value={newItem.vlReferencia || ""} onChange={e => setNewItem(p => ({...p, vlReferencia: Number(e.target.value)}))} />
                  </div>
                  <div>
                    <button onClick={handleAddItem} style={{ ...S.btn, ...S.btnBlue, width: "100%" }}>✓ Adicionar</button>
                  </div>
                </div>
              </div>

              {/* ITENS ATUAIS */}
              <div style={{ ...S.card, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.txPri, padding: "14px 16px", borderBottom: `1px solid ${T.brSub}`, background: T.bg2 }}>
                  Catálogo de Itens ({activeTpl.itens.length})
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead style={{ background: T.bg1, position: "sticky", top: 0, zIndex: 10 }}>
                      <tr>
                        {["Código", "Categoria", "Descrição", "Conf.", "Unid", "Tipo", "Referência", "Ações"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: h === "Referência" || h === "Ações" ? "right" : "left", color: T.txMut, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${T.brBase}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTpl.itens.map((it, idx) => {
                        const isEdit = editCod === it.cod;
                        return (
                          <tr key={`${it.cod}-${idx}`} style={{ borderBottom: `1px solid ${T.brSub}`, background: idx % 2 === 0 ? "transparent" : T.bg1 + "40" }}>
                            <td style={{ padding: "8px 12px", color: T.cyan, fontWeight: 700, width: "12%" }}>{it.cod}</td>
                            <td style={{ padding: "8px 12px", color: T.txSec, width: "12%" }}>
                              {isEdit ? (
                                <input style={{ ...S.input, padding: "6px 8px" }} value={editForm.resumo || ""} onChange={e => setEditForm(p => ({ ...p, resumo: e.target.value }))} />
                              ) : it.resumo}
                            </td>
                            <td style={{ padding: "8px 12px", color: T.txPri, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.solucao}>
                              {isEdit ? (
                                <input style={{ ...S.input, padding: "6px 8px" }} value={editForm.solucao || ""} onChange={e => setEditForm(p => ({ ...p, solucao: e.target.value }))} />
                              ) : it.solucao}
                            </td>
                            <td style={{ padding: "8px 12px", color: T.txSec }}>
                              {isEdit ? (
                                <input style={{ ...S.input, padding: "6px 8px" }} value={editForm.config || ""} onChange={e => setEditForm(p => ({ ...p, config: e.target.value }))} />
                              ) : (it.config || "-")}
                            </td>
                            <td style={{ padding: "8px 12px", color: T.txMut }}>
                              {isEdit ? (
                                <input style={{ ...S.input, padding: "6px 8px", width: 70 }} value={editForm.unid || ""} onChange={e => setEditForm(p => ({ ...p, unid: e.target.value }))} />
                              ) : it.unid}
                            </td>
                            <td style={{ padding: "8px 12px", color: T.txMut }}>
                              {isEdit ? (
                                <select style={{ ...S.input, padding: "6px 8px" }} value={editForm.tipoCusto || "Serviço"} onChange={e => setEditForm(p => ({ ...p, tipoCusto: e.target.value as any }))}>
                                  <option>Serviço</option>
                                  <option>Material</option>
                                  <option>MO</option>
                                  <option>Verba</option>
                                </select>
                              ) : it.tipoCusto}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: T.green, fontWeight: 600, width: "12%" }}>
                              {isEdit ? (
                                <input type="number" style={{ ...S.input, padding: "6px 8px", textAlign: "right" }} value={editForm.vlReferencia ?? ""} onChange={e => setEditForm(p => ({ ...p, vlReferencia: Number(e.target.value) }))} />
                              ) : `R$ ${Number(it.vlReferencia).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", width: "10%" }}>
                              {isEdit ? (
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button onClick={saveEdit} style={{ ...S.btn, ...S.btnBlue, padding: "4px 10px", fontSize: 11 }}>Salvar</button>
                                  <button onClick={cancelEdit} style={{ ...S.btn, padding: "4px 10px", fontSize: 11 }}>Cancelar</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                  <button onClick={() => startEdit(it)} style={{ background: "none", border: "none", color: T.blue, cursor: "pointer", fontSize: 13 }} title="Editar item">✎</button>
                                  <button onClick={() => handleRemoveItem(it.cod)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }} title="Excluir item">×</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activeTpl.itens.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: T.txDis }}>
                      Nenhum item cadastrado nesta base LPU.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
