import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { promoverAgendadas } from "@/lib/programacao-agendada";

async function unidadeGET() {
  try {
    await requireRoles(["PCP", "GERENTE"]);
    const db = sql();
    await promoverAgendadas(db);
    const rows = await db`
      select id, filtro, to_char(data_programacao,'YYYY-MM-DD') data, turno, import_pedidos pedidos, import_pecas pecas, import_ofs ofs, criado_em
        from pcp_programacoes where status = 'AGENDADA' order by data_programacao, criado_em`;
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao listar agendadas." }, { status: /permiss|autoriz/i.test(String(e?.message)) ? 403 : 500 });
  }
}

/** Cancela uma programação agendada (não afeta a ativa). */
async function unidadeDELETE(req: Request) {
  try {
    await requireRoles(["PCP"]);
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    const db = sql();
    const r = await db`update pcp_programacoes set status = 'CANCELADA', encerrado_em = now() where id = ${id}::uuid and status = 'AGENDADA' returning id`;
    if (!r.length) return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao cancelar." }, { status: 500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
export const DELETE = unidadeHandler(unidadeDELETE);
