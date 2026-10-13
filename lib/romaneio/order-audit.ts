import { clean } from "./domain";
import { parseLocaleNumber, type OrderPdfItem } from "./order-parser";

export type OrderAudit = {
  confidence: number; // 0–100
  expectedItems: number;
  foundItems: number;
  missingItems: string[];
  issues: string[];
  footerVolume?: number;
  parsedVolume?: number;
};

const nums = (re: RegExp, text: string) =>
  [...text.matchAll(re)].map((m) => parseLocaleNumber(m[1])).filter((n): n is number => n !== undefined);

/** Confere o resultado do parser contra o próprio PDF: sequência de itens e totais do rodapé. */
export function auditOrderParse(pdfText: string, items: OrderPdfItem[]): OrderAudit {
  const issues: string[] = [];
  const topLevel = items.filter((i) => !i.item.includes("."));
  const parentNums = new Set(topLevel.map((i) => Number(i.item)));
  const allNums = new Set(items.map((i) => Number(i.item.split(".")[0])));

  // Maior número de item visto no texto (âncoras "item código") mesmo que a linha não tenha sido interpretada.
  const anchorNums = [...pdfText.matchAll(/^\s*(\d{1,4})(?:\.\d+)?\s+\d{4,12}\b/gm)].map((m) => Number(m[1]));
  const maxItem = Math.max(0, ...anchorNums, ...allNums);

  const missing: string[] = [];
  for (let n = 1; n <= maxItem; n++) if (!allNums.has(n) && !parentNums.has(n)) missing.push(String(n));
  if (missing.length) issues.push(`Itens sem leitura no PDF: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}.`);

  const dup = new Map<string, number>();
  items.forEach((i) => dup.set(i.code, (dup.get(i.code) || 0) + 1));

  let footerVolume: number | undefined;
  let parsedVolume: number | undefined;
  const flat = clean(pdfText);
  const vols = nums(/Total Volume[^\d]{0,20}([\d.]+,\d+|\d+)/gi, flat);
  if (vols.length) {
    footerVolume = vols.reduce((a, b) => a + b, 0);
    const leaf = items.filter((i) => i.item.includes(".") || !items.some((o) => o.item.startsWith(i.item + ".")));
    parsedVolume = leaf.reduce((s, i) => s + (i.volume ?? 0), 0);
    const diff = Math.abs(footerVolume - parsedVolume);
    if (footerVolume > 0 && diff / footerVolume > 0.03) {
      issues.push(`Volume total do PDF (${footerVolume.toFixed(3).replace(".", ",")}) difere da soma dos itens (${parsedVolume.toFixed(3).replace(".", ",")}).`);
    }
  }

  const suspicious = items.filter((i) => i.description.length > 320 || (i.description.match(/\b\d{1,4}\s+\d{4,12}\b/g)?.length || 0) > 1);
  if (suspicious.length) issues.push(`${suspicious.length} descrição(ões) parecem misturadas com itens vizinhos: ${suspicious.slice(0, 5).map((i) => i.item).join(", ")}.`);

  let confidence = 100;
  if (!items.length) confidence = 0;
  else {
    confidence -= Math.min(60, missing.length * 12);
    confidence -= Math.min(25, suspicious.length * 6);
    if (issues.some((t) => t.startsWith("Volume"))) confidence -= 15;
  }
  return {
    confidence: Math.max(0, Math.round(confidence)),
    expectedItems: maxItem,
    foundItems: allNums.size,
    missingItems: missing,
    issues,
    footerVolume,
    parsedVolume,
  };
}
