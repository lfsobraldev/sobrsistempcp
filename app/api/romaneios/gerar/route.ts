import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { createRomaneioWorkbook } from "@/lib/romaneio/excel";
import { canGenerate } from "@/lib/romaneio/validation";
import type { ProcessingResult } from "@/lib/romaneio/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);

    const data = (await req.json()) as ProcessingResult;

    if (!data?.packages?.length) {
      return NextResponse.json(
        { error: "Nenhum romaneio processado." },
        { status: 400 }
      );
    }

    if (!canGenerate(data)) {
      return NextResponse.json(
        { error: "O romaneio possui pendências que impedem a geração." },
        { status: 400 }
      );
    }

    const buffer = await createRomaneioWorkbook(data);
    const pedido = String(data.orderNumber || "Pedido")
      .replace(/[^A-Za-z0-9_-]+/g, "_");

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="Romaneio_${pedido}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message || "Falha ao gerar romaneio.",
      },
      { status }
    );
  }
}
