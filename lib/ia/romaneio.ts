import { generateText, tool } from "ai";
import { z } from "zod";
import { assertGatewayConfigured, MODEL } from "@/lib/ia/claude";

export const ItemSchema = z.object({
  codigo: z.string().default(""),
  descricao: z.string(),
  quantidade: z.number(),
  unidade: z.string().default("UN"),
  pesoKg: z.number().nullable().default(null),
  volumes: z.number().nullable().default(null),
  observacao: z.string().default(""),
});

export const RomaneioIASchema = z.object({
  pedido: z.string().default(""),
  cliente: z.string().default(""),
  transportadora: z.string().default(""),
  rota: z.string().default(""),
  motorista: z.string().default(""),
  placa: z.string().default(""),
  notaFiscal: z.string().default(""),
  dataEntrega: z.string().default(""),
  itens: z.array(ItemSchema),
  observacoes: z.string().default(""),
});
export type RomaneioIA = z.infer<typeof RomaneioIASchema>;

export type Alerta = { nivel: "erro" | "aviso"; campo: string; mensagem: string };

const SYSTEM = `Você extrai romaneios de expedição (fábrica de portas, marcos e alizares) a partir de texto de pedidos, planilhas ou PDFs.
- Extraia somente o que está no texto. Campo ausente = string vazia ou null. Nunca invente.
- Quantidades são números (use ponto decimal). Preserve códigos e descrições originais; não resuma itens.
- Se o contexto histórico trouxer padrões do mesmo cliente (transportadora, rota), use-os apenas para campos vazios e marque isso em "observacoes".`;

export async function extrairRomaneio(
  texto: string,
  historico: string[] = []
): Promise<RomaneioIA> {
  assertGatewayConfigured();

  const ctx = historico.length
    ? `\n\nHistórico recente do sistema (padrões da empresa):\n${historico.join("\n")}`
    : "";

  const { toolCalls } = await generateText({
    model: MODEL,
    system: SYSTEM,
    prompt: `Texto de origem:
"""
${texto.slice(0, 120_000)}
"""${ctx}`,
    tools: {
      salvar_romaneio: tool({
        description: "Retorna o romaneio extraído em formato estruturado.",
        inputSchema: RomaneioIASchema,
      }),
    },
    toolChoice: { type: "tool", toolName: "salvar_romaneio" },
    maxOutputTokens: 8000,
  });

  const call = toolCalls.find((c) => c.toolName === "salvar_romaneio");
  if (!call) throw new Error("A IA não retornou dados estruturados.");
  return RomaneioIASchema.parse(call.input);
}

/** Validação determinística — roda SEMPRE depois da IA, antes de emitir. */
export function validarRomaneio(r: RomaneioIA): Alerta[] {
  const a: Alerta[] = [];
  if (!r.itens.length) a.push({ nivel: "erro", campo: "itens", mensagem: "Nenhum item identificado." });
  if (!r.cliente) a.push({ nivel: "aviso", campo: "cliente", mensagem: "Cliente não informado." });
  if (!r.pedido) a.push({ nivel: "aviso", campo: "pedido", mensagem: "Número do pedido não informado." });
  if (!r.transportadora) a.push({ nivel: "aviso", campo: "transportadora", mensagem: "Transportadora não informada." });
  if (!r.rota) a.push({ nivel: "aviso", campo: "rota", mensagem: "Rota não informada." });
  const vistos = new Map<string, number>();
  r.itens.forEach((it, i) => {
    const n = i + 1;
    if (!(it.quantidade > 0)) a.push({ nivel: "erro", campo: `itens[${n}]`, mensagem: `Item ${n} (${it.descricao.slice(0, 40)}): quantidade zerada ou inválida.` });
    if (!it.descricao.trim()) a.push({ nivel: "erro", campo: `itens[${n}]`, mensagem: `Item ${n}: descrição vazia.` });
    if (it.pesoKg !== null && it.pesoKg <= 0) a.push({ nivel: "aviso", campo: `itens[${n}]`, mensagem: `Item ${n}: peso inválido.` });
    const key = `${it.codigo}|${it.descricao}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (vistos.has(key)) a.push({ nivel: "aviso", campo: `itens[${n}]`, mensagem: `Item ${n} duplicado (igual ao item ${vistos.get(key)}).` });
    else vistos.set(key, n);
  });
  return a;
}

export function agruparPorCarga(r: RomaneioIA, maxVolumesPorCarga = 0) {
  const total = r.itens.reduce((s, i) => s + i.quantidade, 0);
  const pesoTotal = r.itens.reduce((s, i) => s + (i.pesoKg ?? 0), 0);
  const volumesTotal = r.itens.reduce((s, i) => s + (i.volumes ?? 0), 0);
  const cargas: { carga: number; itens: number[] }[] = [];
  if (maxVolumesPorCarga > 0) {
    let atual = { carga: 1, itens: [] as number[] }, acc = 0;
    r.itens.forEach((it, i) => {
      const v = it.volumes ?? 0;
      if (acc + v > maxVolumesPorCarga && atual.itens.length) { cargas.push(atual); atual = { carga: atual.carga + 1, itens: [] }; acc = 0; }
      atual.itens.push(i); acc += v;
    });
    if (atual.itens.length) cargas.push(atual);
  } else cargas.push({ carga: 1, itens: r.itens.map((_, i) => i) });
  return { total, pesoTotal, volumesTotal, cargas };
}

