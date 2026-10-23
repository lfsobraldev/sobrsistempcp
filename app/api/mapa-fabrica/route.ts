import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { distribuirSetores, type EtapaLinha } from "@/lib/fluxo-setores";

export const runtime = "nodejs";
const H = { "Cache-Control": "no-store" };
// Fluxo físico da produção, na ordem em que o pedido passa pelos setores.
const FLUXO = ["PREPARACAO", "COLAGEM_PORTAS", "ESQUADRIAS_BORDAS", "RECOBRIDORA_PERFIL", "USINAGEM", "USINAGEM_2", "CNC", "LUSTRACAO", "PLASTIFICADORA", "PLASTIFICADORA_PORTAS", "EMBALAGEM", "EXPEDICAO"] as const;

async function unidadeGET(req: Request) {
  try {
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER_ENTREGAS", "LOGISTICA", "QUALIDADE", "COMERCIAL"]);
    const db = sql();
    const pedido = (new URL(req.url).searchParams.get("pedido") || "").trim().slice(0, 80);
    const fluxo = [...FLUXO];
    if (new URL(req.url).searchParams.get("visao") === "bi") {
      const dias = Math.min(180, Math.max(7, Number(new URL(req.url).searchParams.get("dias")) || 30));
      const base = await db`select distinct on (e.pedido,e.etapa) e.pedido,e.etapa,e.data_inicio::text data_inicio,e.data_conclusao::text data_conclusao,
          (coalesce(e.data_conclusao,current_date) - e.data_inicio)::int dias, c.cliente, c.previsao_saida::text previsao_saida
        from pcp_controle_entregas_etapas e left join pcp_controle_entregas c on c.pedido=e.pedido
        where e.area='PRODUCAO' and ((e.data_inicio is not null and e.data_conclusao is null) or e.data_conclusao>=current_date-${dias}::int)
        order by e.pedido,e.etapa,e.atualizado_em desc limit 6000`;
      const serie = await db`select d::date::text dia, coalesce(x.n,0)::int n from generate_series(current_date-${dias}::int,current_date,interval '1 day') d
        left join (select data_conclusao dc,count(*) n from (select distinct on (pedido,etapa) pedido,etapa,data_conclusao from pcp_controle_entregas_etapas where area='PRODUCAO' order by pedido,etapa,atualizado_em desc) z where data_conclusao is not null group by 1) x on x.dc=d::date order by d`;
      return NextResponse.json({ fluxo, dias, linhas: base, serie }, { headers: H });
    }
    if (pedido) {
      const etapas = await db`select distinct on (e.etapa) e.etapa,e.area,e.data_inicio::text data_inicio,e.data_conclusao::text data_conclusao,e.usuario,e.atualizado_em
        from pcp_controle_entregas_etapas e where e.pedido=${pedido} and e.area='PRODUCAO' order by e.etapa,e.atualizado_em desc`;
      const [cab] = await db`select pedido,cliente,previsao_saida::text previsao_saida,status from pcp_controle_entregas where pedido=${pedido}`;
      return NextResponse.json({ fluxo, pedido: cab ?? { pedido }, etapas }, { headers: H });
    }
    // Todas as etapas dos pedidos com movimento recente: andamento (iniciou e não concluiu) e FILA
    // (a etapa anterior da rota do pedido foi concluída e a próxima ainda não começou).
    const rows = await db`select distinct on (e.pedido,e.etapa) e.pedido,e.etapa,e.data_inicio::text data_inicio,e.data_conclusao::text data_conclusao,
        (current_date - e.data_inicio)::int dias, c.cliente, c.previsao_saida::text previsao_saida
      from pcp_controle_entregas_etapas e left join pcp_controle_entregas c on c.pedido=e.pedido
      where e.area='PRODUCAO' and e.pedido in (
        select pedido from pcp_controle_entregas_etapas
         where area='PRODUCAO' and ((data_inicio is not null and data_conclusao is null) or data_conclusao>=current_date-7))
      order by e.pedido,e.etapa,e.atualizado_em desc limit 8000`;
    const porSetor = distribuirSetores(rows as unknown as EtapaLinha[], fluxo);
    return NextResponse.json({ fluxo, setores: porSetor, geradoEm: new Date().toISOString() }, { headers: H });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: m === "SEM_PERMISSAO" ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || "Falha no mapa." }, { status: m === "SEM_PERMISSAO" ? 403 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
