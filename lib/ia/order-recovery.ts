import { generateText, tool } from "ai";
import { z } from "zod";
import { assertGatewayConfigured, HEAVY_MODEL } from "@/lib/ia/claude";
import type { OrderPdfItem } from "@/lib/romaneio/order-parser";

const RecuperadosSchema = z.object({
  itens: z.array(
    z.object({
      item: z.string(),
      codigo: z.string(),
      descricao: z.string(),
      unidade: z.string().optional().default("UN"),
      quantidade: z.number(),
      volume: z.number().optional(),
    })
  ),
});

/** Pede à IA somente os itens que o parser determinístico não achou. Nunca substitui itens já lidos. */
export async function recuperarItensFaltantes(
  pdfText: string,
  faltantes: string[]
): Promise<OrderPdfItem[]> {
  if (!faltantes.length) return [];

  try {
    assertGatewayConfigured();
  } catch {
    return [];
  }

  const { toolCalls } = await generateText({
    model: HEAVY_MODEL,
    system:
      "Você lê pedidos de venda de portas, marcos e alizares. Extraia APENAS os itens pedidos, literalmente do texto. " +
      "Não invente códigos nem quantidades; se não encontrar o item, omita-o.",
    prompt: `Itens a recuperar: ${faltantes.join(", ")}

Texto do pedido:
"""
${pdfText.slice(0, 100_000)}
"""`,
    tools: {
      itens_recuperados: tool({
        description: "Itens do pedido que o leitor automático não conseguiu interpretar.",
        inputSchema: RecuperadosSchema,
      }),
    },
    toolChoice: { type: "tool", toolName: "itens_recuperados" },
    maxOutputTokens: 4000,
  });

  const call = toolCalls.find((c) => c.toolName === "itens_recuperados");
  if (!call) return [];

  const parsed = RecuperadosSchema.parse(call.input);
  const out: OrderPdfItem[] = [];

  for (const r of parsed.itens || []) {
    const item = String(r.item || "").trim();
    const code = String(r.codigo || "").replace(/\D/g, "");
    const q = Number(r.quantidade);

    if (!faltantes.includes(item.split(".")[0]) && !faltantes.includes(item)) continue;
    if (!/^\d{4,12}$/.test(code) || !(q > 0) || !String(r.descricao || "").trim()) continue;
    if (!pdfText.includes(code)) continue;

    out.push({
      item,
      code,
      description: String(r.descricao).trim(),
      unit: String(r.unidade || "UN"),
      quantity: Math.round(q),
      volume: Number.isFinite(Number(r.volume)) ? Number(r.volume) : undefined,
    });
  }

  return out;
}

/** Serializa no layout fixo que o parser determinístico já entende, para o pipeline tratar tudo igual. */
export function itensComoTexto(items: OrderPdfItem[]) {
  const f = (n: number) => String(n).replace(".", ",");
  return items
    .map(
      (i) =>
        `${i.item} ${i.code} ${i.description} ${i.unit || "UN"} ${i.quantity} 0,0 0,0 ${f(
          i.volume ?? 0
        )}`
    )
    .join("\n");
}
