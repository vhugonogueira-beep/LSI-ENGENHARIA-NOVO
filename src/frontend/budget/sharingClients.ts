import { SharingClient } from "./types";

export const DEFAULT_SHARING_CLIENTS: SharingClient[] = [
  { id: "highline", nome: "Highline do Brasil", sigla: "HL", cnpj: "", tipo: "Sharing", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#8b5cf6", ativo: true },
  { id: "atc", nome: "ATC / SBA", sigla: "ATC", cnpj: "", tipo: "Sharing", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#f59e0b", ativo: true },
  { id: "ihs", nome: "IHS Towers", sigla: "IHS", cnpj: "", tipo: "Sharing", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#10b981", ativo: true },
  { id: "winity", nome: "Winity Telecom", sigla: "WIN", cnpj: "", tipo: "Sharing", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#6366f1", ativo: true },
  { id: "vivo", nome: "Vivo / Telefônica", sigla: "VIVO", cnpj: "", tipo: "Operadora", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#7c3aed", ativo: true },
  { id: "claro", nome: "Claro / América Móvil", sigla: "CLR", cnpj: "", tipo: "Operadora", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#ef4444", ativo: true },
  { id: "tim", nome: "TIM Brasil", sigla: "TIM", cnpj: "", tipo: "Operadora", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#3b82f6", ativo: true },
  { id: "oi", nome: "Oi S.A.", sigla: "OI", cnpj: "", tipo: "Operadora", contato: "", email: "", telefone: "", bdiPadrao: 25, lucroPadrao: 10, descontoPadrao: 0, cor: "#f97316", ativo: true },
];

const LS_KEY = "ls_sharingClients";

export function loadSharingClients(): SharingClient[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Seed defaults
  saveSharingClients(DEFAULT_SHARING_CLIENTS);
  return DEFAULT_SHARING_CLIENTS;
}

export function saveSharingClients(clients: SharingClient[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(clients));
}
