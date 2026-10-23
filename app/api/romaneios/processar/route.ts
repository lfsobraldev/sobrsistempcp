import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import { requireRoles } from "@/lib/auth";
import { createLayoutPageRenderer } from "@/lib/romaneio/pdf-layout";
import { buildProcessing } from "@/lib/romaneio/parser";
import { parseOrderItems } from "@/lib/romaneio/order-parser";
import { auditOrderParse } from "@/lib/romaneio/order-audit";
import { itensComoTexto, recuperarItensFaltantes } from "@/lib/ia/order-recovery";
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
  "MONTADO_SUL",
]);

async function unidadePOST(req: Request) {
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

    // Auditoria do parser: confere sequência de itens e totais do PDF; a IA só completa o que faltou.
    let pdfText = parsed.text as string;
    let audit = auditOrderParse(pdfText, parseOrderItems(pdfText));
    const recoveredByAI: string[] = [];
    if (audit.missingItems.length && audit.missingItems.length <= 40) {
      try {
        const rec = await recuperarItensFaltantes(pdfText, audit.missingItems);
        if (rec.length) {
          pdfText = `${pdfText}\n${itensComoTexto(rec)}\n`;
          recoveredByAI.push(...rec.map((r) => r.item));
          audit = auditOrderParse(pdfText, parseOrderItems(pdfText));
        }
      } catch { /* IA indisponível: segue só com o parser determinístico */ }
    }

    const result = buildProcessing(pdfText, machBuf, {
      mountType,
      config,
      mixedOrder: String(fd.get("mixedOrder") || "") === "true",
      orderOptions,
    });

    result.orderOptions = orderOptions;
    result.complementoObra = Boolean(orderOptions.complementoObra);
    result.sourceMode = "PEDIDO";
    result.sourceFileName = order.name;
    result.orderAudit = { confidence: audit.confidence, expectedItems: audit.expectedItems, foundItems: audit.foundItems, missingItems: audit.missingItems, issues: audit.issues, recoveredByAI };
    if (recoveredByAI.length) result.warnings.push(`Itens ${recoveredByAI.join(", ")} foram recuperados pela IA — confira antes de emitir.`);
    for (const issue of audit.issues) result.warnings.push(`Auditoria do pedido: ${issue}`);

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

export const POST = unidadeHandler(unidadePOST);
