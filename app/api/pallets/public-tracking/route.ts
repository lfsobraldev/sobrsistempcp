import {enriquecerClientes} from '@/lib/clientes-operacionais';
import { NextResponse } from "next/server";
import { identitySql } from "@/lib/db";
import { verificarBanco } from "@/lib/unidades/access";
import { verificarTokenRastreioUnidade,verificarTokenRastreioPallet } from "@/lib/pallet-tracking";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" && body.token.length <= 160 ? body.token : "";
    const escopo=verificarTokenRastreioUnidade(token,process.env.AUTH_SECRET||"");
    const id = escopo?.id ?? verificarTokenRastreioPallet(token, process.env.AUTH_SECRET || "");
    if (!id) return NextResponse.json({ error: "Registro indisponível." }, { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

    const db=escopo?await verificarBanco(escopo.unidade):identitySql();
    const [row] = await db`
      select codigo,pedido,cliente,pallet,quantidade::float8 quantidade,status,qualidade_status,msac_status,atualizado_em::text atualizado_em
      from pcp_pallets where id=${id} and status='LIBERADO' limit 1
    `;
    if (!row) return NextResponse.json({ error: "Registro indisponível." }, { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    const [identidade]=await enriquecerClientes(db,[row]);
    return NextResponse.json({ pallet: {...row,cliente:identidade.clienteNome,clienteNome:identidade.clienteNome,clienteCodigo:identidade.clienteCodigo} }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar o registro." }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}