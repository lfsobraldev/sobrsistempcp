import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";
import { garantirEstoque } from "@/lib/estoque-schema";
import { PERFIS_CONFERENCIA, PERFIS_CONTAGEM, PERFIS_VER, avaliarFechamento, converterParaBase, divergenciaInventario, ajusteDoInventario } from "@/lib/estoque";
import { executarMovimento, lerSaldo } from "@/lib/estoque-db";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (m: string, st = 400, extra: object = {}) => NextResponse.json({ error: m, ...extra }, { status: st });

async function detalhe(db: ReturnType<typeof sql>, id: string) {
  const [inv] = await db.query(`select v.id,v.numero,v.tipo,v.status,v.observacao,v.criado_por,v.criado_em,v.fechado_por,v.fechado_em,l.codigo local from est_inventarios v left join est_locais l on l.id=v.local_id where v.id=$1::uuid`, [id]);
  if (!inv) return null;
  const itens = await db.query(`select i.id,p.codigo,p.descricao,p.unidade_base,l.codigo local,i.saldo_sistema::float saldo_sistema,i.contado::float contado,i.contado_por,i.contado_em,i.conferido,i.conferido_por,i.ajustado from est_inventario_itens i join est_produtos p on p.id=i.produto_id join est_locais l on l.id=i.local_id where i.inventario_id=$1::uuid order by l.codigo,p.codigo`, [id]);
  const lista = itens.map((i: any) => ({ ...i, divergencia: divergenciaInventario(i.saldo_sistema, i.contado) }));
  return { inventario: inv, itens: lista, fechamento: avaliarFechamento(lista.map((i: any) => ({ saldoSistema: i.saldo_sistema, contado: i.contado, conferido: i.conferido }))) };
}

