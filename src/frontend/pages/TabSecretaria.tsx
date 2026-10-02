import React, { useState, useEffect, useMemo, useCallback } from "react";
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';
import { Check, Clock, User, Pencil, MessageCircle, Trash2, ChevronLeft, ChevronRight, CalendarDays, Kanban, ClipboardList, Plus } from 'lucide-react';


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
  <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 10, fontWeight: 600, background: bg, color, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>{children}</span>
);

const StatusTag = ({ status }: { status: string }) => {
  // Fundo derivado da própria cor do estado, para acompanhar o tema.
  const m: Record<string, [string, string]> = {
    pending: [T.amber, "Pendente"], awaiting: [T.blueL, "Aguardando"],
    done: [T.green, "Concluída"], overdue: [T.red, "Vencida"],
  };
  const [c, l] = m[status] || m.pending;
  return <Tag bg={c + "1a"} color={c}>{l}</Tag>;
};

const Btn = ({ children, onClick, blue, green, red, small, style: extra }: any) => (
  <button onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "3px 8px" : "4px 10px", fontSize: 11, border: `1px solid ${blue ? T.blue : green ? T.greenD : red ? T.redD : T.brBase}`,
    borderRadius: 6, background: blue ? T.blue : green ? T.greenD : red ? T.redD : T.bg3,
    cursor: "pointer", color: blue || green || red ? "#fff" : T.txSec, fontWeight: 500, whiteSpace: "nowrap", ...extra,
  }}>{children}</button>
);

