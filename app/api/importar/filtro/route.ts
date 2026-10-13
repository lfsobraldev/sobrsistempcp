import { NextResponse } from "next/server";
import { parseFiltro } from "@/lib/filter-parser";
import { requireRoles } from "@/lib/auth";
import { completarFiltro } from "@/lib/ia/completar-filtro";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP"]);
    const fd = await req.formData();
    const file = fd.get("filtro");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie o arquivo do Consistem (CSV, TXT, XLS ou XLSX)." }, { status: 400 });
    }
    const resultado = await parseFiltro(file);
    // Complementação durante a importação. O motor de regras não demanda chamada externa;
    // a IA não bloqueia o upload de milhares de linhas enquanto não houver fila durável.
    const principal = await completarFiltro(resultado.produtos, false);
    const romaneio = resultado.romaneioProdutos
      ? await completarFiltro(resultado.romaneioProdutos, false)
      : null;
    return NextResponse.json({
      ...resultado,
      produtos: principal.produtos,
      romaneioProdutos: romaneio?.produtos ?? resultado.romaneioProdutos,
      complementoRegras: {
        corrigidos: principal.alteracoes.length,
        pendencias: principal.pendencias.length,
        corrigidosRomaneio: romaneio?.alteracoes.length ?? 0,
      },
      ...(process.env.PCP_AI_RELEASE_ENRICHMENT === "enabled" ? { complementoIA: { modo: "IA_EM_LOTES" } } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Sem permissão." : e?.message || "Falha ao ler filtro." }, { status });
  }
}
