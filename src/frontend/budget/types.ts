// ══════════════════════════════════════════════════════════
// TIPOS DO SISTEMA DE ORÇAMENTOS — MULTI-SHARING + LPU
// ══════════════════════════════════════════════════════════

// ── Sharing Client (Empresa de Sharing / Cliente de Infra) ──
export interface SharingClient {
  id: string;
  nome: string;           // "Highline do Brasil"
  sigla: string;          // "HL"
  cnpj: string;
  tipo: "Sharing" | "Operadora";
  contato: string;
  email: string;
  telefone: string;
  bdiPadrao: number;      // BDI default do contrato
  lucroPadrao: number;    // Margem default
  descontoPadrao: number; // Desconto default
  cor: string;            // Cor para UI
  ativo: boolean;
}

// ── Item de Template LPU ──
export interface LpuTemplateItem {
  cod: string;            // "MS001"
  resumo: string;         // Categoria: "MASTRO", "FUNDAÇÃO"
  solucao: string;        // Descrição do escopo
  config?: string;        // Configuração/variante
  unid: string;           // "VB", "M", "M²", "PÇ", "H/H"
  tipoCusto: "MO" | "Material" | "Serviço" | "Verba";
  vlReferencia: number;   // Preço referência
  obrigatorio: boolean;   // Item obrigatório no orçamento?
}

// ── Template de LPU (1 template = 1 Sharing × 1 Tipo) ──
export interface LpuTemplate {
  id: string;
  sharingId: string;      // Link para SharingClient
  tipo: "implantacao" | "manutencao";
  nome: string;           // "LPU Highline — Implantação 2026"
  versao: string;         // "V1", "V2"
  itens: LpuTemplateItem[];
  ativo: boolean;
  criadoEm: string;
}

// ── Item de linha dentro de um bloco de orçamento ──
export interface BudgetLineItem {
  id: string;
  cod: string;
  descricao: string;
  config?: string;
  unid: string;
  tipoCusto: "MO" | "Material" | "Serviço" | "Verba";
  categoria: string;      // "MASTRO", "FUNDAÇÃO"
  qtde: number;
  vlUnitario: number;     // Valor base (antes do desconto)
  vlReferencia: number;   // Original do template (read-only)
  descontoPct?: number;   // Desconto percentual por item
  descontoValor?: number; // Desconto em R$ por item
  desconto?: number;      // Legacy: desconto percentual (compatibilidade)
}

// ── Bloco de Sharing dentro de um orçamento ──
export interface BudgetSharingBlock {
  id: string;
  sharingId: string;
  sharingNome: string;    // Desnormalizado para display
  sharingCor: string;
  tipo: "implantacao" | "manutencao";
  templateId?: string;    // Qual template foi carregado
  itens: BudgetLineItem[];
  bdi: number;
  lucro: number;
  discount: number;
  obs: string;
}

// ── Orçamento completo (documento principal) ──
export interface Budget {
  id: string;             // "ORC-2026-0001"
  versao: number;
  data: string;
  status: "Rascunho" | "Validado" | "Enviado" | "Aprovado" | "Rejeitado";

  // Site
  siteInfo: {
    siteId: string;         // ID Interno/Busca
    sharingNome: string;    // Empresa de Sharing (Infra)
    siteIdSharing: string;  // ID no cliente de infra
    siteIdOperadora: string; // ID na operadora final
    operadora: string;
    uf: string;
    municipio: string;
    endereco: string;
    latitude?: string;
    longitude?: string;

    // Hierarquia de Projeto
    categoriaProjeto?: string; // "Manutenção O&M" | "Implantação"
    tipoProjeto?: string;      // "BTS", "Obra BTS", etc.
  };

  // Blocos de sharing (coração do multi-sharing)
  blocos: BudgetSharingBlock[];

  // Metadados
  contratante: string;
  objeto: string;
  vigencia: string;
  prazoOpex?: number;     // Meses (para cálculo OPEX contrato)
  fornecedor: string;
  obs: string;

  // Totais computados (cache para listagens)
  totalCapex: number;
  totalOpex: number;
  totalGeral: number;

  // Controle
  projetoId?: string;     // Se virou obra
}

export interface BudgetLineItemFinancials {
  unitBase: number;
  discountPct: number;
  discountUnit: number;
  unitNet: number;
  totalBase: number;
  totalDiscount: number;
  totalNet: number;
}

// ── Helpers de cálculo ──
export function calcItemTotal(item: BudgetLineItem): number {
  return calcItemUnitNet(item) * item.qtde;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const roundCurrency = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function getItemBase(item: BudgetLineItem): number {
  return Number(item.vlUnitario) || 0;
}

export function getItemDiscountPct(item: BudgetLineItem): number {
  if (item.descontoPct != null && !Number.isNaN(item.descontoPct)) return clamp(item.descontoPct, 0, 100);
  if (item.desconto != null && !Number.isNaN(item.desconto)) return clamp(item.desconto, 0, 100);
  const base = getItemBase(item);
  if (item.descontoValor != null && !Number.isNaN(item.descontoValor) && base > 0) {
    return clamp((item.descontoValor / base) * 100, 0, 100);
  }
  return 0;
}

export function getItemDiscountValor(item: BudgetLineItem): number {
  const base = getItemBase(item);
  if (item.descontoValor != null && !Number.isNaN(item.descontoValor)) return clamp(item.descontoValor, 0, base);
  const pct = getItemDiscountPct(item);
  return clamp(base * (pct / 100), 0, base);
}

export function calcItemUnitNet(item: BudgetLineItem): number {
  const base = getItemBase(item);
  const desc = getItemDiscountValor(item);
  return Math.max(0, base - desc);
}

export function calcItemFinancials(item: BudgetLineItem): BudgetLineItemFinancials {
  const qtde = Number(item.qtde) || 0;
  const unitBase = roundCurrency(getItemBase(item));
  const discountPct = roundCurrency(getItemDiscountPct(item));
  const discountUnit = roundCurrency(getItemDiscountValor(item));
  const unitNet = roundCurrency(calcItemUnitNet(item));
  const totalBase = roundCurrency(unitBase * qtde);
  const totalDiscount = roundCurrency(discountUnit * qtde);
  const totalNet = roundCurrency(unitNet * qtde);

  return {
    unitBase,
    discountPct,
    discountUnit,
    unitNet,
    totalBase,
    totalDiscount,
    totalNet,
  };
}

export function calcBlocoTotal(bloco: BudgetSharingBlock): number {
  return bloco.itens.reduce((sum, item) => sum + calcItemTotal(item), 0);
}

export function calcBlocoCustoDireto(bloco: BudgetSharingBlock): number {
  return bloco.itens.reduce((sum, item) => sum + calcItemTotal(item), 0);
}

export function calcBudgetTotals(budget: Budget): { totalCapex: number; totalOpex: number; totalGeral: number } {
  let totalCapex = 0, totalOpex = 0;
  budget.blocos.forEach(b => {
    const t = calcBlocoTotal(b);
    if (b.tipo === "implantacao") totalCapex += t;
    else totalOpex += t;
  });
  return { totalCapex, totalOpex, totalGeral: totalCapex + totalOpex };
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
