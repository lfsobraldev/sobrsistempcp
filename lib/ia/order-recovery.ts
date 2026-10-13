import { claude, MODEL } from "@/lib/ia/claude";
import type { OrderPdfItem } from "@/lib/romaneio/order-parser";

const TOOL = {
  name: "itens_recuperados",
  description: "Itens do pedido que o leitor automático não conseguiu interpretar.",
  input_schema: {
    type: "object" as const,
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string", description: "Número do item exatamente como no pedido (ex.: 12 ou 12.1)" },
            codigo: { type: "string", description: "Código numérico do produto (4 a 12 dígitos)" },
            descricao: { type: "string" },
            unidade: { type: "string" },
            quantidade: { type: "number" },
            volume: { type: "number" },
          },
          required: ["item", "codigo", "descricao", "quantidade"],
        },
      },
    },
    required: ["itens"],
  },
};

/** Pede à IA somente os itens que o parser determinístico não achou. Nunca substitui itens já lidos. */
export async function recuperarItensFaltantes(pdfText: string, faltantes: string[]): Promise<OrderPdfItem[]> {
  if (!faltantes.length || !process.env.ANTHROPIC_API_KEY) return [];
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      "Você lê pedidos de venda de portas, marcos e alizares. Extraia APENAS os itens pedidos, literalmente do texto. " +
      "Não invente códigos nem quantidades; se não encontrar o item, omita-o. Responda chamando a ferramenta.",
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: `Itens a recuperar: ${faltantes.join(", ")}\n\nTexto do pedido:\n"""\n${pdfText.slice(0, 100_000)}\n"""` }],
  });
  const b = res.content.find((x) => x.type === "tool_use");
  if (!b || b.type !== "tool_use") return [];
  const out: OrderPdfItem[] = [];
  for (const r of ((b.input as any).itens || []) as any[]) {
    const item = String(r.item || "").trim();
    const code = String(r.codigo || "").replace(/\D/g, "");
    const q = Number(r.quantidade);
    // só aceita o que foi pedido, com código plausível e que realmente aparece no texto (anti-alucinação)
    if (!faltantes.includes(item.split(".")[0]) && !faltantes.includes(item)) continue;
    if (!/^\d{4,12}$/.test(code) || !(q > 0) || !String(r.descricao || "").trim()) continue;
    if (!pdfText.includes(code)) continue;
    out.push({ item, code, description: String(r.descricao).trim(), unit: String(r.unidade || "UN"), quantity: Math.round(q), volume: Number.isFinite(Number(r.volume)) ? Number(r.volume) : undefined });
  }
  return out;
}

/** Serializa no layout fixo que o parser determinístico já entende, para o pipeline tratar tudo igual. */
export function itensComoTexto(items: OrderPdfItem[]) {
  const f = (n: number) => String(n).replace(".", ",");
  return items.map((i) => `${i.item} ${i.code} ${i.description} ${i.unit || "UN"} ${i.quantity} 0,0 0,0 ${f(i.volume ?? 0)}`).join("\n");
}
