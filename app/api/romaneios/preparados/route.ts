import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensurePreparedRomaneiosTable, prepareAllRomaneios } from "@/lib/romaneio/prepared";

export const runtime = "nodejs";

async function unidadeGET() {
  try {
    await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER"]);
    const db = sql();
    await ensurePreparedRomaneiosTable(db);

    const [pg] = await db`
      select id,filtro,data_programacao,turno
      from pcp_programacoes
      where status='ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!pg) {
      return NextResponse.json({ programacao: null, itens: [] }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    let itens = await db`
      select
        pedido,cliente,tipo_pedido,montagem,status,
        has_machining,origem_usinagem,warnings,resultado,atualizado_em
      from pcp_romaneios_preparados
      where programacao_id=${pg.id}
      order by pedido
    `;

    if (!itens.length) {
      await prepareAllRomaneios(String(pg.id), String(pg.filtro || ""), db);
      itens = await db`
        select
          pedido,cliente,tipo_pedido,montagem,status,
          has_machining,origem_usinagem,warnings,resultado,atualizado_em
        from pcp_romaneios_preparados
        where programacao_id=${pg.id}
        order by pedido
      `;
    }

    return NextResponse.json({
      programacao: pg,
      itens: itens.map((x: any) => ({
        pedido: x.pedido,
        cliente: x.cliente,
        tipoPedido: x.tipo_pedido,
        montagem: x.montagem,
        status: x.status,
        hasMachining: x.has_machining,
        origemUsinagem: x.origem_usinagem,
        warnings: Array.isArray(x.warnings) ? x.warnings : [],
        resultado: x.resultado,
        atualizadoEm: x.atualizado_em,
      })),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json({
      error: status === 403 ? "Sem permissão." : e?.message || "Falha ao carregar romaneios preparados.",
    }, { status });
  }
}

export const GET = unidadeHandler(unidadeGET);
