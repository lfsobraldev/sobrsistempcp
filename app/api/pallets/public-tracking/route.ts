import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verificarTokenRastreioPallet } from "@/lib/pallet-tracking";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" && body.token.length <= 160 ? body.token : "";
    const id = verificarTokenRastreioPallet(token, process.env.AUTH_SECRET || "");
    if (!id) return NextResponse.json({ error: "Registro indisponível." }, { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

    const [row] = await sql()`
      select codigo,pedido,pallet,quantidade::float8 quantidade,status,qualidade_status,msac_status,atualizado_em::text atualizado_em
      from pcp_pallets where id=${id} and status='LIBERADO' limit 1
    `;
    if (!row) return NextResponse.json({ error: "Registro indisponível." }, { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    return NextResponse.json({ pallet: row }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o registro." }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}