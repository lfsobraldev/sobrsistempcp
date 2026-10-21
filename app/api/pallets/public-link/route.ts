import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { criarTokenRastreioPallet } from "@/lib/pallet-tracking";

export const runtime = "nodejs";
const ROLES = ["PCP", "GERENTE", "ENCARREGADO", "LIDER", "QUALIDADE"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    await requireRoles([...ROLES]);
    const body = await req.json();
    const id = String(body.id ?? "").trim().toLowerCase();
    if (!UUID.test(id)) return NextResponse.json({ error: "Pallet inválido." }, { status: 400 });

    const [pallet] = await sql()`select id,status from pcp_pallets where id=${id}`;
    if (!pallet) return NextResponse.json({ error: "Pallet não encontrado." }, { status: 404 });
    if (pallet.status !== "LIBERADO") {
      return NextResponse.json({ error: "O rastreio público só é disponibilizado após a liberação do pallet." }, { status: 409 });
    }

    const token = criarTokenRastreioPallet(id, process.env.AUTH_SECRET || "");
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : "Não foi possível gerar o link de rastreio." }, { status: forbidden ? 403 : 500 });
  }
}