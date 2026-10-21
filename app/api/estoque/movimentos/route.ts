import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirEstoque } from "@/lib/estoque-schema";
import { PERFIS_MOV, PERFIS_VER, TIPOS_MOV, converterParaBase, validarCamposMovimento, type TipoMov } from "@/lib/estoque";
import { executarMovimento } from "@/lib/estoque-db";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

async function unidadeGET(req: Request) {
  try {
    await requireRoles([...PERFIS_VER]);
    const db = sql(); await garantirEstoque(db);
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo") || "", pedido = txt(url.searchParams.get("pedido"), 80), q = "%" + txt(url.searchParams.get("q"), 60).replace(/[%_\\]/g, "") + "%";
    const de = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("de") || "") ? url.searchParams.get("de")! : "", ate = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("ate") || "") ? url.searchParams.get("ate")! : "";
    const rows = await db.query(`
      select m.id,m.tipo,p.codigo,p.descricao,m.quantidade_base::float quantidade_base,p.unidade_base,m.quantidade_informada::float quantidade_informada,m.unidade_informada,m.fator::float fator,m.sinal,m.baixa_reserva,
        lo.codigo origem,ld.codigo destino,m.documento,m.pedido,m.of,m.motivo,m.observacao,m.usuario,m.criado_em
      from est_movimentos m join est_produtos p on p.id=m.produto_id left join est_locais lo on lo.id=m.local_origem_id left join est_locais ld on ld.id=m.local_destino_id
      where ($1='' or m.tipo=$1) and ($2='' or m.pedido=$2) and ($3='%%' or p.codigo ilike $3 or p.descricao ilike $3 or m.documento ilike $3 or m.usuario ilike $3)
        and ($4='' or m.criado_em>=($4::date)::timestamptz) and ($5='' or m.criado_em<(($5::date)+1)::timestamptz)
      order by m.id desc limit 300`, [tipo, pedido, q, de, ate]);
    return NextResponse.json({ movimentos: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão." : e?.message || "Falha." }, { status: f ? 403 : 500 }); }
}

async function unidadePOST(req: Request) {
  try {
    const b = await req.json();
    const tipo = String(b.tipo || "") as TipoMov;
    if (!TIPOS_MOV.includes(tipo)) return NextResponse.json({ error: "Tipo de movimento inválido." }, { status: 400 });
    const s = await requireRoles(PERFIS_MOV[tipo]);
    const db = sql(); await garantirEstoque(db);

    const quantidade = Number(String(b.quantidade ?? "").replace(",", "."));
    const sinal: 1 | -1 = Number(b.sinal) === -1 ? -1 : 1;
    const campos = { tipo, quantidade, localOrigem: txt(b.localOrigem, 40) || undefined, localDestino: txt(b.localDestino, 40) || undefined, sinal, documento: txt(b.documento, 80), pedido: txt(b.pedido, 80), motivo: txt(b.motivo, 200), baixarReserva: b.baixarReserva === true };
    // AJUSTE: o local vem em localOrigem (negativo) ou localDestino (positivo); a tela envia sempre "localOrigem"
    if (tipo === "AJUSTE") { const l = campos.localOrigem || campos.localDestino; if (sinal === -1) { campos.localOrigem = l; campos.localDestino = undefined; } else { campos.localDestino = l; campos.localOrigem = undefined; } }
    const erros = validarCamposMovimento(campos);
    if (erros.length) return NextResponse.json({ error: erros.join(" ") }, { status: 400 });
    for (const id of [b.produtoId, campos.localOrigem, campos.localDestino].filter(Boolean)) if (!UUID.test(String(id))) return NextResponse.json({ error: "Produto ou local inválido." }, { status: 400 });

    const [p] = await db.query(`select p.id,p.unidade_base,p.ativo,ub.fracionavel from est_produtos p join est_unidades ub on ub.codigo=p.unidade_base where p.id=$1::uuid`, [b.produtoId]);
    if (!p) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    if (!p.ativo) return NextResponse.json({ error: "Produto inativo." }, { status: 409 });
    const unidade = String(b.unidade || p.unidade_base).toUpperCase();
    const [u] = await db.query(`select fator::float fator from est_produto_unidades where produto_id=$1::uuid and unidade=$2`, [p.id, unidade]);
    if (!u) return NextResponse.json({ error: `A unidade ${unidade} não está cadastrada para este produto.` }, { status: 400 });
    const c = converterParaBase(quantidade, Number(u.fator), !!p.fracionavel);
    if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });
    const locais = [campos.localOrigem, campos.localDestino].filter(Boolean) as string[];
    const ativos = await db.query(`select id from est_locais where id=any($1::uuid[]) and ativo`, [locais]);
    if (ativos.length !== new Set(locais).size) return NextResponse.json({ error: "Local inexistente ou inativo." }, { status: 400 });

    const r = await executarMovimento(db, {
      tipo, produtoId: p.id, localOrigem: campos.localOrigem, localDestino: campos.localDestino, qBase: c.base, qInformada: quantidade, unidade, fator: Number(u.fator), sinal,
      baixarReserva: campos.baixarReserva, documento: campos.documento, pedido: campos.pedido, of: txt(b.of, 80), motivo: campos.motivo, observacao: txt(b.observacao, 500),
      requestId: txt(b.requestId, 80) || null, usuario: s.usuario,
    });
    if (!r.ok) return NextResponse.json({ error: r.erro, codigo: r.codigo }, { status: r.http });
    return NextResponse.json({ ok: true, duplicado: r.duplicado === true, quantidadeBase: c.base }, { status: r.duplicado ? 200 : 201 });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return NextResponse.json({ error: f ? "Sem permissão para este tipo de movimento." : e?.message || "Falha ao movimentar." }, { status: f ? 403 : 500 }); }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
