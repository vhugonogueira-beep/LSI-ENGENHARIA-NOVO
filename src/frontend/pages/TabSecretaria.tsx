import React, { useState, useEffect, useMemo, useCallback } from "react";

const T = {
  bg0: "#07090f", bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030", bg4: "#222a3a",
  brSub: "#1e2840", brBase: "#2d3a52", brStrong: "#3d5070",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", blueD: "#1d4ed8", blueL: "#93c5fd",
  green: "#34d399", greenD: "#0d9e74",
  amber: "#fbbf24", amberD: "#d97706",
  red: "#f87171", redD: "#dc2626",
  purple: "#a78bfa", cyan: "#67e8f9", orange: "#fb923c",
};

interface SecTask {
  id: string; desc: string; status: "pending" | "awaiting" | "done"; priority: "normal" | "high" | "low";
  client: string; type: string; date: string; time: string; resp: string; deadline: string; note: string;
  rescheduled: boolean; created_at: string;
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const CLIENTES = ["PV/Highline","Vivo","TIM","Claro","Interno"];
const TIPOS = ["Aquisição","Contrato","Jurídico","Engenharia","Administrativo","Reunião"];
const LS_KEY = "sec_tasks";

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayKey = () => { const n = new Date(); n.setHours(0,0,0,0); return toKey(n); };
const effStatus = (t: SecTask) => { if (t.status === "done") return "done"; if (t.date < todayKey()) return "overdue"; return t.status; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const Tag = ({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) => (
  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, fontWeight: 700, background: bg, color, whiteSpace: "nowrap" }}>{children}</span>
);

const StatusTag = ({ status }: { status: string }) => {
  const m: Record<string, [string, string, string]> = {
    pending: ["#332b00", T.amber, "Pendente"], awaiting: ["#0c1a3a", T.blueL, "Aguardando"],
    done: ["#0a2218", T.green, "Concluída"], overdue: ["#2a0a0a", T.red, "Vencida"],
  };
  const [bg, c, l] = m[status] || m.pending;
  return <Tag bg={bg} color={c}>{l}</Tag>;
};

const Btn = ({ children, onClick, blue, green, red, small, style: extra }: any) => (
  <button onClick={onClick} style={{
    padding: small ? "3px 8px" : "4px 10px", fontSize: small ? 10 : 11, border: `1px solid ${blue ? T.blue : green ? T.greenD : red ? T.redD : T.brBase}`,
    borderRadius: 6, background: blue ? T.blue : green ? T.greenD : red ? T.redD : T.bg3,
    cursor: "pointer", color: blue || green || red ? "#fff" : T.txSec, fontWeight: 500, whiteSpace: "nowrap", ...extra,
  }}>{children}</button>
);

const Input = (props: any) => <input {...props} style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, fontFamily: "inherit", outline: "none", width: "100%", ...props.style }} />;
const Select = (props: any) => <select {...props} style={{ padding: "4px 6px", fontSize: 10, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, fontFamily: "inherit", outline: "none", ...props.style }} />;
const Label = ({ children }: any) => <label style={{ fontSize: 9, color: T.txMut, marginBottom: 2, display: "block" }}>{children}</label>;

