import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensurePreparedRomaneiosTable } from "@/lib/romaneio/prepared";
import { canGenerate } from "@/lib/romaneio/validation";
import { createRomaneioWorkbook } from "@/lib/romaneio/excel";
import { createLabelsWorkbook } from "@/lib/romaneio/labels";
import type { ProcessingResult } from "@/lib/romaneio/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Download autorizado diretamente dos romaneios preparados da programação ativa. */
export async function GET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const u = new URL(req.url);
    const pedido = u.searchParams.get("pedido")?.trim() || "";
    const tipo = u.searchParams.get("tipo");
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(pedido) ||
        (tipo !== "romaneio" && tipo !== "etiquetas"))
      return NextResponse.json({ error: "Pedido ou tipo de arquivo inválido." }, { status: 400 });
    const db = sql();
    await ensurePreparedRomaneiosTable(db);
    const [pg] = await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
    if (!pg) return NextResponse.json({ error: "Nenhuma programação ativa." }, {status:404});
    const [row] = await db`
      select resultado, status, warnings from pcp_romaneios_preparados
      where programacao_id=${pg.id} and pedido=${pedido} limit 1
    `;
    if (!row) return NextResponse.json({error:"Pedido sem romaneio preparado. Abra Romaneios para revisar."},{status:404});
    const data = row.resultado as ProcessingResult;
    if (!data?.packages?.length || !canGenerate(data))
      return NextResponse.json({error:"Romaneio apresenta pendências impeditivas. Revise antes de gerar."},{status:409});
    if (tipo === "etiquetas" && (!data.client?.trim() || !data.destination?.trim()))
      return NextResponse.json({error:"Preencha cliente e destino antes de emitir etiquetas."},{status:409});
    const buffer = tipo === "romaneio"
      ? await createRomaneioWorkbook(data)
      : await createLabelsWorkbook(data);
    const name = tipo === "romaneio" ? "Romaneio" : "Etiquetas";
    return new Response(new Uint8Array(buffer),{
      headers:{
        "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":`attachment; filename="${name}_${pedido}.xlsx"`,
        "Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff",
      }
    });
  } catch(e:unknown) {
    const m=e instanceof Error?e.message:"Falha ao gerar arquivo.";
    return NextResponse.json({error:m==="SEM_PERMISSAO"?"Sem permissão.":m},{status:m==="SEM_PERMISSAO"?403:500});
  }
}
