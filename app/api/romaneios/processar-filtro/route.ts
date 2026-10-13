import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  buildProcessingFromFilterProducts,
} from "@/lib/romaneio/parser";
import { sanitizeConfig } from "@/lib/romaneio/settings";
import type {
  LogisticsConfig,
  MountType,
  OrderOptions,
} from "@/lib/romaneio/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedMounts = new Set<MountType>([
  "MONTADO_HS",
  "MONTADO_TIMADEL",
  "REVENDA",
  "MONTADO_ESTANCIA",
]);

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);

    const fd = await req.formData();
    const pedido = String(fd.get("pedido") || "").trim();
    const mach = fd.get("usinagem");

    if (!pedido) {
      return NextResponse.json(
        { error: "Selecione um pedido da programação." },
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
          motorista: typeof candidate.motorista === "string" ? candidate.motorista.trim() : "",
          transportadora: typeof candidate.transportadora === "string" ? candidate.transportadora.trim() : "",
          placa: typeof candidate.placa === "string" ? candidate.placa.trim() : "",
          notaFiscal: typeof candidate.notaFiscal === "string" ? candidate.notaFiscal.trim() : "",
          filtro: typeof candidate.filtro === "string" ? candidate.filtro.trim() : "",
          pagina: typeof candidate.pagina === "string" ? candidate.pagina.trim() : "",
          conferente: typeof candidate.conferente === "string" ? candidate.conferente.trim() : "",
          separador: typeof candidate.separador === "string" ? candidate.separador.trim() : "",
          romaneioExtraText: typeof candidate.romaneioExtraText === "string" ? candidate.romaneioExtraText.trim() : "",
          etiquetaExtraText: typeof candidate.etiquetaExtraText === "string" ? candidate.etiquetaExtraText.trim() : "",
          complementoObra: Boolean(candidate.complementoObra),
        };
      } catch {
        return NextResponse.json(
          { error: "Os dados complementares são inválidos." },
          { status: 400 }
        );
      }
    }

    const db = sql();

    const ativa = await db`
      select id, filtro
      from pcp_programacoes
      where status = 'ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!ativa.length) {
      return NextResponse.json(
        { error: "Não existe programação ativa do Filtro 51." },
        { status: 404 }
      );
    }

    const programacaoId = String(ativa[0].id);

    await db`
      alter table pcp_produtos
      add column if not exists usinagem_planilha boolean not null default false
    `;

    const rows = await db`
      select
        pedido,
        item,
        produto,
        descricao,
        tipo,
        canal,
        codigo_modelo,
        quantidade,
        medida,
        acabamento,
        cor,
        rebaixo,
        material,
        descricao_modelo,
        outras_caracteristicas,
        pedido_cliente,
        tipo_pedido,
        montagem_engenharia
      from pcp_produtos
      where programacao_id = ${programacaoId}
        and pedido = ${pedido}
      order by item
    `;

    if (!rows.length) {
      return NextResponse.json(
        { error: "Pedido não encontrado na programação ativa." },
        { status: 404 }
      );
    }

    const first: any = rows[0];
    const machBuf =
      mach instanceof File
        ? Buffer.from(await mach.arrayBuffer())
        : undefined;

    if (!orderOptions.filtro) {
      orderOptions.filtro = String(ativa[0].filtro || "");
    }

    const result = buildProcessingFromFilterProducts(
      {
        orderNumber: pedido,
        client: String(first.pedido_cliente || ""),
        destination: "",
        products: rows.map((row: any) => ({
          item: row.item,
          produto: row.produto,
          descricao: row.descricao,
          categoria: row.categoria,
          tipo: row.tipo,
          canal: row.canal,
          codigoModelo: row.codigo_modelo,
          quantidade: Number(row.quantidade || 0),
          medida: row.medida,
          acabamento: row.acabamento,
          cor: row.cor,
          rebaixo: row.rebaixo,
          material: row.material,
          descricaoModelo: row.descricao_modelo,
          outrasCaracteristicas: row.outras_caracteristicas,
        })),
      },
      machBuf,
      {
        mountType,
        config,
        orderOptions,
      }
    );

    if (mach instanceof File) {
      await db`
        update pcp_produtos
        set usinagem_planilha = true
        where programacao_id = ${programacaoId}
          and pedido = ${pedido}
      `;
    }

    result.orderOptions = orderOptions;
    result.complementoObra = Boolean(orderOptions.complementoObra);
    result.sourceMode = "FILTRO_51";
    result.sourceFileName = `Filtro 51 • Pedido ${pedido}`;

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message || "Falha ao montar romaneio pelo Filtro 51.",
      },
      { status }
    );
  }
}
