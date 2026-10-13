import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { RomaneioIASchema, validarRomaneio } from "@/lib/ia/romaneio";
import { romaneioPdf, romaneioXlsx } from "@/lib/ia/romaneio-export";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);
    const body = await req.json();
    const r = RomaneioIASchema.parse(body.romaneio);
    const erros = validarRomaneio(r).filter((a) => a.nivel === "erro");
    if (erros.length) return NextResponse.json({ error: "Corrija antes de emitir: " + erros.map((e) => e.mensagem).join(" | ") }, { status: 400 });

    const formato = body.formato === "pdf" ? "pdf" : "xlsx";
    const buf = formato === "pdf" ? await romaneioPdf(r) : await romaneioXlsx(r);

    try {
      await sql()`insert into pcp_romaneios_hist(pedido,cliente,transportadora,rota,total_itens,dados,criado_por) values (${r.pedido},${r.cliente},${r.transportadora},${r.rota},${r.itens.length},${JSON.stringify(r)}::jsonb,${s.usuario})`;
    } catch { /* histórico é opcional */ }

    const nome = `Romaneio_${(r.pedido || "novo").replace(/[^\w-]+/g, "_")}.${formato}`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (e: any) {
    const st = e?.message === "SEM_PERMISSAO" ? 403 : 400;
    return NextResponse.json({ error: st === 403 ? "Sem permissão." : e?.message || "Falha ao exportar." }, { status: st });
  }
}
