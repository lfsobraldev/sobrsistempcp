import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { identitySql } from "@/lib/db";
import { multiAtiva, unidadeSchema } from "@/lib/unidades/core";
import { verificarBanco } from "@/lib/unidades/access";
import { entregarWebhooks, type DbQuery } from "@/lib/webhook-entrega";

export const runtime = "nodejs";
export const maxDuration = 60;
const H = { "Cache-Control": "no-store" };
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function autorizado(req: Request) {
  const segredo = process.env.CRON_SECRET || "";
  if (segredo.length < 16) return false; // sem segredo forte configurado a rotina fica desligada
  const a = Buffer.from(req.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rotina agendada (Vercel Cron): gera os alertas proativos e entrega a fila de webhooks de cada unidade. */
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: H });
  const unidades = multiAtiva() ? unidadeSchema.options : [null];
  const resultado: Record<string, unknown>[] = [];
  for (const un of unidades) {
    const nome = un ?? "UNICA";
    try {
      const db = (un ? await verificarBanco(un) : identitySql()) as unknown as DbQuery & ((s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, any>[]>);
      const q: DbQuery = { query: (t, p) => (db as unknown as DbQuery).query(t, p) };
      const [al] = await q.query("select sys_gerar_alertas($1::date) novos", [hoje()]);
      const wh = await entregarWebhooks(q);
      resultado.push({ unidade: nome, alertasNovos: Number(al.novos), webhooks: wh });
    } catch (e) {
      resultado.push({ unidade: nome, erro: /does not exist/.test(e instanceof Error ? e.message : "") ? "Módulo aguardando migração" : "Falha na rotina" });
    }
  }
  return NextResponse.json({ ok: true, em: new Date().toISOString(), unidades: resultado }, { headers: H });
}
