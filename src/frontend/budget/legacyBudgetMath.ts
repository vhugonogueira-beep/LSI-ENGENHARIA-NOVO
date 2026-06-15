export interface LegacyBudgetSiteInfo {
  siteId?: string;
  nomeDetentora?: string;
  siteDetentora?: string;
  operadora?: string;
  uf?: string;
  municipio?: string;
  endereco?: string;
  sharingNome?: string;
  siteIdSharing?: string;
  siteIdOperadora?: string;
}

export interface LegacyBudgetItem {
  cod: string;
  resumo: string;
  solucao: string;
  config?: string;
  unid: string;
  qtde: number;
  vl_custom: number;
  vl_medio?: number;
  descItem?: number;
  bdiItem?: number;
  lucroItem?: number;
}

export interface LegacyBudget {
  id: string;
  data: string;
  area: string;
  status: string;
  siteInfo: LegacyBudgetSiteInfo;
  itens: LegacyBudgetItem[];
  discount?: number;
  discountPercentual?: number;
  discountValue?: number;
  bdi?: number;
  lucro?: number;
  totalBruto?: number;
  totalCustom?: number;
  totalLiquido?: number;
  totalBdi?: number;
  totalLucro?: number;
  totalFinal?: number;
  contratante?: string;
  objeto?: string;
  vigencia?: string;
  obs?: string;
  [key: string]: unknown;
}

export interface LegacyBudgetItemTotals {
  quantity: number;
  unitOriginal: number;
  discountPct: number;
  discountUnit: number;
  unitNet: number;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  bdiPct: number;
  totalBdi: number;
  lucroPct: number;
  totalLucro: number;
  totalFinal: number;
}

export interface LegacyBudgetTotals {
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  totalBdi: number;
  totalLucro: number;
  totalFinal: number;
}

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const clampPercent = (value: unknown): number =>
  Math.min(100, Math.max(0, toFiniteNumber(value)));

export const isLegacyBudget = (value: unknown): value is LegacyBudget => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.itens) && !Array.isArray(candidate.blocos);
};

export function calcLegacyBudgetItemTotals(
  item: Partial<LegacyBudgetItem>,
  budget: Pick<LegacyBudget, "discount" | "bdi" | "lucro">
): LegacyBudgetItemTotals {
  const quantity = Math.max(0, toFiniteNumber(item.qtde));
  const unitOriginal = roundCurrency(Math.max(0, toFiniteNumber(item.vl_custom)));
  const discountPct = clampPercent(item.descItem ?? budget.discount ?? 0);
  const bdiPct = clampPercent(item.bdiItem ?? budget.bdi ?? 0);
  const lucroPct = clampPercent(item.lucroItem ?? budget.lucro ?? 0);

  const discountUnit = roundCurrency(unitOriginal * (discountPct / 100));
  const unitNet = roundCurrency(unitOriginal - discountUnit);
  const totalBruto = roundCurrency(unitOriginal * quantity);
  const totalDesconto = roundCurrency(discountUnit * quantity);
  const totalLiquido = roundCurrency(unitNet * quantity);
  const totalBdi = roundCurrency(totalLiquido * (bdiPct / 100));
  const totalLucro = roundCurrency((totalLiquido + totalBdi) * (lucroPct / 100));
  const totalFinal = roundCurrency(totalLiquido + totalBdi + totalLucro);

  return {
    quantity,
    unitOriginal,
    discountPct,
    discountUnit,
    unitNet,
    totalBruto,
    totalDesconto,
    totalLiquido,
    bdiPct,
    totalBdi,
    lucroPct,
    totalLucro,
    totalFinal,
  };
}

export function calcLegacyBudgetTotals(
  budget: Pick<LegacyBudget, "itens" | "discount" | "bdi" | "lucro">
): LegacyBudgetTotals {
  return (budget.itens || []).reduce<LegacyBudgetTotals>(
    (acc, item) => {
      const totals = calcLegacyBudgetItemTotals(item, budget);
      acc.totalBruto = roundCurrency(acc.totalBruto + totals.totalBruto);
      acc.totalDesconto = roundCurrency(acc.totalDesconto + totals.totalDesconto);
      acc.totalLiquido = roundCurrency(acc.totalLiquido + totals.totalLiquido);
      acc.totalBdi = roundCurrency(acc.totalBdi + totals.totalBdi);
      acc.totalLucro = roundCurrency(acc.totalLucro + totals.totalLucro);
      acc.totalFinal = roundCurrency(acc.totalFinal + totals.totalFinal);
      return acc;
    },
    {
      totalBruto: 0,
      totalDesconto: 0,
      totalLiquido: 0,
      totalBdi: 0,
      totalLucro: 0,
      totalFinal: 0,
    }
  );
}

export function hydrateLegacyBudget<T extends LegacyBudget>(budget: T): T {
  const sanitized = {
    ...budget,
    discount: clampPercent(budget.discount ?? budget.discountPercentual ?? 0),
    bdi: clampPercent(budget.bdi ?? 0),
    lucro: clampPercent(budget.lucro ?? 0),
    itens: Array.isArray(budget.itens) ? budget.itens : [],
  };

  const totals = calcLegacyBudgetTotals(sanitized);

  return {
    ...sanitized,
    discountPercentual: sanitized.discount,
    discountValue: totals.totalDesconto,
    totalBruto: totals.totalBruto,
    totalCustom: totals.totalBruto,
    totalLiquido: totals.totalLiquido,
    totalBdi: totals.totalBdi,
    totalLucro: totals.totalLucro,
    totalFinal: totals.totalFinal,
  };
}
