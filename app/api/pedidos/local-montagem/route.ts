import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

async function unidadePATCH(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const b = await req.json();
    const pedido = String(b.pedido || "").trim().slice(0, 60);
    const local = String(b.local ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!pedido) return NextResponse.json({ error: "Pedido não informado." }, { status: 400 });
    const db = sql();
    await db`create table if not exists pcp_pedido_local (
      pedido varchar(60) primary key,
      local_montagem varchar(60) not null default '',
      atualizado_por varchar(80),
      atualizado_em timestamptz not null default now()
    )`;
    await db`insert into pcp_pedido_local(pedido, local_montagem, atualizado_por)
      values(${pedido}, ${local}, ${s.usuario})
      on conflict (pedido) do update
      set local_montagem = excluded.local_montagem, atualizado_por = excluded.atualizado_por, atualizado_em = now()`;
    return NextResponse.json({ ok: true, pedido, local });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao salvar local de montagem." }, { status });
  }
}

export const PATCH = unidadeHandler(unidadePATCH);
