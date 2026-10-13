import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { session } from "@/lib/auth";
import { claude, MODEL, SYSTEM_BASE } from "@/lib/ia/claude";
import { runTool, TOOLS, type Attachment } from "@/lib/ia/tools";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TURNS = 6;
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
    if (limited(s.usuario)) return NextResponse.json({ error: "Muitas mensagens. Aguarde um minuto." }, { status: 429 });

    const body = await req.json();
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const messages: Anthropic.MessageParam[] = incoming
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 20_000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
    }

    const attachments: Attachment[] = [];
    const system = `${SYSTEM_BASE}\nUsuário: ${s.usuario} (perfil ${s.perfil}). Tela atual: ${String(body.path || "-")}. Data: ${new Date().toISOString().slice(0, 10)}.`;
    const ai = claude();
    let text = "";

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await ai.messages.create({ model: MODEL, max_tokens: 2000, system, tools: TOOLS, messages });
      const parts = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
      if (res.stop_reason !== "tool_use") { text = parts.join("\n").trim(); break; }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        const out = await runTool(b.name, b.input, { user: s, attachments });
        results.push({ type: "tool_result", tool_use_id: b.id, content: out.slice(0, 30_000) });
      }
      messages.push({ role: "user", content: results });
      if (turn === MAX_TURNS - 1) text = "Não consegui concluir. Tente reformular o pedido.";
    }

    try {
      await sql()`insert into pcp_ia_log(usuario, pergunta, resposta, anexos) values (${s.usuario}, ${String(incoming[incoming.length - 1]?.content || "").slice(0, 2000)}, ${text.slice(0, 4000)}, ${attachments.map((a) => a.type)})`;
    } catch { /* log é opcional */ }

    return NextResponse.json({ reply: text || "Pronto.", attachments });
  } catch (e: any) {
    const msg = e?.message === "IA_NAO_CONFIGURADA" ? "IA não configurada: defina ANTHROPIC_API_KEY no servidor." : "Falha ao consultar a IA.";
    return NextResponse.json({ error: msg }, { status: e?.message === "IA_NAO_CONFIGURADA" ? 503 : 500 });
  }
}
