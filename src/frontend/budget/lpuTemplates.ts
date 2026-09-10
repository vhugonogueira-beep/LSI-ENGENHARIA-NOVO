import { LpuTemplate, LpuTemplateItem } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador de LPU: as bases vêm do banco (tabela PriceBook), não mais do
// localStorage.
//
// O formato LpuTemplate continua existindo porque o TabOrcamentoV2 foi escrito
// em cima dele; aqui a base do banco é traduzida para esse formato. Assim existe
// um caminho só para o preço — o que é editado em "Bases (LPUs)" é o mesmo que
// o orçamento e a Atividade usam.
//
// O localStorage sobrevive só como ORIGEM da migração de mão única: quem já
// tinha LPU no navegador consegue trazer para o banco pela própria tela.
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = "ls_lpuTemplates";
const LS_KEY_MIGRADO = "ls_lpuTemplates_migrado_para_banco";

const TIPO_CUSTO_DO_BANCO: Record<string, LpuTemplateItem["tipoCusto"]> = {
  MO: "MO", MATERIAL: "Material", SERVICO: "Serviço", VERBA: "Verba",
};

/** Nome do contratante/fornecedor vira o sharingId usado pelo orçamento ("highline"). */
function sharingIdDe(base: any): string {
  const nome: string = base?.contratante?.nome || base?.supplier?.nome || base?.nome_lpu || "";
  const limpo = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const semPrefixo = limpo.replace(/^lpu\s+/, "").trim();
  return semPrefixo.split(/[\s/—-]+/)[0] || "generico";
}

function itemDoBanco(i: any): LpuTemplateItem {
  return {
    cod: i.codigo_item || "",
    resumo: i.subtipo || "GERAL",
    solucao: i.descricao || "",
    config: i.detalhamento || "",
    unid: i.unidade || "VB",
    tipoCusto: TIPO_CUSTO_DO_BANCO[i.tipo_custo] || "Serviço",
    vlReferencia: Number(i.valor_unitario) || 0,
    obrigatorio: !!i.obrigatorio,
  };
}

/**
 * Carrega todas as bases do banco no formato que o orçamento entende.
 * Uma falha de rede devolve lista vazia — a tela decide o que fazer.
 */
export async function carregarTemplatesDoBanco(): Promise<LpuTemplate[]> {
  const r = await fetch("/api/pricebooks");
  if (!r.ok) return [];
  const bases: any[] = await r.json();

  const comItens = await Promise.all(
    bases.map(async base => {
      const ri = await fetch(`/api/pricebooks/${base.id}/items?limit=2000`);
      const d = ri.ok ? await ri.json() : { items: [] };
      const itens: any[] = Array.isArray(d) ? d : (d.items || []);
      const tpl: LpuTemplate = {
        id: base.id,
        sharingId: sharingIdDe(base),
        tipo: base.tipo === "OPERACAO" ? "manutencao" : "implantacao",
        nome: base.nome_lpu,
        versao: base.versao || "V1",
        itens: itens.map(itemDoBanco),
        ativo: base.status !== "ARQUIVADA",
        criadoEm: base.created_at || new Date().toISOString(),
      };
      return tpl;
    }),
  );

  return comItens;
}

export function findTemplate(sharingId: string, tipo: "implantacao" | "manutencao", templates: LpuTemplate[]): LpuTemplate | undefined {
  // Base ativa deste sharing + tipo; senão qualquer base ativa do sharing;
  // senão a genérica do tipo.
  return templates.find(t => t.sharingId === sharingId && t.tipo === tipo && t.ativo)
    || templates.find(t => t.sharingId === sharingId && t.ativo)
    || templates.find(t => t.sharingId === "generico" && t.tipo === tipo && t.ativo);
}

// ─── Migração de mão única do localStorage ───────────────────────────────────

/**
 * LPUs que ainda só existem no navegador desta máquina. Devolve lista vazia
 * depois que a migração foi feita — o banco passa a ser a única fonte.
 */
export function lerTemplatesLocaisPendentes(): LpuTemplate[] {
  try {
    if (localStorage.getItem(LS_KEY_MIGRADO) === "sim") return [];
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const lista: LpuTemplate[] = JSON.parse(raw);
    if (!Array.isArray(lista)) return [];
    // Base sem item nenhum não tem o que migrar.
    return lista.filter(t => Array.isArray(t.itens) && t.itens.length > 0);
  } catch {
    return [];
  }
}

/** Registra que a migração já rodou; o aviso na tela some para sempre. */
export function marcarMigracaoConcluida() {
  try {
    localStorage.setItem(LS_KEY_MIGRADO, "sim");
  } catch { /* navegador sem storage — o pior caso é o aviso reaparecer */ }
}

// ─── Conversão dos catálogos fixos do código (fallback) ──────────────────────

/**
 * Converte um dos catálogos embutidos no código para o formato de item.
 * Só é usado quando o banco ainda não tem base nenhuma, para a tela de
 * orçamento não abrir vazia numa instalação nova.
 */
export function convertDbToTemplateItems(dbItems: any[]): LpuTemplateItem[] {
  return (dbItems || []).map(item => ({
    cod: item.cod,
    resumo: item.resumo || "GERAL",
    solucao: item.solucao || item.descricao || "",
    config: item.config || "",
    unid: item.unid || "VB",
    tipoCusto: adivinharTipoCusto(item.resumo || ""),
    vlReferencia: item.vl_medio || item.vlMercado || 0,
    obrigatorio: false,
  }));
}

function adivinharTipoCusto(resumo: string): LpuTemplateItem["tipoCusto"] {
  const r = resumo.toUpperCase();
  if (r.includes("MÃO") || r.includes("TÉCNICO") || r.includes("EQUIPE")) return "MO";
  if (r.includes("MATERIAL") || r.includes("CABO") || r.includes("FITA") || r.includes("CONECTORES")) return "Material";
  return "Serviço";
}

/** Bases mínimas a partir dos catálogos fixos, quando o banco está vazio. */
export function templatesDeFallback(dbImpl: any[], dbOp: any[], dbHighline?: any[]): LpuTemplate[] {
  const agora = new Date().toISOString();
  const base = (id: string, sharingId: string, tipo: "implantacao" | "manutencao", nome: string, itens: LpuTemplateItem[]): LpuTemplate =>
    ({ id, sharingId, tipo, nome, versao: "V1", itens, ativo: true, criadoEm: agora });

  return [
    base("tpl_generico_impl", "generico", "implantacao", "LPU Genérico — Implantação", convertDbToTemplateItems(dbImpl)),
    base("tpl_generico_op", "generico", "manutencao", "LPU Genérico — Manutenção", convertDbToTemplateItems(dbOp)),
    base("tpl_highline_impl", "highline", "implantacao", "LPU Highline do Brasil — Implantação", convertDbToTemplateItems(dbHighline || [])),
  ];
}
