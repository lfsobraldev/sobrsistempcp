import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { completarFiltro } from "@/lib/ia/completar-filtro";
import type { Produto } from "@/types/pcp";

export const runtime = "nodejs";
export const maxDuration = 60;

async function unidadePOST(req: Request) {
  try {
    await requireRoles(["PCP"]);
    if (process.env.PCP_AI_RELEASE_ENRICHMENT === "disabled") {
      return NextResponse.json({ error: "Complementação desativada neste ambiente." }, { status: 503 });
    }
    const body = await req.json();
    const produtos = body?.produtos;
    if (!Array.isArray(produtos) || !produtos.length || produtos.length > 12) {
      return NextResponse.json({ error: "Envie de 1 a 12 registros por lote." }, { status: 400 });
    }
    if (produtos.some((p: Produto) => !p || typeof p.id !== "string" || !p.id || typeof p.descricao !== "string")) {
      return NextResponse.json({ error: "Produtos inválidos." }, { status: 400 });
    }
    const r = await completarFiltro(produtos as Produto[], true);
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : e?.message === "IA_NAO_CONFIGURADA" ? 503 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha na complementação." }, { status });
  }
}

export const POST = unidadeHandler(unidadePOST);
