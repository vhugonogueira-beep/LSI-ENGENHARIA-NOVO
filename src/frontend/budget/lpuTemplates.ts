import { LpuTemplate, LpuTemplateItem } from "./types";

const LS_KEY = "ls_lpuTemplates";

export function loadLpuTemplates(): LpuTemplate[] {
  let list: LpuTemplate[] = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) list = JSON.parse(raw);
  } catch {}

  let changed = false;

  // Migration for older names to exactly match clients
  if (list.length > 0) {
    list.forEach(t => {
      if (t.id === "tpl_hs_impl") { t.id = "tpl_ihs_impl"; t.sharingId = "ihs"; t.nome = "LPU IHS Towers — Implantação"; changed = true; }
      if (t.id === "tpl_hs_op") { t.id = "tpl_ihs_op"; t.sharingId = "ihs"; t.nome = "LPU IHS Towers — Operação"; changed = true; }
      if (t.id === "tpl_unity_impl") { t.id = "tpl_winity_impl"; t.sharingId = "winity"; t.nome = "LPU Winity Telecom — Implantação"; changed = true; }
      if (t.id === "tpl_unity_op") { t.id = "tpl_winity_op"; t.sharingId = "winity"; t.nome = "LPU Winity Telecom — Operação"; changed = true; }

      if (t.id === "tpl_highline_impl" && t.nome === "LPU Highline — Implantação (Adequação)") { t.nome = "LPU Highline do Brasil — Implantação (Adequação)"; changed = true; }
      if (t.id === "tpl_highline_impl" && t.nome === "LPU Highline — Implantação") { t.nome = "LPU Highline do Brasil — Implantação"; changed = true; }
      if (t.id === "tpl_highline_op" && t.nome === "LPU Highline — Operação") { t.nome = "LPU Highline do Brasil — Operação"; changed = true; }

      if (t.id === "tpl_atc_impl" && t.nome === "LPU ATC — Implantação") { t.nome = "LPU ATC / SBA — Implantação"; changed = true; }
      if (t.id === "tpl_atc_op" && t.nome === "LPU ATC — Operação") { t.nome = "LPU ATC / SBA — Operação"; changed = true; }
    });

    const uniqueList: LpuTemplate[] = [];
    list.forEach(t => {
      if (!uniqueList.find(x => x.id === t.id)) uniqueList.push(t);
    });
    if (uniqueList.length !== list.length) changed = true;
    list = uniqueList;
  }

  if (list.length > 0) {
    const defaultIds = [
      { id: "tpl_highline_impl", sharingId: "highline", tipo: "implantacao", nome: "LPU Highline do Brasil — Implantação" },
      { id: "tpl_highline_op", sharingId: "highline", tipo: "manutencao", nome: "LPU Highline do Brasil — Operação" },
      { id: "tpl_ihs_impl", sharingId: "ihs", tipo: "implantacao", nome: "LPU IHS Towers — Implantação" },
      { id: "tpl_ihs_op", sharingId: "ihs", tipo: "manutencao", nome: "LPU IHS Towers — Operação" },
      { id: "tpl_winity_impl", sharingId: "winity", tipo: "implantacao", nome: "LPU Winity Telecom — Implantação" },
      { id: "tpl_winity_op", sharingId: "winity", tipo: "manutencao", nome: "LPU Winity Telecom — Operação" },
      { id: "tpl_atc_impl", sharingId: "atc", tipo: "implantacao", nome: "LPU ATC / SBA — Implantação" },
      { id: "tpl_atc_op", sharingId: "atc", tipo: "manutencao", nome: "LPU ATC / SBA — Operação" },
    ];
    defaultIds.forEach(def => {
      if (!list.find(t => t.id === def.id)) {
        list.push({
          id: def.id,
          sharingId: def.sharingId,
          tipo: def.tipo as any,
          nome: def.nome,
          versao: "V1",
          itens: [],
          ativo: true,
          criadoEm: new Date().toISOString()
        });
        changed = true;
      }
    });
  }

  if (changed && list.length > 0) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  return list;
}

export function saveLpuTemplates(templates: LpuTemplate[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(templates));
}

