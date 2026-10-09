import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

const TIPOS = new Set(["NORMAL", "REVENDA", "ENGENHARIA"]);

function embalagemNormalSQL() {
  return `
    case
      when upper(coalesce(p.categoria, '')) like 'PORTA%'
        or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
        then 'EMBALAGEM-PORTAS'
      when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
        then 'EMBALAGEM-1'
      when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
        then 'EMBALAGEM-2'
      when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
        or (
          upper(coalesce(p.categoria, '')) like 'ALIZAR%'
          and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
        )
        then 'EMBALAGEM-4'
      when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
        then 'EMBALAGEM-3'
      when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
        or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
        then 'EMBALAGEM-7'
      when upper(coalesce(p.categoria, '')) like 'KIT%'
        or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
        then 'EMBALAGEM-5'
      when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
        or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
        then 'EMBALAGEM-6'
      else null
    end
  `;
}

export async function PATCH(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const b = await req.json();

    const pedido = String(b.pedido || "").trim();
    const tipo = String(b.tipo || "NORMAL").trim().toUpperCase();

    if (!pedido) {
      return NextResponse.json({ error: "Pedido não informado." }, { status: 400 });
    }

    if (!TIPOS.has(tipo)) {
      return NextResponse.json({ error: "Tipo de pedido inválido." }, { status: 400 });
    }

    const db = sql();

    await db`
      alter table pcp_produtos
      add column if not exists tipo_pedido varchar(20) not null default 'NORMAL'
    `;

    const [pg] = await db`
      select id
      from pcp_programacoes
      where status = 'ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!pg) {
      return NextResponse.json({ error: "Nenhuma programação ativa." }, { status: 404 });
    }

    const produtos = await db`
      update pcp_produtos
      set tipo_pedido = ${tipo}
      where programacao_id = ${pg.id}
        and pedido = ${pedido}
      returning id
    `;

    if (!produtos.length) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    if (tipo === "REVENDA" || tipo === "ENGENHARIA") {
      const processo = tipo === "REVENDA"
        ? "EMBALAGEM-REVENDA"
        : "EMBALAGEM-ENGENHARIA";

      await db`
        update pcp_operacoes o
        set processo = ${processo},
            sequencia = 20,
            atualizado_em = now()
        from pcp_produtos p
        where p.id = o.produto_id
          and p.programacao_id = ${pg.id}
          and p.pedido = ${pedido}
          and o.processo like 'EMBALAGEM%'
      `;
    } else {
      await db`
        update pcp_operacoes o
        set processo = case
          when upper(coalesce(p.categoria, '')) like 'PORTA%'
            or upper(coalesce(p.categoria, '')) like 'BANDEIRA%'
            then 'EMBALAGEM-PORTAS'
          when upper(coalesce(p.categoria, '')) like 'BATENTE%PERNA%'
            then 'EMBALAGEM-1'
          when upper(coalesce(p.categoria, '')) like 'BATENTE%TRAVESSA%'
            then 'EMBALAGEM-2'
          when upper(coalesce(p.categoria, '')) like 'ALIZAR%TRAVESSA%'
            or (
              upper(coalesce(p.categoria, '')) like 'ALIZAR%'
              and upper(coalesce(p.descricao, '')) like '%TRAVESSA%'
            )
            then 'EMBALAGEM-4'
          when upper(coalesce(p.categoria, '')) like 'ALIZAR%'
            then 'EMBALAGEM-3'
          when upper(coalesce(p.categoria, '')) like 'SUPORTE TRILHO%'
            or upper(coalesce(p.descricao, '')) like '%SUPORTE DE TRILHO%'
            or upper(coalesce(p.descricao, '')) like '%SUP TRILHO%'
            then 'EMBALAGEM-7'
          when upper(coalesce(p.categoria, '')) like 'KIT%'
            or upper(coalesce(p.descricao, '')) like '%KIT DE CORRER%'
            then 'EMBALAGEM-5'
          when upper(coalesce(p.categoria, '')) like 'BAGUETE%'
            or upper(coalesce(p.descricao, '')) like '%BAGUETE%'
            then 'EMBALAGEM-6'
          else o.processo
        end,
        atualizado_em = now()
        from pcp_produtos p
        where p.id = o.produto_id
          and p.programacao_id = ${pg.id}
          and p.pedido = ${pedido}
          and o.processo like 'EMBALAGEM%'
      `;
    }

    await db`
      insert into pcp_eventos(
        usuario, tipo, descricao, depois
      )
      values(
        ${s.usuario},
        'TIPO_PEDIDO',
        ${`Pedido ${pedido} classificado como ${tipo}`},
        ${JSON.stringify({ pedido, tipo, itens: produtos.length })}::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
      pedido,
      tipo,
      itens: produtos.length,
    });
  } catch (e: any) {
    const status = e?.message === "SEM_PERMISSAO" ? 403 : 500;
    return NextResponse.json(
      { error: status === 403 ? "Sem permissão." : e?.message || "Falha ao alterar tipo do pedido." },
      { status }
    );
  }
}
