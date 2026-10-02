import type { Produto } from "@/types/pcp";

/**
 * Ordenação padrão da fábrica: da MAIOR medida para a MENOR.
 * Medida vem como "CxLxE" (ex.: 2150x60x30). DIM_PRINCIPAL define qual dimensão manda:
 * 0 = primeira (comprimento/maior lado), 1 = segunda (largura).
 */
export const DIM_PRINCIPAL: 0 | 1 = 0;

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

export function dims(medida: string): [number, number, number] {
  const m = String(medida || "").match(/(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/i);
  if (!m) return [0, 0, 0];
  return [m[1], m[2], m[3]].map((x) => Number(x.replace(",", "."))) as [number, number, number];
}

export const FAMILIAS = ["BATENTES", "ALIZARES", "KIT CORRER", "BAGUETE", "PORTAS", "BANDEIRA", "OUTROS"] as const;
export type Familia = (typeof FAMILIAS)[number];

export function familiaDe(categoria: string): Familia {
  const c = norm(categoria);
  if (c.startsWith("BATENTE")) return "BATENTES";
  if (c.startsWith("ALIZAR")) return "ALIZARES";
  if (c.startsWith("KIT")) return "KIT CORRER";
  if (c.startsWith("BAGUETE")) return "BAGUETE";
  if (c.startsWith("PORTA")) return "PORTAS";
  if (c.startsWith("BANDEIRA")) return "BANDEIRA";
  return "OUTROS";
}

const peso = (p: Produto) => (p.prioridade === "URGENTE" ? 0 : p.prioridade === "ALTA" ? 1 : 2);

type Chave = Pick<Produto, "categoria" | "material" | "acabamento" | "cor" | "medida" | "rebaixo">;

/** Comparador de agrupamento: família → material → acabamento → cor → medida (maior→menor). */
export function compareChave(a: Chave, b: Chave) {
  const fa = FAMILIAS.indexOf(familiaDe(a.categoria)), fb = FAMILIAS.indexOf(familiaDe(b.categoria));
  if (fa !== fb) return fa - fb;
  const t = (x: string, y: string) => norm(x).localeCompare(norm(y), "pt-BR", { numeric: true });
  const c = t(a.material, b.material) || t(a.acabamento, b.acabamento) || t(a.cor, b.cor);
  if (c) return c;
  const da = dims(a.medida), db = dims(b.medida), k = DIM_PRINCIPAL, o = k === 0 ? 1 : 0;
  return db[k] - da[k] || db[o] - da[o] || db[2] - da[2] || t(a.categoria, b.categoria) || t(a.rebaixo, b.rebaixo);
}

export function compareProduto(a: Produto, b: Produto) {
  return (
    peso(a) - peso(b) ||
    compareChave(a, b) ||
    a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }) ||
    a.of.localeCompare(b.of, "pt-BR", { numeric: true })
  );
}
