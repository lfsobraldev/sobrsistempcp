import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import { requireRoles } from "@/lib/auth";
import { createLayoutPageRenderer } from "@/lib/romaneio/pdf-layout";
import { buildProcessing } from "@/lib/romaneio/parser";
import { sanitizeConfig } from "@/lib/romaneio/settings";
import type {
  LogisticsConfig,
  MountType,
  OrderOptions,
} from "@/lib/romaneio/types";

export const runtime = "nodejs";

const allowedMounts = new Set<MountType>([
  "MONTADO_HS",
  "MONTADO_TIMADEL",
  "REVENDA",
  "MONTADO_ESTANCIA",
]);

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER"]);

    const fd = await req.formData();
    const order = fd.get("pedido");
    const mach = fd.get("usinagem");

    if (!(order instanceof File)) {
      return NextResponse.json(
        { error: "Envie o PDF do pedido." },
        { status: 400 }
      );
    }

    if (!order.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "O pedido precisa estar em PDF." },
        { status: 400 }
      );
    }

    const mountRaw = String(fd.get("mountType") || "MONTADO_HS") as MountType;
    const mountType: MountType = allowedMounts.has(mountRaw)
      ? mountRaw
      : "MONTADO_HS";

    let config: LogisticsConfig | undefined;
    const configRaw = fd.get("config");

    if (typeof configRaw === "string" && configRaw) {
      try {
        config = sanitizeConfig(JSON.parse(configRaw));
      } catch {
        config = sanitizeConfig();
      }
    }

    let orderOptions: OrderOptions = { mountType };
    const optionsRaw = fd.get("orderOptions");

    if (typeof optionsRaw === "string" && optionsRaw) {
      try {
        const candidate = JSON.parse(optionsRaw) as Partial<OrderOptions>;

        orderOptions = {
          mountType,
          motorista:
            typeof candidate.motorista === "string"
              ? candidate.motorista.trim()
              : "",
          transportadora:
            typeof candidate.transportadora === "string"
              ? candidate.transportadora.trim()
              : "",
          placa:
            typeof candidate.placa === "string"
              ? candidate.placa.trim()
              : "",
          notaFiscal:
            typeof candidate.notaFiscal === "string"
              ? candidate.notaFiscal.trim()
              : "",
          filtro:
            typeof candidate.filtro === "string"
              ? candidate.filtro.trim()
              : "",
          pagina:
            typeof candidate.pagina === "string"
              ? candidate.pagina.trim()
              : "",
          conferente:
            typeof candidate.conferente === "string"
              ? candidate.conferente.trim()
              : "",
          separador:
            typeof candidate.separador === "string"
              ? candidate.separador.trim()
              : "",
          romaneioExtraText:
            typeof candidate.romaneioExtraText === "string"
              ? candidate.romaneioExtraText.trim()
              : "",
          etiquetaExtraText:
            typeof candidate.etiquetaExtraText === "string"
              ? candidate.etiquetaExtraText.trim()
              : "",
          complementoObra: Boolean(candidate.complementoObra),
        };
      } catch {
        return NextResponse.json(
          { error: "Os dados complementares são inválidos." },
          { status: 400 }
        );
      }
    }

    const orderBuf = Buffer.from(await order.arrayBuffer());
    const parsed = await pdf(
      orderBuf,
      { pagerender: createLayoutPageRenderer() } as any
    );

    const machBuf =
      mach instanceof File
        ? Buffer.from(await mach.arrayBuffer())
        : undefined;

    const result = buildProcessing(parsed.text, machBuf, {
      mountType,
      config,
      mixedOrder: String(fd.get("mixedOrder") || "") === "true",
      orderOptions,
    });

    result.orderOptions = orderOptions;
    result.complementoObra = Boolean(orderOptions.complementoObra);
    result.sourceMode = "PEDIDO";
    result.sourceFileName = order.name;

    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message ||
              "Não foi possível interpretar o pedido.",
      },
      { status }
    );
  }
}
