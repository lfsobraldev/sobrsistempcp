import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
type Row = Record<string, any>;
const q = (t: string, p: unknown[] = []) => (sql() as unknown as { query: (t: string, p?: unknown[]) => Promise<Row[]> }).query(t, p);
const clean = (v: unknown, max = 240) => String(v ?? "").trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const need = (v: string, msg: string) => { if (!isUuid(v)) throw new Error(msg); return v; };
const erro = (e: unknown) => {
  const m = e instanceof Error ? e.message : "";
  const proibido = m === "SEM_PERMISSAO";
  return NextResponse.json({ error: proibido ? "Sem permissão." : /does not exist/.test(m) ? "Módulo aguardando migração" : /duplicate key/.test(m) ? "Substituto já cadastrado para este componente." : /check constraint/.test(m) ? "Componente e substituto devem ser diferentes e o fator maior que zero." : m || "Falha." }, { status: proibido ? 403 : 400 });
};

async function unidadeGET(req: Request) {
  try {
    const comps = new URL(req.url).searchParams.get("componentes");
    if (comps != null) {
      // consulta do chão de fábrica: só substitutos ativos dos componentes da operação
      await requireRoles(["PCP", "GERENTE", "ENCARREGADO", "LIDER", "APONTADOR"]);
      const ids = comps.split(",").filter(isUuid).slice(0, 50);
      if (!ids.length) return NextResponse.json({ substitutos: [] }, { headers: { "Cache-Control": "no-store" } });
      const rows = await q("select s.componente_id,s.substituto_id,p.codigo,p.descricao,s.fator::float from erp_substitutos s join est_produtos p on p.id=s.substituto_id and p.ativo where s.ativo and s.componente_id=any($1::uuid[]) order by s.prioridade,p.codigo", [ids]);
      return NextResponse.json({ substitutos: rows }, { headers: { "Cache-Control": "no-store" } });
    }
    await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const rows = await q("select s.id,s.componente_id,c.codigo componente,c.descricao componente_desc,s.substituto_id,p.codigo substituto,p.descricao substituto_desc,s.fator::float,s.prioridade,s.motivo,s.ativo,s.criado_por,s.criado_em from erp_substitutos s join est_produtos c on c.id=s.componente_id join est_produtos p on p.id=s.substituto_id order by c.codigo,s.prioridade,p.codigo limit 500");
    const usos = await q("select o.numero,c.codigo componente,p.codigo substituto,x.quantidade_original::float,x.quantidade_substituto::float,x.criado_por,x.criado_em from erp_of_substituicoes x join erp_ordens_fabricacao o on o.id=x.of_id join est_produtos c on c.id=x.componente_id join est_produtos p on p.id=x.substituto_id order by x.criado_em desc limit 50");
    return NextResponse.json({ substitutos: rows, usos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return erro(e); }
}
async function unidadePOST(req: Request) {
  try {
    const user = await requireRoles(["PCP", "GERENTE"]);
    const b = await req.json();
    const acao = clean(b.acao, 20).toUpperCase();
    if (acao === "SALVAR") {
      const fator = Number(String(b.fator ?? "").replace(",", "."));
      if (!Number.isFinite(fator) || fator <= 0 || fator > 1e6) throw new Error("Fator inválido.");
      const prioridade = Math.min(99, Math.max(1, Math.trunc(Number(b.prioridade) || 1)));
      const comp = need(clean(b.componenteId, 40), "Selecione o componente."), sub = need(clean(b.substitutoId, 40), "Selecione o substituto.");
      if (comp === sub) throw new Error("Componente e substituto devem ser diferentes.");
      await q("insert into erp_substitutos(componente_id,substituto_id,fator,prioridade,motivo,criado_por) values($1::uuid,$2::uuid,$3::numeric,$4,$5,$6) on conflict(componente_id,substituto_id) do update set fator=excluded.fator,prioridade=excluded.prioridade,motivo=excluded.motivo,ativo=true", [comp, sub, fator, prioridade, clean(b.motivo, 300), user.usuario]);
    } else if (acao === "ATIVO") {
      await q("update erp_substitutos set ativo=$2 where id=$1::uuid", [need(clean(b.id, 40), "Substituto inválido."), b.ativo === true]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
