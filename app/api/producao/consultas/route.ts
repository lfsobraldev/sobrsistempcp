import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const num = (v: string | null) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : NaN; };
type Row = Record<string, unknown>;

async function unidadeGET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const tipo = q.get("tipo") ?? "";
    const id = q.get("id") ?? "";
    const comercial = tipo === "necessidade-pedido";
    await requireRoles(comercial ? ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL"] : ["PCP", "GERENTE", "ENCARREGADO"]);
    const db = sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> };
    let rows: Row[];
    if (tipo === "busca-produto") {
      const termo = (q.get("q") ?? "").trim().slice(0, 60);
      rows = await db.query(`select id,codigo,descricao,classificacao from est_produtos where ativo and ($1='' or codigo ilike '%'||$1||'%' or descricao ilike '%'||$1||'%') order by codigo limit 30`, [termo]);
    } else if (tipo === "busca-lote") {
      const termo = (q.get("q") ?? "").trim().slice(0, 60);
      rows = await db.query(`select l.id,l.codigo,l.serie,p.codigo produto from est_lotes l join est_produtos p on p.id=l.produto_id where ($1='' or l.codigo ilike '%'||$1||'%') order by l.criado_em desc limit 30`, [termo]);
    } else if (tipo === "busca-of") {
      const termo = (q.get("q") ?? "").trim().slice(0, 60);
      rows = await db.query(`select o.id,o.numero,o.status,o.pedido,p.codigo produto from erp_ordens_fabricacao o join est_produtos p on p.id=o.produto_estoque_id where ($1='' or o.numero::text=$1 or o.pedido ilike '%'||$1||'%') order by o.numero desc limit 30`, [termo]);
    } else if (!isUuid(id)) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    } else if (tipo === "necessidade-pedido") {
      rows = await db.query("select * from erp_necessidade_pedido($1::uuid)", [id]);
    } else if (tipo === "onde-usado") {
      rows = await db.query("select * from erp_onde_usado($1::uuid)", [id]);
    } else if (tipo === "disponibilidade") {
      const qtd = num(q.get("qtd")), local = q.get("local") ?? "";
      if (!Number.isFinite(qtd) || !isUuid(local)) return NextResponse.json({ error: "Informe quantidade e depósito." }, { status: 400 });
      rows = await db.query("select * from erp_disponibilidade_estrutura($1::uuid,$2::numeric,$3::uuid)", [id, qtd, local]);
    } else if (tipo === "rastreio-of") {
      rows = await db.query("select * from erp_rastreio_of($1::uuid)", [id]);
    } else if (tipo === "rastreio-lote") {
      rows = await db.query("select * from erp_rastreio_lote($1::uuid)", [id]);
    } else {
      return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
    }
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const forbidden = m === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : /does not exist|aguardando migração/.test(m) ? "Módulo aguardando migração" : m || "Falha na consulta." }, { status: forbidden ? 403 : /does not exist|aguardando/.test(m) ? 503 : 400 });
  }
}
export const GET = unidadeHandler(unidadeGET);