export default function TabSecretaria() {
  const [tasks, setTasks] = useState<SecTask[]>([]);
  const [selDate, setSelDate] = useState(todayKey());
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [calM, setCalM] = useState(new Date().getMonth());
  const [view, setView] = useState<"agenda"|"kanban"|"relatorio">("agenda");
  const [tab, setTab] = useState("all");
  const [modal, setModal] = useState(false);
  const [waModal, setWaModal] = useState(false);
  const [waMsg, setWaMsg] = useState("");
  const [waNum, setWaNum] = useState(() => localStorage.getItem("sec_wa_num") || "");
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [qDesc, setQDesc] = useState("");
  const [qSt, setQSt] = useState("pending");
  const [qPr, setQPr] = useState("normal");
  const [qCl, setQCl] = useState("");
  const [qTy, setQTy] = useState("");
  const [qTm, setQTm] = useState("");

  // Form
  const [fD, setFD] = useState(""); const [fSt, setFSt] = useState("pending"); const [fPr, setFPr] = useState("normal");
  const [fCl, setFCl] = useState(""); const [fTy, setFTy] = useState(""); const [fDt, setFDt] = useState(todayKey());
  const [fTm, setFTm] = useState(""); const [fRp, setFRp] = useState(""); const [fDl, setFDl] = useState(""); const [fNt, setFNt] = useState("");

  useEffect(() => { try { const r = localStorage.getItem(LS_KEY); if (r) setTasks(JSON.parse(r)); } catch {} }, []);
  const persist = useCallback((t: SecTask[]) => { setTasks(t); localStorage.setItem(LS_KEY, JSON.stringify(t)); }, []);
  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const addTask = (t: Omit<SecTask, "id" | "created_at">) => persist([...tasks, { ...t, id: newId(), created_at: new Date().toISOString() } as SecTask]);
  const updateTask = (id: string, u: Partial<SecTask>) => persist(tasks.map(t => t.id === id ? { ...t, ...u } : t));
  const deleteTask = (id: string) => { if (!confirm("Remover?")) return; persist(tasks.filter(t => t.id !== id)); };
  const toggleDone = (id: string) => { const t = tasks.find(x => x.id === id); if (t) updateTask(id, { status: t.status === "done" ? "pending" : "done" }); };

  const reschedule = () => {
    const tk = todayKey(); let c = 0;
    persist(tasks.map(t => { if (t.status !== "done" && t.date < tk) { c++; return { ...t, date: tk, rescheduled: true }; } return t; }));
    notify(`${c} reagendada(s)`);
  };

  const quickSave = () => {
    if (!qDesc.trim()) return;
    addTask({ desc: qDesc.trim(), status: qSt as any, priority: qPr as any, client: qCl, type: qTy, date: selDate, time: qTm, resp: "", deadline: "", note: "", rescheduled: false });
    setQDesc(""); notify("Registrada!");
  };

  const openNew = () => { setEditId(null); setFD(""); setFSt("pending"); setFPr("normal"); setFCl(""); setFTy(""); setFDt(selDate); setFTm(""); setFRp(""); setFDl(""); setFNt(""); setModal(true); };
  const openEdit = (id: string) => { const t = tasks.find(x => x.id === id); if (!t) return; setEditId(id); setFD(t.desc); setFSt(t.status); setFPr(t.priority); setFCl(t.client); setFTy(t.type); setFDt(t.date); setFTm(t.time); setFRp(t.resp); setFDl(t.deadline); setFNt(t.note); setModal(true); };
  const saveModal = () => { if (!fD.trim()) return; const o = { desc: fD.trim(), status: fSt as any, priority: fPr as any, client: fCl, type: fTy, date: fDt || selDate, time: fTm, resp: fRp.trim(), deadline: fDl, note: fNt.trim(), rescheduled: false }; if (editId) updateTask(editId, o); else addTask(o); setModal(false); notify(editId ? "Atualizada!" : "Criada!"); };

  const buildReport = (list: SecTask[], label: string) => {
    const ov = list.filter(t => effStatus(t) === "overdue"), pn = list.filter(t => effStatus(t) === "pending"), aw = list.filter(t => effStatus(t) === "awaiting"), dn = list.filter(t => t.status === "done");
    let m = `*Secretária LS — ${label}*\n📅 ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}\n\n`;
    if (ov.length) { m += `🔴 *Vencidas (${ov.length})*\n`; ov.forEach(t => m += `• ${t.desc}${t.client ? " ["+t.client+"]" : ""}\n`); m += "\n"; }
    if (pn.length) { m += `🟡 *Pendentes (${pn.length})*\n`; pn.forEach(t => m += `• ${t.desc}${t.client ? " ["+t.client+"]" : ""}${t.time ? " ⏰"+t.time : ""}\n`); m += "\n"; }
    if (aw.length) { m += `🔵 *Aguardando (${aw.length})*\n`; aw.forEach(t => m += `• ${t.desc}${t.resp ? " → "+t.resp : ""}\n`); m += "\n"; }
    if (dn.length) { m += `✅ *Concluídas (${dn.length})*\n`; dn.forEach(t => m += `• ${t.desc}\n`); m += "\n"; }
    m += "_Secretária LS Office_"; return m;
  };
  const openWA = (m: string) => { setWaMsg(m); setWaModal(true); };
  const sendWA = () => { const n = waNum.replace(/\D/g, ""); if (!n) { alert("Informe o número"); return; } localStorage.setItem("sec_wa_num", n); window.open(`https://wa.me/${n}?text=${encodeURIComponent(waMsg)}`, "_blank"); setWaModal(false); };

  // Computed
  const selObj = useMemo(() => new Date(selDate + "T00:00:00"), [selDate]);
  const dayTasks = useMemo(() => tasks.filter(t => t.date === selDate), [tasks, selDate]);
  const filtered = useMemo(() => {
    if (tab === "all") return dayTasks;
    if (tab === "pending") return dayTasks.filter(t => { const e = effStatus(t); return e === "pending" || e === "overdue"; });
    return dayTasks.filter(t => (tab === "done" ? t.status === "done" : effStatus(t) === tab));
  }, [dayTasks, tab]);
  const overdueN = useMemo(() => tasks.filter(t => effStatus(t) === "overdue").length, [tasks]);
  const stats = useMemo(() => ({ total: dayTasks.length, pend: dayTasks.filter(t => effStatus(t) === "pending").length, done: dayTasks.filter(t => t.status === "done").length }), [dayTasks]);

  // Calendar
  const calDays = useMemo(() => {
    const fd = new Date(calY, calM, 1).getDay(), dm = new Date(calY, calM + 1, 0).getDate();
    const r: { d: number; k: string }[] = [];
    for (let i = 0; i < fd; i++) r.push({ d: 0, k: "" });
    for (let i = 1; i <= dm; i++) r.push({ d: i, k: `${calY}-${String(calM+1).padStart(2,"0")}-${String(i).padStart(2,"0")}` });
    return r;
  }, [calY, calM]);
  const taskDates = useMemo(() => { const s = new Set<string>(); tasks.forEach(t => s.add(t.date)); return s; }, [tasks]);
  const prevM = () => { if (calM === 0) { setCalM(11); setCalY(y => y - 1); } else setCalM(m => m - 1); };
  const nextM = () => { if (calM === 11) { setCalM(0); setCalY(y => y + 1); } else setCalM(m => m + 1); };

  // Report
  const rpt = useMemo(() => {
    const total = tasks.length, done = tasks.filter(t => t.status === "done").length;
    const pending = tasks.filter(t => effStatus(t) === "pending").length, overdue = tasks.filter(t => effStatus(t) === "overdue").length;
    const byClient: Record<string, { total: number; done: number }> = {};
    tasks.forEach(t => { const c = t.client || "Sem cliente"; if (!byClient[c]) byClient[c] = { total: 0, done: 0 }; byClient[c].total++; if (t.status === "done") byClient[c].done++; });
    const now = new Date(); now.setHours(0,0,0,0);
    const done7 = tasks.filter(t => t.status === "done" && Math.round((now.getTime() - new Date(t.date + "T00:00:00").getTime()) / 86400000) <= 7);
    return { total, done, pending, overdue, byClient, done7 };
  }, [tasks]);

  // ── Task Row (compact) ──
  const Row = ({ t }: { t: SecTask }) => {
    const eff = effStatus(t), isDone = t.status === "done", isUrg = t.priority === "high" && !isDone;
    let dl = "";
    if (t.deadline && !isDone) { const diff = Math.round((new Date(t.deadline+"T00:00:00").getTime() - new Date(todayKey()+"T00:00:00").getTime()) / 86400000); if (diff < 0) dl = "Vencido"; else if (diff === 0) dl = "Hoje!"; else if (diff <= 3) dl = `${diff}d`; }
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 6, borderLeft: isUrg ? `2px solid ${T.red}` : `1px solid ${T.brSub}`, opacity: isDone ? 0.5 : 1 }}>
        <div onClick={() => toggleDone(t.id)} style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isDone ? T.blue : T.brStrong}`, background: isDone ? T.blue : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", flexShrink: 0 }}>{isDone ? "✓" : ""}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.txPri, textDecoration: isDone ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.desc}</div>
          <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
            <StatusTag status={eff} />
            {isUrg && <Tag bg="#2a0a0a" color={T.red}>Urgente</Tag>}
            {t.client && <Tag bg="#1a0a2e" color={T.purple}>{t.client}</Tag>}
            {t.type && <Tag bg={T.bg4} color={T.txSec}>{t.type}</Tag>}
            {t.rescheduled && <Tag bg="#2a0a1a" color={T.orange}>Reag.</Tag>}
            {dl && <Tag bg="#2a0a0a" color={T.red}>⏳{dl}</Tag>}
            {t.time && <span style={{ fontSize: 9, color: T.txMut }}>⏰{t.time}</span>}
            {t.resp && <span style={{ fontSize: 9, color: T.txMut }}>👤{t.resp}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <button onClick={() => openEdit(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 11, color: T.txMut }}>✎</button>
          <button onClick={() => { const msg = `📌 *${t.desc}*\n${t.client?"Cliente: "+t.client+"\n":""}${t.resp?"Resp: "+t.resp+"\n":""}Status: ${eff}`; openWA(msg); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 11, color: T.txMut }}>📲</button>
          <button onClick={() => deleteTask(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 11, color: T.txMut }}>✕</button>
        </div>
      </div>
    );
  };

  // ── Stat Card ──
  const Stat = ({ v, l, c }: { v: number; l: string; c: string }) => (
    <div style={{ background: T.bg3, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
      <div style={{ fontSize: 8, color: T.txMut, marginTop: 1 }}>{l}</div>
    </div>
  );

  // ── Mini Calendar ──
  const Calendar = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button onClick={prevM} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.txMut, padding: "0 3px" }}>‹</button>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.txSec }}>{MESES[calM]} {calY}</span>
        <button onClick={nextM} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.txMut, padding: "0 3px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {["D","S","T","Q","Q","S","S"].map((d,i) => <div key={i} style={{ textAlign: "center", fontSize: 8, color: T.txDis, padding: 1 }}>{d}</div>)}
        {calDays.map((c, i) => {
          if (!c.d) return <div key={i} />;
          const isT = c.k === todayKey(), isS = c.k === selDate && !isT, has = taskDates.has(c.k);
          return <div key={i} onClick={() => setSelDate(c.k)} style={{ textAlign: "center", fontSize: 9, padding: "2px 0", borderRadius: 3, cursor: "pointer", color: isT ? "#fff" : isS ? T.blue : T.txMut, background: isT ? T.blue : isS ? "#0c1a3a" : "transparent", fontWeight: isS ? 600 : 400, position: "relative" }}>
            {c.d}
            {has && <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 2, height: 2, borderRadius: "50%", background: isT ? "#fff" : T.red }} />}
          </div>;
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", fontSize: 12 }}>

      {/* ── LEFT PANEL: Calendar + Stats (compact) ── */}
      <div style={{ width: 180, flexShrink: 0, background: T.bg1, borderRight: `1px solid ${T.brSub}`, display: "flex", flexDirection: "column", overflowY: "auto", padding: "10px 8px" }}>

        {/* Nav tabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
          {([["agenda","📅","Agenda"],["kanban","📊","Kanban"],["relatorio","📋","Relatório"]] as const).map(([id, icon, label]) => (
            <div key={id} onClick={() => setView(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: 11, color: view === id ? T.blue : T.txMut, background: view === id ? "#0c1a3a" : "transparent", fontWeight: view === id ? 600 : 400 }}>
              <span style={{ fontSize: 12 }}>{icon}</span>{label}
              {id === "agenda" && overdueN > 0 && <span style={{ marginLeft: "auto", background: T.red, color: "#fff", fontSize: 8, padding: "0 4px", borderRadius: 8, fontWeight: 700 }}>{overdueN}</span>}
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: T.brSub, margin: "0 0 8px" }} />

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
          <Stat v={stats.total} l="Hoje" c={T.txPri} />
          <Stat v={stats.done} l="Feitas" c={T.green} />
          <Stat v={stats.pend} l="Pendentes" c={T.amber} />
          <Stat v={overdueN} l="Vencidas" c={T.red} />
        </div>

        <div style={{ height: 1, background: T.brSub, margin: "0 0 8px" }} />

        {/* Calendar */}
        <Calendar />

        {/* Selected date info */}
        <div style={{ marginTop: 10, padding: "6px 4px", background: T.bg3, borderRadius: 6, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.txPri }}>
            {DIAS[selObj.getDay()]}, {selObj.getDate()} {MESES_FULL[selObj.getMonth()]}
          </div>
          <div style={{ fontSize: 9, color: T.txMut }}>{selDate === todayKey() ? "Hoje" : selDate < todayKey() ? "Passado" : "Futuro"}</div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Toast */}
        {toast && <div style={{ padding: "4px 12px", fontSize: 10, color: T.green, background: "#081a10", borderBottom: `1px solid ${T.brSub}`, textAlign: "center" }}>✅ {toast}</div>}

        {/* Top bar */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.brSub}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg1, flexShrink: 0, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txPri }}>
            {view === "agenda" ? `${DIAS[selObj.getDay()]}, ${selObj.getDate()} de ${MESES_FULL[selObj.getMonth()]}` : view === "kanban" ? "Visão Kanban" : "Relatório Geral"}
          </div>
          {view === "agenda" && (
            <div style={{ display: "flex", gap: 4 }}>
              {overdueN > 0 && <Btn small onClick={reschedule}>Reagendar ({overdueN})</Btn>}
              <Btn small green onClick={() => openWA(buildReport(dayTasks, "Resumo do dia"))}>WA</Btn>
              <Btn small blue onClick={openNew}>+ Nova</Btn>
            </div>
          )}
          {view === "relatorio" && <Btn small green onClick={() => openWA(buildReport(tasks, "Relatório Geral"))}>Exportar WA</Btn>}
        </div>

        {/* Agenda sub-tabs */}
        {view === "agenda" && (
          <div style={{ display: "flex", borderBottom: `1px solid ${T.brSub}`, padding: "0 12px", background: T.bg1, flexShrink: 0 }}>
            {[["all","Todas"],["pending","Pend."],["awaiting","Aguard."],["done","Feitas"],["overdue","Vencidas"]].map(([k, l]) => (
              <div key={k} onClick={() => setTab(k)} style={{ padding: "5px 10px", fontSize: 10, cursor: "pointer", borderBottom: `2px solid ${tab === k ? T.blue : "transparent"}`, color: tab === k ? T.blue : T.txMut, fontWeight: tab === k ? 600 : 400 }}>{l}</div>
            ))}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>

          {/* AGENDA */}
          {view === "agenda" && (
            filtered.length === 0
              ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: T.txMut, gap: 6 }}>
                  <span style={{ fontSize: 24 }}>📋</span>
                  <span style={{ fontSize: 11 }}>Nenhuma atividade</span>
                </div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {filtered.filter(t => t.priority === "high" && t.status !== "done").length > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.amber, padding: "2px 0", borderBottom: `1px solid ${T.amberD}` }}>
                      URGENTES ({filtered.filter(t => t.priority === "high" && t.status !== "done").length})
                    </div>
                  )}
                  {filtered.sort((a, b) => (a.priority === "high" && a.status !== "done" ? -1 : 1) - (b.priority === "high" && b.status !== "done" ? -1 : 1)).map(t => <Row key={t.id} t={t} />)}
                </div>
          )}

          {/* KANBAN */}
          {view === "kanban" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, alignItems: "start" }}>
              {[{ k: "pending", l: "Pendentes", bg: "#1a1800", c: T.amber }, { k: "awaiting", l: "Aguardando", bg: "#0c1a2e", c: T.blueL }, { k: "overdue", l: "Vencidas", bg: "#1a0808", c: T.red }, { k: "done", l: "Concluídas", bg: "#081a10", c: T.green }].map(col => {
                const ct = tasks.filter(t => effStatus(t) === col.k).slice(0, 20);
                return (
                  <div key={col.k} style={{ border: `1px solid ${T.brSub}`, borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ padding: "6px 8px", fontSize: 10, fontWeight: 600, display: "flex", justifyContent: "space-between", background: col.bg, color: col.c }}><span>{col.l}</span><span>{ct.length}</span></div>
                    <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 3, minHeight: 40 }}>
                      {ct.length ? ct.map(t => (
                        <div key={t.id} onClick={() => openEdit(t.id)} style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 4, padding: "4px 6px", fontSize: 10, cursor: "pointer", color: T.txPri }}>
                          {t.client && <span style={{ fontSize: 8, color: T.purple, fontWeight: 700 }}>{t.client} · </span>}
                          {t.desc.substring(0, 40)}{t.desc.length > 40 ? "…" : ""}
                          {t.priority === "high" && t.status !== "done" && <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: T.red, marginLeft: 3, verticalAlign: "middle" }} />}
                        </div>
                      )) : <div style={{ fontSize: 9, color: T.txDis, padding: 4 }}>Vazio</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* RELATÓRIO */}
          {view === "relatorio" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {[["Total", rpt.total, T.blue], ["Concluídas", rpt.done, T.green], ["Pendentes", rpt.pending, T.amber], ["Vencidas", rpt.overdue, T.red]].map(([l, v, c]) => (
                  <div key={l as string} style={{ background: T.bg3, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v as number}</div>
                    <div style={{ fontSize: 9, color: T.txMut, marginTop: 1 }}>{l as string}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.txPri, marginBottom: 8 }}>Progresso por cliente</div>
                {Object.entries(rpt.byClient).map(([cl, d]) => {
                  const pct = d.total ? Math.round(d.done / d.total * 100) : 0;
                  return <div key={cl} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: T.txPri }}>{cl}</span><span style={{ color: T.txMut }}>{d.done}/{d.total} ({pct}%)</span></div>
                    <div style={{ height: 4, background: T.bg4, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: T.blue, borderRadius: 2 }} /></div>
                  </div>;
                })}
              </div>
              <div style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.txPri, marginBottom: 4 }}>Concluídas 7 dias ({rpt.done7.length})</div>
                {rpt.done7.length ? rpt.done7.slice(0, 10).map(t => (
                  <div key={t.id} style={{ fontSize: 10, color: T.txSec, padding: "2px 0", borderBottom: `1px solid ${T.brSub}` }}>✅ {t.desc}{t.client ? ` [${t.client}]` : ""}</div>
                )) : <div style={{ fontSize: 10, color: T.txMut }}>Nenhuma</div>}
              </div>
            </div>
          )}
        </div>

        {/* Quick add footer (agenda only) */}
        {view === "agenda" && (
          <div style={{ borderTop: `1px solid ${T.brSub}`, padding: "6px 10px", background: T.bg1, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
              <Select value={qSt} onChange={(e: any) => setQSt(e.target.value)}><option value="pending">Pend.</option><option value="awaiting">Aguard.</option><option value="done">Feita</option></Select>
              <Select value={qPr} onChange={(e: any) => setQPr(e.target.value)}><option value="normal">Normal</option><option value="high">Urgente</option><option value="low">Baixa</option></Select>
              <Select value={qCl} onChange={(e: any) => setQCl(e.target.value)}><option value="">Cliente</option>{CLIENTES.map(c => <option key={c}>{c}</option>)}</Select>
              <Select value={qTy} onChange={(e: any) => setQTy(e.target.value)}><option value="">Tipo</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select>
              <input type="time" value={qTm} onChange={e => setQTm(e.target.value)} style={{ padding: "3px 5px", fontSize: 10, border: `1px solid ${T.brBase}`, borderRadius: 5, background: T.bg3, color: T.txPri, width: 70 }} />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input value={qDesc} onChange={e => setQDesc(e.target.value)} onKeyDown={e => { if (e.key === "Enter") quickSave(); }} placeholder="Registrar atividade... (Enter)" style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 5, background: T.bg3, color: T.txPri, outline: "none" }} />
              <Btn small blue onClick={quickSave}>Registrar</Btn>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL TAREFA ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setModal(false)}>
          <div style={{ background: T.bg2, borderRadius: 10, border: `1px solid ${T.brBase}`, padding: 16, width: 380, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: T.txPri, marginBottom: 12 }}>{editId ? "Editar" : "Nova atividade"}</h3>
            <div style={{ marginBottom: 8 }}><Label>Descrição</Label><textarea value={fD} onChange={e => setFD(e.target.value)} rows={2} style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label>Status</Label><Select value={fSt} onChange={(e: any) => setFSt(e.target.value)} style={{ width: "100%" }}><option value="pending">Pendente</option><option value="awaiting">Aguard.</option><option value="done">Concluída</option></Select></div>
              <div style={{ marginBottom: 8 }}><Label>Prioridade</Label><Select value={fPr} onChange={(e: any) => setFPr(e.target.value)} style={{ width: "100%" }}><option value="normal">Normal</option><option value="high">Urgente</option><option value="low">Baixa</option></Select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label>Cliente</Label><Select value={fCl} onChange={(e: any) => setFCl(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{CLIENTES.map(c => <option key={c}>{c}</option>)}</Select></div>
              <div style={{ marginBottom: 8 }}><Label>Tipo</Label><Select value={fTy} onChange={(e: any) => setFTy(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label>Data</Label><Input type="date" value={fDt} onChange={(e: any) => setFDt(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
              <div style={{ marginBottom: 8 }}><Label>Horário</Label><Input type="time" value={fTm} onChange={(e: any) => setFTm(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><Label>Responsável</Label><Input value={fRp} onChange={(e: any) => setFRp(e.target.value)} placeholder="Ex: Dra. Ana, PV..." style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label>Prazo limite</Label><Input type="date" value={fDl} onChange={(e: any) => setFDl(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label>Observação</Label><Input value={fNt} onChange={(e: any) => setFNt(e.target.value)} placeholder="Obs..." style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 10 }}>
              <Btn small onClick={() => setModal(false)}>Cancelar</Btn>
              <Btn small blue onClick={saveModal}>Salvar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL WA ── */}
      {waModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setWaModal(false)}>
          <div style={{ background: T.bg2, borderRadius: 10, border: `1px solid ${T.brBase}`, padding: 16, width: 380, maxWidth: "95vw" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: T.txPri, marginBottom: 12 }}>Enviar via WhatsApp</h3>
            <div style={{ marginBottom: 8 }}><Label>Número (DDI+DDD+número)</Label><Input value={waNum} onChange={(e: any) => setWaNum(e.target.value)} placeholder="5511999999999" style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label>Pré-visualização</Label><textarea value={waMsg} readOnly rows={6} style={{ padding: "5px 8px", fontSize: 10, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txSec, outline: "none", width: "100%", resize: "none", fontFamily: "inherit" }} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 10 }}>
              <Btn small onClick={() => setWaModal(false)}>Cancelar</Btn>
              <Btn small green onClick={sendWA}>Abrir WhatsApp Web</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
