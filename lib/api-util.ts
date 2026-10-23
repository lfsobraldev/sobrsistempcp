import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export type Row = Record<string, any>;
export const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
export const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const need = (v: unknown, msg: string) => { const s = clean(v, 40); if (!isUuid(s)) throw new Error(msg); return s; };
export const opt = (v: unknown, msg: string) => (clean(v, 40) ? need(v, msg) : null);
export const dec = (v: unknown, msg: string, min = 0, max = 1e12) => { const n = Number(String(v ?? "").replace(",", ".")); if (!Number.isFinite(n) || n < min || n > max) throw new Error(msg); return n; };
export const inteiro = (v: unknown, msg: string, min = 1, max = 100000) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < min || n > max) throw new Error(msg); return n; };
export const dia = (v: unknown, msg: string) => { const s = clean(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(msg); return s; };
export const H = { "Cache-Control": "no-store" };
/** Diz qual tabela/função falta, para o administrador saber o que aplicar. */
export const objetoAusente = (m: string) => { const x = /(relation|function|column|table)\s+"?([\w.()$, ]+?)"?\s+does not exist/i.exec(m); return x ? ` (falta ${x[2].slice(0, 80)} neste banco)` : ""; };
export const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  const dup = m.includes("duplicate key");
  return NextResponse.json({ error: proibido ? "Sem permissão." : dup ? "Registro duplicado." : /does not exist/.test(m) ? `Módulo aguardando migração${objetoAusente(m)}` : m || fb }, { status: proibido ? 403 : dup ? 409 : 400 });
};
