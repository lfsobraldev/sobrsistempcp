import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

const VALIDAS = new Set(["NORMAL", "ALTA", "URGENTE"]);

export async function PATCH(req: Request) {
  try {
    const s = await requireRoles(["PCP", "GERENTE", "ENCARREGADO"]);
    const b = await req.json();

    const pedido = String(b.pedido || "").trim();
    const prioridade = String(b.prioridade || "").trim().toUpperCase();

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não informado." },
        { status: 400 }
      );
    }

    if (!VALIDAS.has(prioridade)) {
      return NextResponse.json(
        { error: "Prioridade inválida." },
        { status: 400 }
      );
    }

    const db = sql();

    const [pg] = await db`
      select id
      from pcp_programacoes
      where status = 'ATIVA'
      order by criado_em desc
      limit 1
    `;

    if (!pg) {
      return NextResponse.json(
        { error: "Nenhuma programação ativa." },
        { status: 404 }
      );
    }

    const alterados = await db`
      update pcp_produtos
      set prioridade = ${prioridade}
      where programacao_id = ${pg.id}
        and pedido = ${pedido}
      returning id, of, prioridade
    `;

    if (!alterados.length) {
      return NextResponse.json(
        { error: "Pedido não encontrado na programação ativa." },
        { status: 404 }
      );
    }

    await db`
      insert into pcp_eventos(
        operacao_id,
        usuario,
        tipo,
        descricao,
        of,
        processo,
        depois
      )
      values(
        null,
        ${s.usuario},
        'PRIORIDADE_PEDIDO',
        ${`Prioridade do pedido ${pedido} alterada para ${prioridade}`},
        '',
        '',
        ${JSON.stringify({ pedido, prioridade, itens: alterados.length })}::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
      pedido,
      prioridade,
      itens: alterados.length,
    });
  } catch (e: any) {
    const status =
      e?.message === "SEM_PERMISSAO"
        ? 403
        : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message || "Falha ao alterar prioridade.",
      },
      { status }
    );
  }
}
