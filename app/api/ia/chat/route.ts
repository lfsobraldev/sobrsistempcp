import { NextResponse } from "next/server";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { session } from "@/lib/auth";
import { assertGatewayConfigured, MODEL, SYSTEM_BASE } from "@/lib/ia/claude";
import { runTool, TOOL_META, type Attachment } from "@/lib/ia/tools";
import { sql } from "@/lib/db";
import { conhecimentoTreinavelPrompt } from "@/lib/ia/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

const rate = new Map<string, number[]>();

function limited(user: string) {
  const now = Date.now();
  const arr = (rate.get(user) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  rate.set(user, arr);
  return arr.length > 20;
}

export async function POST(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (limited(s.usuario)) {
      return NextResponse.json({ error: "Muitas mensagens. Aguarde um minuto." }, { status: 429 });
    }

    assertGatewayConfigured();

    const body = await req.json();
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const messages = incoming
      .filter(
        (m: any) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, 20_000),
      }));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
    }

    const attachments: Attachment[] = [];
    const dataLocal = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Maceio",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date());

    const conhecimentoEquipe = await conhecimentoTreinavelPrompt(messages[messages.length-1].content, 12);
    const system = `${SYSTEM_BASE}
Em perguntas sobre eficiência, gargalos, aumentar produção, metas, bloqueios ou oportunidades, use oportunidades_industriais; não estime lucro sem custos e receitas. Quando não souber onde encontrar um dado, use mapa_fontes_sistema para decidir as fontes disponíveis antes de consultar. Para perguntas livres sobre peças, famílias, materiais, pedidos, código, setor, cor e quantidades, consulte consultar_panorama_pecas sem exigir frases exatas; combine com outras ferramentas se necessário. Sempre cite o escopo da programação ativa e nunca confunda planejado com produção apontada.\nQuando perguntarem quantas peças de uma MEDIDA (como travessas de alizar 50x9), use consultar_pecas_por_medida ANTES de responder. Para TRAVESSAS informe tipoPeca=TRAVESSA; para PERNAS informe tipoPeca=PERNA. Nunca misture travessas com pernas, nem batentes com alizares. Mostre total programado e ressalva do período; se perguntarem esta semana, não confunda programação ativa com todas as datas da semana. Para perguntas sobre alocação, setup, disponibilidade ou distribuição entre máquinas, use simular_aps_maquinas e deixe claro que é cenário estimado, sem dependências entre processos ou horários reais. Para diagnósticos abrangentes, riscos e gargalos da fábrica use diagnostico_integrado e explique a origem e as limitações dos dados. Quando pedirem descrição completa, material ou divergência de código, use consultar_catalogo. Quando perguntarem por produtos incompletos, erros em setores, códigos sem material/medida ou cobertura do catálogo, use diagnosticar_catalogo_setores antes de responder, com setor ou pedido quando informado. Para procedimentos ensinados pela equipe use consultar_conhecimento. Para consultas por semana, mês ou datas, utilize consultar_periodo com as datas locais reais; não trate apenas o filtro ativo como período inteiro. Nunca diga que não possui consulta por medida sem chamar a ferramenta.\n
${conhecimentoEquipe}
Usuário: ${s.usuario} (perfil ${s.perfil}). Tela atual: ${String(body.path || "-")}.
Data/hora local da fábrica (Sergipe): ${dataLocal}.`;

    const aiTools = {
      simular_aps_maquinas: tool({
        description: TOOL_META.simular_aps_maquinas,
        inputSchema: z.object({}),
        execute: async () => runTool("simular_aps_maquinas",{}, {user:s,attachments}),
      }),
      oportunidades_industriais: tool({
        description:TOOL_META.oportunidades_industriais,inputSchema:z.object({}),
        execute:async()=>runTool("oportunidades_industriais",{}, {user:s,attachments}),
      }),
      mapa_fontes_sistema: tool({
        description: TOOL_META.mapa_fontes_sistema,
        inputSchema:z.object({}),
        execute:async()=>runTool("mapa_fontes_sistema",{}, {user:s,attachments}),
      }),
      consultar_panorama_pecas: tool({
        description:TOOL_META.consultar_panorama_pecas,
        inputSchema:z.object({busca:z.string().max(120).optional(),pedido:z.string().max(80).optional(),setor:z.string().max(80).optional(),material:z.enum(["TODOS","PINUS","ULTRA","STD","NAO_CLASSIFICADO"]).optional()}),
        execute:async input=>runTool("consultar_panorama_pecas",input,{user:s,attachments}),
      }),
      diagnostico_integrado: tool({
        description: TOOL_META.diagnostico_integrado,
        inputSchema: z.object({}),
        execute: async () => runTool("diagnostico_integrado", {}, {user:s,attachments}),
      }),
      diagnosticar_catalogo_setores: tool({
        description: TOOL_META.diagnosticar_catalogo_setores,
        inputSchema: z.object({setor:z.string().max(80).optional(),pedido:z.string().max(80).optional()}),
        execute: async input => runTool("diagnosticar_catalogo_setores",input,{user:s,attachments}),
      }),
      consultar_catalogo: tool({
        description: TOOL_META.consultar_catalogo,
        inputSchema: z.object({codigo:z.string().min(1).max(80)}),
        execute: async input => runTool("consultar_catalogo",input,{user:s,attachments}),
      }),
      consultar_conhecimento: tool({
        description: TOOL_META.consultar_conhecimento,
        inputSchema: z.object({assunto:z.string().min(2).max(120)}),
        execute: async input => runTool("consultar_conhecimento",input,{user:s,attachments}),
      }),
      consultar_periodo: tool({
        description: TOOL_META.consultar_periodo,
        inputSchema: z.object({
          inicio: z.string().describe("Data inicial YYYY-MM-DD"),
          fim: z.string().describe("Data final YYYY-MM-DD"),
          familia: z.enum(["ALIZARES","BATENTES","PORTAS","BAGUETE","KIT CORRER"]),
          peca: z.enum(["TODOS","PERNA","TRAVESSA"]).default("TODOS"),
          largura: z.number().nonnegative().optional(),
          espessura: z.number().nonnegative().optional(),
        }),
        execute: async (input) => runTool("consultar_periodo",input,{user:s,attachments}),
      }),
      consultar_pecas_por_medida: tool({
        description: TOOL_META.consultar_pecas_por_medida,
        inputSchema: z.object({
          familia: z.enum(["ALIZARES", "BATENTES", "BAGUETE", "PORTAS"]).default("ALIZARES"),
          tipoPeca: z.enum(["TODOS", "PERNA", "TRAVESSA"]).default("TODOS").describe("Obrigatório TRAVESSA quando a pergunta menciona travessas; PERNA quando menciona pernas."),
          largura: z.number().positive(),
          espessura: z.number().positive(),
          pedido: z.string().optional(),
        }),
        execute: async (input) => runTool("consultar_pecas_por_medida", input, { user: s, attachments }),
      }),
      resumo_metros_lineares: tool({
        description: TOOL_META.resumo_metros_lineares,
        inputSchema: z.object({ pedido: z.string().optional() }),
        execute: async (input) => runTool("resumo_metros_lineares", input, { user: s, attachments }),
      }),
      resumo_producao: tool({
        description: TOOL_META.resumo_producao,
        inputSchema: z.object({}),
        execute: async (input) => runTool("resumo_producao", input, { user: s, attachments }),
      }),
      buscar_pedido: tool({
        description: TOOL_META.buscar_pedido,
        inputSchema: z.object({ pedido: z.string() }),
        execute: async (input) => runTool("buscar_pedido", input, { user: s, attachments }),
      }),
      analisar_riscos: tool({
        description: TOOL_META.analisar_riscos,
        inputSchema: z.object({ pedido: z.string().optional() }),
        execute: async (input) =>
          runTool("analisar_riscos", input, { user: s, attachments }),
      }),
      simular_programacao_urgente: tool({
        description: TOOL_META.simular_programacao_urgente,
        inputSchema: z.object({ pedido: z.string().min(1).max(80) }),
        execute: async (input) =>
          runTool("simular_programacao_urgente", input, { user: s, attachments }),
      }),
      planejar_fabrica: tool({
        description: TOOL_META.planejar_fabrica,
        inputSchema: z.object({}),
        execute: async (input) =>
          runTool("planejar_fabrica", input, { user: s, attachments }),
      }),
      consultar_capacidade: tool({
        description: TOOL_META.consultar_capacidade,
        inputSchema: z.object({}),
        execute: async (input) =>
          runTool("consultar_capacidade", input, { user: s, attachments }),
      }),
      diagnosticar_usinagem: tool({
        description: TOOL_META.diagnosticar_usinagem,
        inputSchema: z.object({ pedido: z.string().optional() }),
        execute: async (input) =>
          runTool("diagnosticar_usinagem", input, { user: s, attachments }),
      }),
      listar_andon: tool({
        description: TOOL_META.listar_andon,
        inputSchema: z.object({}),
        execute: async (input) => runTool("listar_andon", input, { user: s, attachments }),
      }),
      listar_excecoes: tool({
        description: TOOL_META.listar_excecoes,
        inputSchema: z.object({ status: z.string().optional() }),
        execute: async (input) => runTool("listar_excecoes", input, { user: s, attachments }),
      }),
      resumo_qualidade: tool({
        description: TOOL_META.resumo_qualidade,
        inputSchema: z.object({}),
        execute: async (input) => runTool("resumo_qualidade", input, { user: s, attachments }),
      }),
      historico_romaneios: tool({
        description: TOOL_META.historico_romaneios,
        inputSchema: z.object({
          busca: z.string().optional(),
          limite: z.number().optional(),
        }),
        execute: async (input) => runTool("historico_romaneios", input, { user: s, attachments }),
      }),
      navegar: tool({
        description: TOOL_META.navegar,
        inputSchema: z.object({ caminho: z.string() }),
        execute: async (input) => runTool("navegar", input, { user: s, attachments }),
      }),
      gerar_documentos_pedido: tool({
        description: TOOL_META.gerar_documentos_pedido,
        inputSchema: z.object({pedido:z.string().min(1).max(80),tipo:z.enum(["romaneio","etiquetas","ambos"]).default("ambos")}),
        execute: async (input) => runTool("gerar_documentos_pedido",input,{user:s,attachments}),
      }),
      planejamento_capacidade: tool({
        description: TOOL_META.planejamento_capacidade,
        inputSchema: z.object({}),
        execute: async (input) => runTool("planejamento_capacidade",input,{user:s,attachments}),
      }),
      gerar_romaneio: tool({
        description: TOOL_META.gerar_romaneio,
        inputSchema: z.object({
          texto: z.string(),
          max_volumes_por_carga: z.number().optional(),
        }),
        execute: async (input) => runTool("gerar_romaneio", input, { user: s, attachments }),
      }),
      gerar_planilha_programacao: tool({
        description: TOOL_META.gerar_planilha_programacao,
        inputSchema: z.object({}),
        execute: async (input) =>
          runTool("gerar_planilha_programacao", input, { user: s, attachments }),
      }),
      gerar_planilha_usinagem: tool({
        description: TOOL_META.gerar_planilha_usinagem,
        inputSchema: z.object({
          processo: z.enum([
            "TODAS",
            "USINAGEM-PORTAS",
            "USINAGEM-TRAVESSAS",
            "USINAGEM-CONTRATESTA",
            "USINAGEM-DOBRADICAS",
            "USINAGEM-TUPIA",
          ]).optional(),
          pedido: z.string().optional(),
        }),
        execute: async (input) =>
          runTool("gerar_planilha_usinagem", input, { user: s, attachments }),
      }),
      propor_prioridade: tool({
        description: TOOL_META.propor_prioridade,
        inputSchema: z.object({
          pedido: z.string(),
          prioridade: z.enum(["NORMAL", "ALTA", "URGENTE"]),
        }),
        execute: async (input) => runTool("propor_prioridade", input, { user: s, attachments }),
      }),
    };

    const result = await generateText({
      model: MODEL,
      system,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 2200,
      abortSignal: AbortSignal.timeout(48_000),
    });

    const text = result.text.trim();
    if (!text) {
      console.error("[SOBRAL_IA_EMPTY]", { steps: result.steps.length, finishReason: result.finishReason });
      return NextResponse.json({ error: "O modelo não retornou texto. Tente novamente; se persistir, verifique o AI Gateway nos logs da Vercel." }, { status: 502 });
    }

    try {
      await sql()`insert into pcp_ia_log(usuario, pergunta, resposta, anexos)
        values (
          ${s.usuario},
          ${String(incoming[incoming.length - 1]?.content || "").slice(0, 2000)},
          ${text.slice(0, 4000)},
          ${attachments.map((a) => a.type)}
        )`;
    } catch {
      // log é opcional
    }

    return NextResponse.json({
      reply: text,
      attachments,
      model: MODEL,
      provider: "vercel-ai-gateway",
    });
  } catch (e: any) {
    const notConfigured = e?.message === "IA_NAO_CONFIGURADA";
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    const raw = String(e?.message || "");
    const authFailed = /unauthorized|authentication|invalid.api.key|401|403|oidc/i.test(raw);
    console.error("[SOBRAL_IA_CHAT_ERROR]", {
      type: e?.name || "Error",
      status: e?.statusCode || e?.status || null,
      message: raw.slice(0, 500),
    });
    const msg = notConfigured
      ? "AI Gateway sem credenciais configuradas. Confira OIDC ou AI_GATEWAY_API_KEY na Vercel."
      : timedOut
      ? "A consulta ultrapassou 48 segundos. Tente uma pergunta mais curta ou verifique a latência do Gateway."
      : authFailed
      ? "Autenticação do AI Gateway recusada. Confira as credenciais e a conexão OIDC da Vercel."
      : "Falha ao consultar a Sobral IA. Consulte o log SOBRAL_IA_CHAT_ERROR na Vercel.";
    return NextResponse.json({ error: msg }, { status: notConfigured ? 503 : timedOut ? 504 : 502 });
  }
}
