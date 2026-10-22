import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const dia = (v: string | null, pad: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : pad);
async function unidadeGET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "SAC", "QUALIDADE"]);
    const u = new URL(req.url);
    const fim = dia(u.searchParams.get("fim"), new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));
    const ini = dia(u.searchParams.get("ini"), `${fim.slice(0, 8)}01`);
    const r = (await (sql() as unknown as { query: (t: string, p: unknown[]) => Promise<Record<string, any>[]> }).query("select sac_indice_reclamacao($1::date,$2::date) r", [ini, fim]))[0];
    return NextResponse.json({ indice: r.r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: m === "SEM_PERMISSAO" ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : /Período/.test(m) ? m : "Falha ao calcular o índice." }, { status: m === "SEM_PERMISSAO" ? 403 : 400 }); }
}
export const GET = unidadeHandler(unidadeGET);
