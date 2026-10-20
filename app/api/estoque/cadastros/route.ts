import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirEstoque } from "@/lib/estoque-schema";
import { PERFIS_CADASTRO, PERFIS_VER, normalizarCodigo } from "@/lib/estoque";

export const runtime = "nodejs";
const erro = (e: any) => { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha." }, { status: f ? 403 : 500 }); };
const dup = (e: any, msg: string) => (e?.code === "23505" ? NextResponse.json({ error: msg }, { status: 409 }) : null);

export async function GET(req: Request) {
  try {
    await requireRoles([...PERFIS_VER]);
    const db = sql(); await garantirEstoque(db);
    const url = new URL(req.url);
    const q = "%" + (url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, "") + "%";
    const inativos = url.searchParams.get("inativos") === "1";
    const [produtos, unidades, locais, un] = await Promise.all([
      db.query(`select p.id,p.codigo,p.descricao,p.unidade_base,p.estoque_minimo::float estoque_minimo,p.ativo,p.origem from est_produtos p where ($1='%%' or p.codigo ilike $1 or p.descricao ilike $1 or exists(select 1 from est_produto_unidades u where u.produto_id=p.id and u.codigo_barras ilike $1)) and ($2 or p.ativo) order by p.codigo limit 500`, [q, inativos]),
      db.query(`select codigo,descricao,fracionavel from est_unidades order by codigo`),
      db.query(`select id,codigo,descricao,ativo from est_locais order by codigo`),
      db.query(`select produto_id,unidade,fator::float fator,codigo_barras from est_produto_unidades`),
    ]);
    const mapa = new Map<string, any[]>();
    for (const u of un) { if (!mapa.has(u.produto_id)) mapa.set(u.produto_id, []); mapa.get(u.produto_id)!.push(u); }
    return NextResponse.json({ produtos: produtos.map((p: any) => ({ ...p, unidades: mapa.get(p.id) || [] })), unidades, locais }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return erro(e); }
}

export async function POST(req: Request) {
  try {
    const s = await requireRoles(PERFIS_CADASTRO);
    const b = await req.json();
    const db = sql(); await garantirEstoque(db);
    const tipo = String(b.tipo || "");
    if (tipo === "PRODUTO") {
      const codigo = normalizarCodigo(b.codigo), descricao = String(b.descricao || "").trim().slice(0, 240), ub = String(b.unidadeBase || "").toUpperCase();
      const minimo = b.estoqueMinimo === "" || b.estoqueMinimo == null ? 0 : Number(b.estoqueMinimo);
      const barras = String(b.codigoBarras || "").trim().slice(0, 64) || null;
      if (!codigo || codigo.length > 60) return NextResponse.json({ error: "Informe o código do produto (até 60 caracteres)." }, { status: 400 });
      if (!Number.isFinite(minimo) || minimo < 0) return NextResponse.json({ error: "Estoque mínimo inválido." }, { status: 400 });
      const [u] = await db.query(`select 1 from est_unidades where codigo=$1`, [ub]); if (!u) return NextResponse.json({ error: "Unidade base inválida." }, { status: 400 });
      try {
        await db.query(`with p as(insert into est_produtos(codigo,descricao,unidade_base,estoque_minimo,criado_por) values($1,$2,$3,$4::numeric,$5) returning id) insert into est_produto_unidades(produto_id,unidade,fator,codigo_barras) select id,$3,1,$6 from p`, [codigo, descricao, ub, minimo, s.usuario, barras]);
      } catch (e: any) { return dup(e, /codigo_barras/.test(String(e?.message)) || /ux_est_codigo_barras/.test(String(e?.message)) ? "Esse código de barras já está cadastrado em outro produto/unidade." : `O código ${codigo} já está cadastrado.`) || erro(e); }
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (tipo === "UNIDADE_PRODUTO") {
      const produtoId = String(b.produtoId || ""), un = String(b.unidade || "").toUpperCase(), fator = Number(b.fator), barras = String(b.codigoBarras || "").trim().slice(0, 64) || null;
      if (!/^[0-9a-f-]{36}$/i.test(produtoId) || !Number.isFinite(fator) || fator <= 0) return NextResponse.json({ error: "Informe produto, unidade e um fator maior que zero." }, { status: 400 });
      const [p] = await db.query(`select unidade_base from est_produtos where id=$1::uuid`, [produtoId]); if (!p) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
      const [u] = await db.query(`select 1 from est_unidades where codigo=$1`, [un]); if (!u) return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
      if (un === p.unidade_base && fator !== 1) return NextResponse.json({ error: "A unidade base sempre tem fator 1." }, { status: 400 });
      try {
        await db.query(`insert into est_produto_unidades(produto_id,unidade,fator,codigo_barras) values($1::uuid,$2,$3::numeric,$4) on conflict(produto_id,unidade) do update set fator=excluded.fator,codigo_barras=excluded.codigo_barras`, [produtoId, un, fator, barras]);
      } catch (e: any) { return dup(e, "Esse código de barras já está cadastrado em outro produto/unidade.") || erro(e); }
      return NextResponse.json({ ok: true });
    }
    if (tipo === "LOCAL") {
      const codigo = normalizarCodigo(b.codigo), descricao = String(b.descricao || "").trim().slice(0, 160);
      if (!codigo || codigo.length > 40) return NextResponse.json({ error: "Informe o código do local (até 40 caracteres)." }, { status: 400 });
      try { await db.query(`insert into est_locais(codigo,descricao) values($1,$2)`, [codigo, descricao]); } catch (e: any) { return dup(e, `O local ${codigo} já existe.`) || erro(e); }
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (tipo === "IMPORTAR_PCP") {
      // Cria no catálogo os códigos que existem na programação e ainda não estão no estoque. Não altera produtos existentes.
      const r = await db.query(`with novos as(select distinct on (upper(regexp_replace(trim(produto),'\\s+','','g'))) upper(regexp_replace(trim(produto),'\\s+','','g')) codigo, left(trim(descricao),240) descricao from pcp_produtos where trim(produto)<>'' and length(trim(produto))<=60 order by 1), ins as(insert into est_produtos(codigo,descricao,unidade_base,origem,criado_por) select codigo,coalesce(descricao,''),'UN','PCP',$1 from novos on conflict(codigo) do nothing returning id), un as(insert into est_produto_unidades(produto_id,unidade,fator) select id,'UN',1 from ins returning produto_id) select (select count(*) from ins)::int criados, (select count(*) from novos)::int analisados`, [s.usuario]);
      return NextResponse.json({ ok: true, criados: r[0].criados, analisados: r[0].analisados, aviso: "Unidade base assumida como UN. Revise a unidade e cadastre conversões (caixa, pacote…) quando necessário." });
    }
    return NextResponse.json({ error: "Tipo de cadastro inválido." }, { status: 400 });
  } catch (e) { return erro(e); }
}

export async function PATCH(req: Request) {
  try {
    await requireRoles(PERFIS_CADASTRO);
    const b = await req.json();
    const db = sql(); await garantirEstoque(db);
    const id = String(b.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    if (b.tipo === "PRODUTO") {
      const minimo = b.estoqueMinimo === undefined ? null : Number(b.estoqueMinimo);
      if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) return NextResponse.json({ error: "Estoque mínimo inválido." }, { status: 400 });
      if (b.ativo === false) {
        const [s] = await db.query(`select coalesce(sum(fisico),0)::float f from est_saldos where produto_id=$1::uuid`, [id]);
        if (Number(s.f) > 0) return NextResponse.json({ error: "Produto com saldo em estoque não pode ser inativado. Zere o saldo antes." }, { status: 409 });
      }
      await db.query(`update est_produtos set descricao=coalesce($2,descricao),estoque_minimo=coalesce($3::numeric,estoque_minimo),ativo=coalesce($4::boolean,ativo),atualizado_em=now() where id=$1::uuid`, [id, b.descricao === undefined ? null : String(b.descricao).slice(0, 240), minimo, typeof b.ativo === "boolean" ? b.ativo : null]);
    } else if (b.tipo === "LOCAL") {
      if (b.ativo === false) {
        const [s] = await db.query(`select coalesce(sum(fisico),0)::float f from est_saldos where local_id=$1::uuid`, [id]);
        if (Number(s.f) > 0) return NextResponse.json({ error: "Local com saldo em estoque não pode ser inativado." }, { status: 409 });
      }
      await db.query(`update est_locais set descricao=coalesce($2,descricao),ativo=coalesce($3::boolean,ativo) where id=$1::uuid`, [id, b.descricao === undefined ? null : String(b.descricao).slice(0, 160), typeof b.ativo === "boolean" ? b.ativo : null]);
    } else return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
