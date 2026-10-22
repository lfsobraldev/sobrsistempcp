import { NextResponse } from "next/server";
import { unidadeHandler } from "@/lib/unidades/handler";
import { requireRoles } from "@/lib/auth";
import { q, clean, need, H, erro } from "@/lib/api-util";

export const runtime = "nodejs";
const TODOS = ["PCP", "GERENTE", "ENCARREGADO", "LIDER", "APONTADOR", "QUALIDADE", "COMERCIAL", "LOGISTICA", "LIDER_ENTREGAS", "SAC"] as const;
const ADMIN = ["PCP", "GERENTE"] as const;
const ENTIDADES = ["PEDIDO_VENDA", "CLIENTE", "PRODUTO", "FORNECEDOR", "ORDEM_FABRICACAO", "NAO_CONFORMIDADE"];
const TIPOS = ["TEXTO", "NUMERO", "DATA", "BOOLEANO", "LISTA"];

async function unidadeGET(req: Request) {
  try {
    const s = await requireRoles([...TODOS] as never);
    const cargo = String((s as { cargo?: string }).cargo || s.perfil);
    const url = new URL(req.url);
    const visao = url.searchParams.get("visao") || "painel";
    if (visao === "painel") {
      const [p] = await q("select erp_painel_funcao($1) p", [cargo]);
      return NextResponse.json({ cartoes: p.p, cargo }, { headers: H });
    }
    if (visao === "notificacoes") {
      const itens = await q("select * from erp_notificacoes_do_usuario($1,$2,100)", [s.usuario, cargo]);
      return NextResponse.json({ itens, naoLidas: itens.filter((i) => !i.lida).length }, { headers: H });
    }
    if (visao === "contador") {
      const [r] = await q("select count(*) filter (where not lida)::int n from erp_notificacoes_do_usuario($1,$2,100)", [s.usuario, cargo]);
      return NextResponse.json({ naoLidas: r.n }, { headers: H });
    }
    if (visao === "campos") {
      await requireRoles([...ADMIN]);
      const defs = await q("select id,entidade,chave,rotulo,tipo,opcoes,obrigatorio,ativo from erp_campos_def order by entidade,chave");
      return NextResponse.json({ defs, entidades: ENTIDADES, tipos: TIPOS }, { headers: H });
    }
    if (visao === "valores") {
      const ent = clean(url.searchParams.get("entidade"), 24), reg = clean(url.searchParams.get("registro"), 80);
      const defs = await q("select chave,rotulo,tipo,opcoes,obrigatorio from erp_campos_def where entidade=$1 and ativo order by rotulo", [ent]);
      const valores = await q("select chave,valor from erp_campos_valores where entidade=$1 and registro_id=$2", [ent, reg]);
      return NextResponse.json({ defs, valores }, { headers: H });
    }
    if (visao === "eventos") {
      await requireRoles([...ADMIN]);
      const ev = await q("select id::int,tipo,entregas,criado_em,payload from erp_eventos order by id desc limit 100");
      return NextResponse.json({ eventos: ev }, { headers: H });
    }
    return NextResponse.json({ error: "Visão inválida." }, { status: 400 });
  } catch (e) { return erro(e, "Falha ao consultar a plataforma."); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const acao = clean(b.acao, 30).toUpperCase();
    const s = await requireRoles([...(["LER", "LER_TODAS", "CAMPO_VALOR"].includes(acao) ? TODOS : ADMIN)] as never);
    if (acao === "LER") {
      await q("select erp_notificacao_ler($1::uuid,$2)", [need(b.id, "Notificação inválida."), s.usuario]);
    } else if (acao === "LER_TODAS") {
      const cargo = String((s as { cargo?: string }).cargo || s.perfil);
      await q("select erp_notificacao_ler(id,$1) from erp_notificacoes_do_usuario($1,$2,200) where not lida", [s.usuario, cargo]);
    } else if (acao === "CAMPO_DEF") {
      const ent = clean(b.entidade, 24), tipo = clean(b.tipo, 8);
      if (!ENTIDADES.includes(ent) || !TIPOS.includes(tipo)) throw new Error("Entidade ou tipo inválido.");
      const opcoes = tipo === "LISTA" ? clean(b.opcoes, 500).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30) : [];
      await q("insert into erp_campos_def(entidade,chave,rotulo,tipo,opcoes,obrigatorio,criado_por) values($1,$2,$3,$4,$5::jsonb,$6,$7)", [ent, clean(b.chave, 40), clean(b.rotulo, 80), tipo, JSON.stringify(opcoes), b.obrigatorio === true, s.usuario]);
    } else if (acao === "CAMPO_ATIVO") {
      await q("update erp_campos_def set ativo=$2 where id=$1::uuid", [need(b.id, "Campo inválido."), b.ativo === true]);
    } else if (acao === "CAMPO_VALOR") {
      let v: unknown = b.valor;
      if (typeof v === "string" && b.tipo === "NUMERO" && v !== "") v = Number(v.replace(",", "."));
      if (b.tipo === "BOOLEANO") v = v === true || v === "true";
      await q("select erp_campo_gravar($1,$2,$3,$4::jsonb,$5)", [clean(b.entidade, 24), clean(b.registro, 80), clean(b.chave, 40), JSON.stringify(v ?? null), s.usuario]);
    } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: H });
  } catch (e) { return erro(e, "Falha ao gravar."); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