export async function GET(req: Request) {
  try {
    await requireRoles([...PERFIS_VER]);
    const db = sql(); await garantirEstoque(db);
    const id = new URL(req.url).searchParams.get("id");
    if (id) { if (!UUID.test(id)) return bad("Inventário inválido."); const d = await detalhe(db, id); return d ? NextResponse.json(d) : bad("Inventário não encontrado.", 404); }
    const rows = await db.query(`select v.id,v.numero,v.tipo,v.status,l.codigo local,v.criado_por,v.criado_em,v.fechado_em,
      (select count(*) from est_inventario_itens i where i.inventario_id=v.id)::int itens,
      (select count(*) from est_inventario_itens i where i.inventario_id=v.id and i.contado is not null)::int contados,
      (select count(*) from est_inventario_itens i where i.inventario_id=v.id and i.contado is not null and i.contado<>i.saldo_sistema)::int divergentes
      from est_inventarios v left join est_locais l on l.id=v.local_id order by v.numero desc limit 100`);
    return NextResponse.json({ inventarios: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return bad(f ? "Sem permissão." : e?.message || "Falha.", f ? 403 : 500); }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const acao = String(b.acao || "");
    const fechadores = ["FECHAR", "CANCELAR", "CONFERIR"].includes(acao);
    const s = await requireRoles(fechadores ? PERFIS_CONFERENCIA : PERFIS_CONTAGEM);
    const db = sql(); await garantirEstoque(db);

    if (acao === "CRIAR") {
      const tipo = b.tipo === "LOCAL" ? "LOCAL" : "GERAL";
      const localId = tipo === "LOCAL" ? String(b.localId || "") : null;
      if (tipo === "LOCAL" && !UUID.test(localId!)) return bad("Escolha o local do inventário.");
      const conflito = await db.query(`select numero from est_inventarios where status='EM_CONTAGEM' and ($1='GERAL' or tipo='GERAL' or local_id=$2::uuid) limit 1`, [tipo, localId]);
      if (conflito.length) return bad(`Já existe o inventário nº ${conflito[0].numero} aberto que cobre este escopo. Conclua ou cancele antes.`, 409);
      const r = await db.query(`with inv as(insert into est_inventarios(tipo,local_id,observacao,criado_por) values($1,$2::uuid,$3,$4) returning id,numero),
        it as(insert into est_inventario_itens(inventario_id,produto_id,local_id,saldo_sistema) select inv.id,s.produto_id,s.local_id,s.fisico from est_saldos s join est_locais l on l.id=s.local_id and l.ativo,inv where s.fisico>0 and ($1='GERAL' or s.local_id=$2::uuid) returning id)
        select (select id from inv) id,(select numero from inv)::int numero,(select count(*) from it)::int itens`, [tipo, localId, String(b.observacao || "").slice(0, 300), s.usuario]);
      return NextResponse.json({ ok: true, ...r[0] }, { status: 201 });
    }

    const inventarioId = String(b.inventarioId || "");
    if (!UUID.test(inventarioId)) return bad("Inventário inválido.");
    const [inv] = await db.query(`select id,numero,tipo,local_id,status from est_inventarios where id=$1::uuid`, [inventarioId]);
    if (!inv) return bad("Inventário não encontrado.", 404);
    if (inv.status !== "EM_CONTAGEM") return bad(`Inventário ${inv.status === "FECHADO" ? "já fechado" : "cancelado"}.`, 409);

    if (acao === "ADICIONAR_ITEM") {
      const produtoId = String(b.produtoId || ""), localId = String(b.localId || "");
      if (!UUID.test(produtoId) || !UUID.test(localId)) return bad("Informe produto e local.");
      if (inv.tipo === "LOCAL" && inv.local_id !== localId) return bad("Este inventário cobre apenas o local selecionado na abertura.");
      const [ocupado] = await db.query(`select v.numero from est_inventario_itens i join est_inventarios v on v.id=i.inventario_id where v.status='EM_CONTAGEM' and v.id<>$3::uuid and i.produto_id=$1::uuid and i.local_id=$2::uuid limit 1`, [produtoId, localId, inventarioId]);
      if (ocupado) return bad(`Produto/local já está no inventário aberto nº ${ocupado.numero}.`, 409);
      const saldo = await lerSaldo(db, produtoId, localId);
      try { await db.query(`insert into est_inventario_itens(inventario_id,produto_id,local_id,saldo_sistema) values($1::uuid,$2::uuid,$3::uuid,$4::numeric)`, [inventarioId, produtoId, localId, saldo.fisico]); }
      catch (e: any) { if (e?.code === "23505") return bad("Esse produto/local já está no inventário.", 409); throw e; }
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (acao === "CONTAR" || acao === "CONFERIR") {
      const itemId = String(b.itemId || ""); if (!UUID.test(itemId)) return bad("Item inválido.");
      const [it] = await db.query(`select i.id,i.contado,i.produto_id,ub.fracionavel,p.unidade_base from est_inventario_itens i join est_produtos p on p.id=i.produto_id join est_unidades ub on ub.codigo=p.unidade_base where i.id=$1::uuid and i.inventario_id=$2::uuid`, [itemId, inventarioId]);
      if (!it) return bad("Item não encontrado neste inventário.", 404);
      if (acao === "CONFERIR") {
        if (it.contado === null) return bad("Conte o item antes de conferir.", 409);
        await db.query(`update est_inventario_itens set conferido=true,conferido_por=$2,conferido_em=now() where id=$1::uuid`, [itemId, s.usuario]);
        return NextResponse.json({ ok: true });
      }
      const q = Number(String(b.quantidade ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q < 0) return bad("Informe uma quantidade válida (zero ou maior).");
      let base = 0;
      if (q > 0) {
        const un = String(b.unidade || it.unidade_base).toUpperCase();
        const [u] = await db.query(`select fator::float fator from est_produto_unidades where produto_id=$1::uuid and unidade=$2`, [it.produto_id, un]);
        if (!u) return bad(`Unidade ${un} não cadastrada para o produto.`);
        const c = converterParaBase(q, Number(u.fator), !!it.fracionavel); if (!c.ok) return bad(c.erro);
        base = c.base;
      }
      await db.query(`update est_inventario_itens set contado=$2::numeric,contado_por=$3,contado_em=now(),conferido=false,conferido_por='',conferido_em=null where id=$1::uuid`, [itemId, base, s.usuario]);
      return NextResponse.json({ ok: true, contadoBase: base });
    }

    if (acao === "CANCELAR") {
      await db.query(`update est_inventarios set status='CANCELADO',fechado_por=$2,fechado_em=now() where id=$1::uuid and status='EM_CONTAGEM'`, [inventarioId, s.usuario]);
      return NextResponse.json({ ok: true });
    }

    if (acao === "FECHAR") {
      const d = await detalhe(db, inventarioId);
      if (!d) return bad("Inventário não encontrado.", 404);
      if (!d.fechamento.ok) return bad(`Não é possível fechar: ${d.fechamento.naoContados} item(ns) sem contagem e ${d.fechamento.divergentesSemConferencia} divergência(s) sem conferência.`, 409, { fechamento: d.fechamento });
      const itens = await db.query(`select i.id,i.produto_id,i.local_id,i.contado::float contado,i.ajustado,p.codigo,l.codigo local from est_inventario_itens i join est_produtos p on p.id=i.produto_id join est_locais l on l.id=i.local_id where i.inventario_id=$1::uuid`, [inventarioId]);
      let ajustados = 0;
      for (const it of itens) {
        if (it.ajustado) continue;
        const atual = await lerSaldo(db, it.produto_id, it.local_id); // com o congelamento, igual ao snapshot; usa o físico atual por segurança
        const aj = ajusteDoInventario(atual.fisico, it.contado);
        if (aj) {
          const r = await executarMovimento(db, {
            tipo: "AJUSTE", produtoId: it.produto_id, localOrigem: aj.sinal === -1 ? it.local_id : null, localDestino: aj.sinal === 1 ? it.local_id : null,
            qBase: aj.quantidade, qInformada: aj.quantidade, unidade: "BASE", fator: 1, sinal: aj.sinal, documento: `INV-${inv.numero}`, motivo: "Ajuste de inventário",
            requestId: "inv:" + it.id, usuario: s.usuario, ignorarInventario: true,
          });
          if (!r.ok) return bad(`Falha ao ajustar ${it.codigo} em ${it.local}: ${r.erro} O inventário continua aberto; os itens já ajustados não serão repetidos.`, 409, { item: it.id });
          ajustados++;
        }
        await db.query(`update est_inventario_itens set ajustado=true where id=$1::uuid`, [it.id]);
      }
      await db.query(`update est_inventarios set status='FECHADO',fechado_por=$2,fechado_em=now() where id=$1::uuid`, [inventarioId, s.usuario]);
      return NextResponse.json({ ok: true, ajustados });
    }
    return bad("Ação inválida.");
  } catch (e: any) { const f = e?.message === "SEM_PERMISSAO"; return bad(f ? "Sem permissão para esta ação." : e?.message || "Falha.", f ? 403 : 500); }
}
