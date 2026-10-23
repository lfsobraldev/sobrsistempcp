import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const H = { "Cache-Control": "no-store" };
const GESTAO = ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE"] as const;
const erro = (e: any) => {
  const sem = e?.message === "SEM_PERMISSAO";
  return NextResponse.json({ error: sem ? "Sem permissão." : String(e?.message || e).replace(/^error: /i, "") }, { status: sem ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...GESTAO]);
    const db = sql();
    const u = new URL(req.url);
    const pedido = (u.searchParams.get("pedido") || "").trim();
    const itens = await db`select * from pcp_v_perdas_pecas where (${pedido}='' or pedido=${pedido}) order by (status in('FECHADA','CANCELADA')), criado_em desc limit 500`;
    const motivos = await db`select codigo,nome,categoria from pcp_perda_motivos where ativo order by nome`;
    const porMotivo = await db`select motivo_nome nome,count(*)::int n,sum(quantidade)::numeric qtd from pcp_v_perdas_pecas where criado_em>=now()-interval '90 days' group by 1 order by 2 desc`;
    const porSetor = await db`select coalesce(nullif(setor,''),'—') nome,count(*)::int n from pcp_v_perdas_pecas where criado_em>=now()-interval '90 days' group by 1 order by 2 desc`;
    const eventos = u.searchParams.get("numero") ? await db`select e.evento,e.detalhe,e.por,e.em from pcp_perdas_pecas_eventos e join pcp_perdas_pecas p on p.id=e.perda_id where p.numero=${Number(u.searchParams.get("numero"))} order by e.em,e.id` : [];
    return NextResponse.json({ itens, motivos, porMotivo, porSetor, eventos }, { headers: H });
  } catch (e) { return erro(e); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = String(b.acao || "ABRIR").toUpperCase();
    const s = await requireRoles(acao === "ABRIR" ? ["PCP", "GERENTE", "ENCARREGADO", "QUALIDADE", "LIDER", "APONTADOR"] : [...GESTAO]);
    const db = sql();
    if (acao === "ABRIR") {
      const [r] = await db`select pcp_perda_abrir(${String(b.pedido || "")},${String(b.peca || "")},${String(b.of || "")},${String(b.setor || "")},${Number(b.quantidade) || 1},${String(b.motivo || "")},${String(b.classe || "")},${String(b.obs || "")},${s.usuario}) numero`;
      return NextResponse.json({ ok: true, numero: r.numero }, { status: 201, headers: H });
    }
    const numero = Number(b.numero);
    if (!numero) return NextResponse.json({ error: "Informe a perda." }, { status: 400 });
    if (acao === "DECIDIR") await db`select pcp_perda_decidir(${numero},${String(b.decisao || "")},${String(b.responsavel || "")},${b.prazo || null}::date,${String(b.obs || "")},${s.usuario})`;
    else if (acao === "FECHAR") await db`select pcp_perda_fechar(${numero},${String(b.obs || "")},${s.usuario})`;
    else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: H });
  } catch (e) { return erro(e); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
