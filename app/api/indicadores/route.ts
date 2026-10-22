import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const ROLES = ["PCP", "GERENTE", "ENCARREGADO", "LIDER", "QUALIDADE"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dia = (v: string | null, pad: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : pad);
const erro = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fallback }, { status: proibido ? 403 : /Período/.test(m) ? 400 : 500 });
};

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...ROLES]);
    const u = new URL(req.url);
    const fim = dia(u.searchParams.get("fim"), hoje());
    const ini = dia(u.searchParams.get("ini"), `${fim.slice(0, 8)}01`);
    const [[painel], alertas] = await Promise.all([
      q("select ind_painel($1::date,$2::date) p", [ini, fim]),
      q("select id,tipo,severidade,mensagem,link,criado_em from sys_alertas where resolvido_em is null order by case severidade when 'ALTA' then 0 when 'MEDIA' then 1 else 2 end, criado_em desc limit 200"),
    ]);
    return NextResponse.json({ painel: painel.p, alertas, ini, fim }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return erro(e, "Falha ao consultar os indicadores."); }
}
/** Recalcula os alertas proativos (pode ser chamado também por tarefa agendada). */
async function unidadePOST() {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const [r] = await q("select sys_gerar_alertas($1::date) novos", [hoje()]);
    return NextResponse.json({ novos: Number(r.novos) });
  } catch (e) { return erro(e, "Falha ao gerar os alertas."); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
