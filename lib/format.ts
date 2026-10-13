// Formatação de quantidades reais (pt-BR). Nunca arredonda para inteiro quando houver decimal.
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const fmt = (n: number | string | null | undefined) => nf.format(Number(n || 0));
export const pct = (parte: number, total: number) =>
  total > 0 ? Math.min(100, (parte / total) * 100) : 0;
export const fmtPct = (v: number) =>
  `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