export function findTemplate(sharingId: string, tipo: "implantacao" | "manutencao", templates: LpuTemplate[]): LpuTemplate | undefined {
  // Busca template ativo para este sharing + tipo
  let tpl = templates.find(t => t.sharingId === sharingId && t.tipo === tipo && t.ativo);
  // Fallback: template genérico
  if (!tpl) tpl = templates.find(t => t.sharingId === "generico" && t.tipo === tipo && t.ativo);
  return tpl;
}

// Converte os dados do DB existente (array de itens com cod, resumo, solucao, config, unid, vl_medio)
// para o formato LpuTemplateItem
export function convertDbToTemplateItems(dbItems: any[]): LpuTemplateItem[] {
  return dbItems.map(item => ({
    cod: item.cod,
    resumo: item.resumo || "GERAL",
    solucao: item.solucao || item.descricao || "",
    config: item.config || "",
    unid: item.unid || "VB",
    tipoCusto: guessTipoCusto(item.resumo || ""),
    vlReferencia: item.vl_medio || item.vlMercado || 0,
    obrigatorio: false,
  }));
}

function guessTipoCusto(resumo: string): "MO" | "Material" | "Serviço" | "Verba" {
  const r = resumo.toUpperCase();
  if (r.includes("MÃO") || r.includes("TÉCNICO") || r.includes("EQUIPE")) return "MO";
  if (r.includes("MATERIAL") || r.includes("CABO") || r.includes("FITA") || r.includes("CONECTORES")) return "Material";
  return "Serviço";
}

// Inicializa templates a partir dos DBs existentes (chamado na primeira carga)
export function seedTemplatesFromDB(dbImpl: any[], dbOp: any[], dbHighline?: any[]): LpuTemplate[] {
  const now = new Date().toISOString();
  const templates: LpuTemplate[] = [];

  // Template Genérico Implantação
  templates.push({
    id: "tpl_generico_impl",
    sharingId: "generico",
    tipo: "implantacao",
    nome: "LPU Genérico — Implantação",
    versao: "V1",
    itens: convertDbToTemplateItems(dbImpl),
    ativo: true,
    criadoEm: now,
  });

  // Template Genérico Manutenção
  templates.push({
    id: "tpl_generico_op",
    sharingId: "generico",
    tipo: "manutencao",
    nome: "LPU Genérico — Manutenção",
    versao: "V1",
    itens: convertDbToTemplateItems(dbOp),
    ativo: true,
    criadoEm: now,
  });

  // Template Highline Implantação (se disponível)
  if (dbHighline && dbHighline.length > 0) {
    templates.push({
      id: "tpl_highline_impl",
      sharingId: "highline",
      tipo: "implantacao",
      nome: "LPU Highline do Brasil — Implantação (Adequação)",
      versao: "V1",
      itens: convertDbToTemplateItems(dbHighline),
      ativo: true,
      criadoEm: now,
    });
  } else {
    templates.push({
      id: "tpl_highline_impl",
      sharingId: "highline",
      tipo: "implantacao",
      nome: "LPU Highline do Brasil — Implantação",
      versao: "V1",
      itens: [],
      ativo: true,
      criadoEm: now,
    });
  }

  // Template Highline Operação
  templates.push({
    id: "tpl_highline_op",
    sharingId: "highline",
    tipo: "manutencao",
    nome: "LPU Highline do Brasil — Operação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });

  // Template IHS
  templates.push({
    id: "tpl_ihs_impl",
    sharingId: "ihs",
    tipo: "implantacao",
    nome: "LPU IHS Towers — Implantação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });
  templates.push({
    id: "tpl_ihs_op",
    sharingId: "ihs",
    tipo: "manutencao",
    nome: "LPU IHS Towers — Operação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });

  // Template Winity
  templates.push({
    id: "tpl_winity_impl",
    sharingId: "winity",
    tipo: "implantacao",
    nome: "LPU Winity Telecom — Implantação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });
  templates.push({
    id: "tpl_winity_op",
    sharingId: "winity",
    tipo: "manutencao",
    nome: "LPU Winity Telecom — Operação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });

  // Template ATC
  templates.push({
    id: "tpl_atc_impl",
    sharingId: "atc",
    tipo: "implantacao",
    nome: "LPU ATC / SBA — Implantação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });
  templates.push({
    id: "tpl_atc_op",
    sharingId: "atc",
    tipo: "manutencao",
    nome: "LPU ATC / SBA — Operação",
    versao: "V1",
    itens: [],
    ativo: true,
    criadoEm: now,
  });

  return templates;
}
