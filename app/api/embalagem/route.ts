import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { paletesDoRomaneio } from "@/lib/embalagem";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA", "QUALIDADE"] as const;
const WRITE = ["PCP", "GERENTE", "ENCARREGADO", "LOGISTICA"] as const;
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: unknown, msg: string) => { const s = clean(v, 40); if (!isUuid(s)) throw new Error(msg); return s; };
const int = (v: unknown, msg: string) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 1 || n > 100000) throw new Error(msg); return n; };
const H = { "Cache-Control": "no-store" };
const erro = (e: unknown, fb: string) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : m || fb }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...READ]);
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "planos";
    if (visao === "planos") {
      const [planos, prontos] = await Promise.all([
        q("select * from emb_v_resumo order by numero desc limit 200"),
        q(`select r.pedido,r.cliente,r.montagem,r.status,jsonb_array_length(coalesce(r.resultado->'packages','[]'::jsonb))::int pallets,wms_pedido_em_revisao(r.pedido) em_revisao
           from pcp_romaneios_preparados r
           where not exists(select 1 from emb_planos p where p.pedido=r.pedido and p.status in('RASCUNHO','EM_EMBALAGEM','FECHADO'))
           order by r.atualizado_em desc limit 200`).catch(() => []),
      ]);
      return NextResponse.json({ planos, prontos }, { headers: H });
    }
    if (visao === "plano") {
      const id = need(url.searchParams.get("id"), "Plano inválido.");
      const [cab] = await q("select * from emb_v_resumo where id=$1::uuid", [id]);
      const pallets = await q("select p.numero,p.tipo,p.limite_m3::float,p.volume_m3::float,p.limite_qtd::float,p.regra,p.status,p.fechado_por,p.fechado_em,pl.codigo pallet_codigo from emb_pallets p left join pcp_pallets pl on pl.id=p.pallet_id where p.plano_id=$1::uuid order by p.numero", [id]);
      const itens = await q("select pallet_numero,linha,descricao,medida,quantidade::float,qtd_conferida::float,observacao,conferido_por from emb_itens where plano_id=$1::uuid order by pallet_numero,linha", [id]);
      return NextResponse.json({ plano: cab, pallets, itens }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar a embalagem."); }
}

async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    let resp: Record<string, unknown> = { ok: true };
    if (acao === "PLANO_GERAR") {
      const pedido = clean(b.pedido, 60);
      const [r] = await q("select montagem,resultado from pcp_romaneios_preparados where pedido=$1 order by atualizado_em desc limit 1", [pedido]);
      if (!r) throw new Error("Este pedido não tem romaneio preparado.");
      const pallets = paletesDoRomaneio(r.resultado);
      if (!pallets.length) throw new Error("O romaneio preparado não tem pallets.");
      const [x] = await q("select emb_plano_criar($1,$2,$3::jsonb,$4) id", [pedido, clean(r.montagem, 30), JSON.stringify(pallets), user.usuario]);
      resp = { ok: true, id: x.id };
    } else if (acao === "CONFERIR") {
      const c = Number(String(b.quantidade ?? "").replace(",", "."));
      if (!Number.isFinite(c) || c < 0 || c > 1e9) throw new Error("Quantidade inválida.");
      await q("select emb_conferir($1::uuid,$2,$3,$4::numeric,$5,$6)", [need(b.id, "Plano inválido."), int(b.pallet, "Pallet inválido."), int(b.linha, "Linha inválida."), c, clean(b.observacao, 300), user.usuario]);
    } else if (acao === "FECHAR_PALLET") {
      const [x] = await q("select emb_pallet_fechar($1::uuid,$2,$3) id", [need(b.id, "Plano inválido."), int(b.pallet, "Pallet inválido."), user.usuario]);
      resp = { ok: true, palletId: x.id };
    } else if (acao === "CANCELAR") {
      await q("select emb_plano_cancelar($1::uuid,$2)", [need(b.id, "Plano inválido."), user.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(resp, { headers: H });
  } catch (e) { return erro(e, "Falha ao gravar."); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