const Input = (props: any) => <input {...props} style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, fontFamily: "inherit", outline: "none", width: "100%", ...props.style }} />;
const Select = (props: any) => <select {...props} style={{ padding: "4px 6px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, fontFamily: "inherit", outline: "none", ...props.style }} />;
const Label = ({ children, htmlFor }: any) => <label htmlFor={htmlFor} style={{ fontSize: 11, color: T.txMut, marginBottom: 2, display: "block" }}>{children}</label>;
const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", padding: 2, color: T.txMut, display: "inline-flex" };

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
        <button type="button" role="checkbox" aria-checked={isDone} aria-label={isDone ? `Reabrir tarefa: ${t.desc}` : `Concluir tarefa: ${t.desc}`} title={isDone ? "Reabrir tarefa" : "Concluir tarefa"} onClick={() => toggleDone(t.id)} style={{ width: 16, height: 16, padding: 0, borderRadius: 3, border: `1.5px solid ${isDone ? T.blue : T.brStrong}`, background: isDone ? T.blue : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{isDone && <Check size={12} aria-hidden />}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.txPri, textDecoration: isDone ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.desc}</div>
          <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
            <StatusTag status={eff} />
            {isUrg && <Tag bg={T.red + "1a"} color={T.red}>Urgente</Tag>}
            {t.client && <Tag bg={T.bg4} color={T.txSec}>{t.client}</Tag>}
            {t.type && <Tag bg={T.bg4} color={T.txSec}>{t.type}</Tag>}
            {t.rescheduled && <Tag bg={T.amber + "1a"} color={T.amber}>Reagendada</Tag>}
            {dl && <Tag bg={T.red + "1a"} color={T.red}><Clock size={12} aria-hidden />Prazo: {dl}</Tag>}
            {t.time && <span style={{ fontSize: 11, color: T.txMut, display: "inline-flex", alignItems: "center", gap: 3 }}><Clock size={12} aria-hidden />{t.time}</span>}
            {t.resp && <span style={{ fontSize: 11, color: T.txMut, display: "inline-flex", alignItems: "center", gap: 3 }}><User size={12} aria-hidden />{t.resp}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <button onClick={() => openEdit(t.id)} aria-label="Editar tarefa" title="Editar tarefa" style={iconBtn}><Pencil size={14} aria-hidden /></button>
          <button onClick={() => { const msg = `📌 *${t.desc}*\n${t.client?"Cliente: "+t.client+"\n":""}${t.resp?"Resp: "+t.resp+"\n":""}Status: ${eff}`; openWA(msg); }} aria-label="Enviar tarefa por WhatsApp" title="Enviar tarefa por WhatsApp" style={iconBtn}><MessageCircle size={14} aria-hidden /></button>
          <button onClick={() => deleteTask(t.id)} aria-label="Excluir tarefa" title="Excluir tarefa" style={iconBtn}><Trash2 size={14} aria-hidden /></button>
        </div>
      </div>
    );
  };

  // ── Stat Card ──
  const Stat = ({ v, l, c }: { v: number; l: string; c: string }) => (
    <div style={{ background: T.bg3, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: v ? c : T.txMut }}>{v || "—"}</div>
      <div style={{ fontSize: 11, color: T.txMut, marginTop: 1 }}>{l}</div>
    </div>
  );

  // ── Mini Calendar ──
  const Calendar = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button onClick={prevM} aria-label="Mês anterior" title="Mês anterior" style={{ ...iconBtn, padding: "0 3px" }}><ChevronLeft size={14} aria-hidden /></button>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.txSec }}>{MESES[calM]} {calY}</span>
        <button onClick={nextM} aria-label="Próximo mês" title="Próximo mês" style={{ ...iconBtn, padding: "0 3px" }}><ChevronRight size={14} aria-hidden /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {["D","S","T","Q","Q","S","S"].map((d,i) => <div key={i} style={{ textAlign: "center", fontSize: 11, color: T.txDis, padding: 1 }}>{d}</div>)}
        {calDays.map((c, i) => {
          if (!c.d) return <div key={i} />;
          const isT = c.k === todayKey(), isS = c.k === selDate && !isT, has = taskDates.has(c.k);
          return <button type="button" key={i} onClick={() => setSelDate(c.k)} aria-pressed={c.k === selDate} aria-label={`${c.d} de ${MESES_FULL[calM]}${has ? ", com tarefas" : ""}`} style={{ textAlign: "center", fontSize: 11, padding: "2px 0", border: "none", borderRadius: 3, cursor: "pointer", color: isT ? "#fff" : isS ? T.blue : T.txMut, background: isT ? T.blue : isS ? T.bg4 : "transparent", fontWeight: isS ? 600 : 400, position: "relative" }}>
            {c.d}
            {has && <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 2, height: 2, borderRadius: "50%", background: isT ? "#fff" : T.red }} />}
          </button>;
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
          {([["agenda", <CalendarDays size={14} aria-hidden />, "Agenda"], ["kanban", <Kanban size={14} aria-hidden />, "Kanban"], ["relatorio", <ClipboardList size={14} aria-hidden />, "Relatório"]] as const).map(([id, icon, label]) => (
            <button type="button" key={id} onClick={() => setView(id)} aria-pressed={view === id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, textAlign: "left", color: view === id ? T.blue : T.txMut, background: view === id ? T.bg4 : "transparent", fontWeight: view === id ? 600 : 400 }}>
              {icon}{label}
              {id === "agenda" && overdueN > 0 && <span aria-label={`${overdueN} vencida(s)`} style={{ marginLeft: "auto", background: T.red, color: "#fff", fontSize: 11, padding: "0 4px", borderRadius: 8, fontWeight: 700 }}>{overdueN}</span>}
            </button>
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
          <div style={{ fontSize: 11, fontWeight: 600, color: T.txPri }}>
            {DIAS[selObj.getDay()]}, {selObj.getDate()} {MESES_FULL[selObj.getMonth()]}
          </div>
          <div style={{ fontSize: 11, color: T.txMut }}>{selDate === todayKey() ? "Hoje" : selDate < todayKey() ? "Passado" : "Futuro"}</div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Toast */}
        {toast && <div role="status" style={{ padding: "4px 12px", fontSize: 11, color: T.green, background: T.green + "1a", borderBottom: `1px solid ${T.brSub}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Check size={14} aria-hidden />{toast}</div>}

        {/* Top bar */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.brSub}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg1, flexShrink: 0, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txPri }}>
            {view === "agenda" ? `${DIAS[selObj.getDay()]}, ${selObj.getDate()} de ${MESES_FULL[selObj.getMonth()]}` : view === "kanban" ? "Visão kanban" : "Relatório geral"}
          </div>
          {view === "agenda" && (
            <div style={{ display: "flex", gap: 4 }}>
              {overdueN > 0 && <Btn small onClick={reschedule}>Reagendar ({overdueN})</Btn>}
              <Btn small green onClick={() => openWA(buildReport(dayTasks, "Resumo do dia"))}><MessageCircle size={14} aria-hidden />Enviar resumo por WhatsApp</Btn>
              <Btn small blue onClick={openNew}><Plus size={14} aria-hidden />Nova tarefa</Btn>
            </div>
          )}
          {view === "relatorio" && <Btn small green onClick={() => openWA(buildReport(tasks, "Relatório Geral"))}><MessageCircle size={14} aria-hidden />Enviar por WhatsApp</Btn>}
        </div>

        {/* Agenda sub-tabs */}
        {view === "agenda" && (
          <div style={{ display: "flex", borderBottom: `1px solid ${T.brSub}`, padding: "0 12px", background: T.bg1, flexShrink: 0 }}>
            {[["all","Todas"],["pending","Pendentes"],["awaiting","Aguardando"],["done","Feitas"],["overdue","Vencidas"]].map(([k, l]) => (
              <button type="button" key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ padding: "5px 10px", fontSize: 11, cursor: "pointer", background: "none", border: "none", borderBottom: `2px solid ${tab === k ? T.blue : "transparent"}`, color: tab === k ? T.blue : T.txMut, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>

          {/* AGENDA */}
          {view === "agenda" && (
            filtered.length === 0
              ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: T.txMut, gap: 6 }}>
                  <ClipboardList size={24} aria-hidden />
                  <span style={{ fontSize: 11 }}>Nenhuma tarefa neste dia. Registre uma no campo abaixo.</span>
                </div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {filtered.filter(t => t.priority === "high" && t.status !== "done").length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.amber, padding: "2px 0", borderBottom: `1px solid ${T.amberD}` }}>
                      Urgentes ({filtered.filter(t => t.priority === "high" && t.status !== "done").length})
                    </div>
                  )}
                  {filtered.sort((a, b) => (a.priority === "high" && a.status !== "done" ? -1 : 1) - (b.priority === "high" && b.status !== "done" ? -1 : 1)).map(t => <Row key={t.id} t={t} />)}
                </div>
          )}

          {/* KANBAN */}
          {view === "kanban" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, alignItems: "start" }}>
              {[{ k: "pending", l: "Pendentes", c: T.amber }, { k: "awaiting", l: "Aguardando", c: T.blueL }, { k: "overdue", l: "Vencidas", c: T.red }, { k: "done", l: "Concluídas", c: T.green }].map(col => {
                const ct = tasks.filter(t => effStatus(t) === col.k).slice(0, 20);
                return (
                  <div key={col.k} style={{ border: `1px solid ${T.brSub}`, borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 600, display: "flex", justifyContent: "space-between", background: col.c + "1a", color: col.c }}><span>{col.l}</span><span style={{ color: ct.length ? col.c : T.txMut }}>{ct.length || "—"}</span></div>
                    <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 3, minHeight: 40 }}>
                      {ct.length ? ct.map(t => (
                        <button type="button" key={t.id} onClick={() => openEdit(t.id)} title="Editar tarefa" style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 4, padding: "4px 6px", fontSize: 11, cursor: "pointer", color: T.txPri, textAlign: "left" }}>
                          {t.client && <span style={{ fontSize: 11, color: T.txSec, fontWeight: 600, marginRight: 6 }}>{t.client}</span>}
                          {t.desc.substring(0, 40)}{t.desc.length > 40 ? "…" : ""}
                          {t.priority === "high" && t.status !== "done" && <span aria-label="Urgente" style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: T.red, marginLeft: 3, verticalAlign: "middle" }} />}
                        </button>
                      )) : <div style={{ fontSize: 11, color: T.txDis, padding: 4 }}>Vazio</div>}
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
                {[["Total", rpt.total, T.txPri], ["Concluídas", rpt.done, T.green], ["Pendentes", rpt.pending, T.amber], ["Vencidas", rpt.overdue, T.red]].map(([l, v, c]) => (
                  <div key={l as string} style={{ background: T.bg3, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: v ? c as string : T.txMut }}>{(v as number) || "—"}</div>
                    <div style={{ fontSize: 11, color: T.txMut, marginTop: 1 }}>{l as string}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.txPri, marginBottom: 8 }}>Progresso por cliente</div>
                {Object.entries(rpt.byClient).map(([cl, d]) => {
                  const pct = d.total ? Math.round(d.done / d.total * 100) : 0;
                  return <div key={cl} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}><span style={{ color: T.txPri }}>{cl}</span><span style={{ color: T.txMut }}>{d.done}/{d.total} ({pct}%)</span></div>
                    <div style={{ height: 4, background: T.bg4, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: T.blue, borderRadius: 2 }} /></div>
                  </div>;
                })}
              </div>
              <div style={{ background: T.bg2, border: `1px solid ${T.brSub}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.txPri, marginBottom: 4 }}>Concluídas nos últimos 7 dias ({rpt.done7.length})</div>
                {rpt.done7.length ? rpt.done7.slice(0, 10).map(t => (
                  <div key={t.id} style={{ fontSize: 11, color: T.txSec, padding: "2px 0", borderBottom: `1px solid ${T.brSub}`, display: "flex", alignItems: "center", gap: 6 }}><Check size={14} aria-hidden style={{ color: T.green, flexShrink: 0 }} /><span>{t.desc}</span>{t.client && <span style={{ color: T.txMut }}>{t.client}</span>}</div>
                )) : <div style={{ fontSize: 11, color: T.txMut }}>Nenhuma</div>}
              </div>
            </div>
          )}
        </div>

        {/* Quick add footer (agenda only) */}
        {view === "agenda" && (
          <div style={{ borderTop: `1px solid ${T.brSub}`, padding: "6px 10px", background: T.bg1, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
              <Select aria-label="Status" value={qSt} onChange={(e: any) => setQSt(e.target.value)}><option value="pending">Pendente</option><option value="awaiting">Aguardando</option><option value="done">Feita</option></Select>
              <Select aria-label="Prioridade" value={qPr} onChange={(e: any) => setQPr(e.target.value)}><option value="normal">Normal</option><option value="high">Urgente</option><option value="low">Baixa</option></Select>
              <Select aria-label="Cliente" value={qCl} onChange={(e: any) => setQCl(e.target.value)}><option value="">Cliente</option>{CLIENTES.map(c => <option key={c}>{c}</option>)}</Select>
              <Select aria-label="Tipo" value={qTy} onChange={(e: any) => setQTy(e.target.value)}><option value="">Tipo</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select>
              <input type="time" aria-label="Horário" value={qTm} onChange={e => setQTm(e.target.value)} style={{ padding: "3px 5px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 5, background: T.bg3, color: T.txPri, width: 70 }} />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input aria-label="Descrição da nova tarefa" value={qDesc} onChange={e => setQDesc(e.target.value)} onKeyDown={e => { if (e.key === "Enter") quickSave(); }} placeholder="Registrar tarefa... (Enter)" style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 5, background: T.bg3, color: T.txPri, outline: "none" }} />
              <Btn small blue onClick={quickSave}>Registrar</Btn>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL TAREFA ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setModal(false)}>
          <div style={{ background: T.bg2, borderRadius: 10, border: `1px solid ${T.brBase}`, padding: 16, width: 380, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: T.txPri, marginBottom: 12 }}>{editId ? "Editar tarefa" : "Nova tarefa"}</h3>
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-desc">Descrição</Label><textarea id="sec-desc" value={fD} onChange={e => setFD(e.target.value)} rows={2} style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txPri, outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-status">Status</Label><Select id="sec-status" value={fSt} onChange={(e: any) => setFSt(e.target.value)} style={{ width: "100%" }}><option value="pending">Pendente</option><option value="awaiting">Aguardando</option><option value="done">Concluída</option></Select></div>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-prioridade">Prioridade</Label><Select id="sec-prioridade" value={fPr} onChange={(e: any) => setFPr(e.target.value)} style={{ width: "100%" }}><option value="normal">Normal</option><option value="high">Urgente</option><option value="low">Baixa</option></Select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-cliente">Cliente</Label><Select id="sec-cliente" value={fCl} onChange={(e: any) => setFCl(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{CLIENTES.map(c => <option key={c}>{c}</option>)}</Select></div>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-tipo">Tipo</Label><Select id="sec-tipo" value={fTy} onChange={(e: any) => setFTy(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-data">Data</Label><Input id="sec-data" type="date" value={fDt} onChange={(e: any) => setFDt(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
              <div style={{ marginBottom: 8 }}><Label htmlFor="sec-horario">Horário</Label><Input id="sec-horario" type="time" value={fTm} onChange={(e: any) => setFTm(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-resp">Responsável</Label><Input id="sec-resp" value={fRp} onChange={(e: any) => setFRp(e.target.value)} placeholder="Ex: Dra. Ana, PV..." style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-prazo">Prazo limite</Label><Input id="sec-prazo" type="date" value={fDl} onChange={(e: any) => setFDl(e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-obs">Observação</Label><Input id="sec-obs" value={fNt} onChange={(e: any) => setFNt(e.target.value)} placeholder="Obs..." style={{ fontSize: 11, padding: "4px 6px" }} /></div>
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
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-wa-num">Número (DDI+DDD+número)</Label><Input id="sec-wa-num" value={waNum} onChange={(e: any) => setWaNum(e.target.value)} placeholder="5511999999999" style={{ fontSize: 11, padding: "4px 6px" }} /></div>
            <div style={{ marginBottom: 8 }}><Label htmlFor="sec-wa-msg">Pré-visualização</Label><textarea id="sec-wa-msg" value={waMsg} readOnly rows={6} style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${T.brBase}`, borderRadius: 6, background: T.bg3, color: T.txSec, outline: "none", width: "100%", resize: "none", fontFamily: "inherit" }} /></div>
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
