import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirApontamentos } from "@/lib/pcp-schema";
import { PROCESSOS } from "@/lib/processos";

export const runtime = "nodejs";
export async function GET() {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const db = sql(); await garantirApontamentos(db);
    const regras = await db`select processo,max_em_andamento,atualizado_por,atualizado_em from pcp_recursos_regras order by processo`;
    return NextResponse.json({ regras, processos: PROCESSOS }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão." : e?.message }, { status: f ? 403 : 500 }); }
}
export async function POST(req: Request) {
  try {
    const s = await requireRoles(["PCP"]);
    const b = await req.json();
    const processo = String(b.processo || "").trim();
    if (!PROCESSOS.includes(processo)) return NextResponse.json({ error: "Processo inválido." }, { status: 400 });
    const max = b.max === "" || b.max === null || b.max === undefined ? null : Number(b.max);
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 99)) return NextResponse.json({ error: "Informe um limite inteiro de 1 a 99, ou deixe vazio para sem limite." }, { status: 400 });
    const db = sql(); await garantirApontamentos(db);
    await db`insert into pcp_recursos_regras(processo,max_em_andamento,atualizado_por) values(${processo},${max}::int,${s.usuario}) on conflict(processo) do update set max_em_andamento=excluded.max_em_andamento,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
    await db`insert into pcp_eventos(usuario,tipo,descricao,processo,depois) values(${s.usuario},'REGRA_RECURSO',${max === null ? "Limite de operações simultâneas removido" : `Limite de ${max} operação(ões) simultânea(s)`},${processo},${JSON.stringify({ processo, max })}::jsonb)`;
    return NextResponse.json({ ok: true });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha ao salvar." }, { status: f ? 403 : 500 }); }
}
