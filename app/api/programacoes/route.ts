import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await requireRoles(["PCP"]);

    const b = await req.json();
    const db = sql();

    await db`
      alter table pcp_produtos
      add column if not exists tipo_pedido varchar(20) not null default 'NORMAL'
    `;

    await db`
      alter table pcp_produtos
      add column if not exists montagem_engenharia varchar(30) not null default 'MONTADO_HS'
    `;

    /*
      IMPORTANTE:
      A programação NÃO é mais bloqueada porque o Filtro 51 mudou
      de quantidade de linhas, pedidos, OFs, peças ou operações.

      O filtro é diário e pode variar.

      semRota / inconsistências são mantidos como diagnóstico,
      mas não impedem a liberação.
    */

    await db`
      update pcp_programacoes
      set
        status = 'ENCERRADA',
        encerrado_em = now()
      where status = 'ATIVA'
    `;

    const [pg] = await db`
      insert into pcp_programacoes(
        pedido,
        cliente,
        destino,
        filtro,
        data_programacao,
        turno,
        status,
        origem,
        import_linhas,
        import_pedidos,
        import_ofs,
        import_pecas,
        import_operacoes,
        import_sem_rota,
        import_inconsistencias,
        import_processos
      )
      values(
        'MULTIPLOS',
        '',
        '',
        ${String(b.filtro || "")},
        ${String(b.data || "")},
        ${String(b.turno || "A")},
        'ATIVA',
        ${String(b.origem || "FILTRO")},
        ${Number(b.diagnostico?.linhas || 0)},
        ${Number(b.diagnostico?.pedidos || 0)},
        ${Number(b.diagnostico?.ofs || 0)},
        ${Number(b.diagnostico?.pecas || 0)},
        ${Number(b.diagnostico?.operacoes || 0)},
        ${Number(b.diagnostico?.semRota || 0)},
        ${Number(b.diagnostico?.inconsistenciasRota || 0)},
        ${JSON.stringify(
          b.diagnostico?.processos || {}
        )}::jsonb
      )
      returning id
    `;

    for (const p of b.produtos || []) {
      const [prod] = await db`
        insert into pcp_produtos(
          programacao_id,
          filtro,
          pedido,
          item,
          produto,
          descricao,
          tipo,
          canal,
          rebaixo,
          acabamento,
          cor,
          quantidade,
          pedido_cliente,
          status_engenharia,
          of,
          percentual_produto,
          codigo_modelo,
          descricao_modelo,
          outras_caracteristicas,
          categoria,
          material,
          medida,
          prioridade,
          tipo_pedido,
          montagem_engenharia
        )
        values(
          ${pg.id},
          ${String(p.filtro || "")},
          ${String(p.pedido || "")},
          ${String(p.item || "")},
          ${String(p.produto || "")},
          ${String(p.descricao || "")},
          ${String(p.tipo || "")},
          ${String(p.canal || "")},
          ${String(p.rebaixo || "")},
          ${String(p.acabamento || "")},
          ${String(p.cor || "")},
          ${Number(p.quantidade || 0)},
          ${String(p.pedidoCliente || "")},
          ${String(p.statusEngenharia || "")},
          ${String(p.of || "")},
          ${Number(p.percentualProduto || 0)},
          ${String(p.codigoModelo || "")},
          ${String(p.descricaoModelo || "")},
          ${String(p.outrasCaracteristicas || "")},
          ${String(p.categoria || "OUTROS")},
          ${String(p.material || "")},
          ${String(p.medida || "")},
          ${String(p.prioridade || "NORMAL")},
          ${["REVENDA","ENGENHARIA"].includes(String(p.tipoPedido || "").toUpperCase()) ? String(p.tipoPedido).toUpperCase() : "NORMAL"},
          ${["MONTADO_HS","MONTADO_TIMADEL","MONTADO_ESTANCIA"].includes(String(p.montagemEngenharia || "").toUpperCase()) ? String(p.montagemEngenharia).toUpperCase() : "MONTADO_HS"}
        )
        returning id
      `;

      for (const o of p.operacoes || []) {
        await db`
          insert into pcp_operacoes(
            produto_id,
            processo,
            sequencia,
            percentual,
            status,
            ordem_fila,
            fixada,
            quantidade_planejada,
            quantidade_produzida,
            quantidade_refugo
          )
          values(
            ${prod.id},
            ${["REVENDA","ENGENHARIA"].includes(String(p.tipoPedido || "").toUpperCase()) && String(o.processo || "").startsWith("EMBALAGEM") ? `EMBALAGEM-${String(p.tipoPedido).toUpperCase()}` : String(o.processo || "")},
            ${Number(o.sequencia || 0)},
            ${Number(o.percentual || 0)},
            ${String(o.status || "PENDENTE")},
            ${Number(o.ordemFila || 0)},
            ${Boolean(o.fixada)},
            ${Number(o.quantidadePlanejada || 0)},
            ${Number(o.quantidadeProduzida || 0)},
            ${Number(o.quantidadeRefugo || 0)}
          )
        `;
      }
    }

    await db`
      insert into pcp_eventos(
        usuario,
        tipo,
        descricao,
        depois
      )
      values(
        'PCP',
        'PROGRAMACAO_LIBERADA',
        ${`Programação ${String(
          b.filtro || ""
        )} liberada`},
        ${JSON.stringify({
          filtro: b.filtro,
          linhas: Number(
            b.diagnostico?.linhas || 0
          ),
          pedidos: Number(
            b.diagnostico?.pedidos || 0
          ),
          ofs: Number(
            b.diagnostico?.ofs || 0
          ),
          pecas: Number(
            b.diagnostico?.pecas || 0
          ),
          operacoes: Number(
            b.diagnostico?.operacoes || 0
          ),
          semRota: Number(
            b.diagnostico?.semRota || 0
          ),
          inconsistencias: Number(
            b.diagnostico
              ?.inconsistenciasRota || 0
          ),
        })}::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
      id: pg.id,
      diagnostico: {
        linhas: Number(
          b.diagnostico?.linhas || 0
        ),
        pedidos: Number(
          b.diagnostico?.pedidos || 0
        ),
        ofs: Number(
          b.diagnostico?.ofs || 0
        ),
        pecas: Number(
          b.diagnostico?.pecas || 0
        ),
        operacoes: Number(
          b.diagnostico?.operacoes || 0
        ),
        semRota: Number(
          b.diagnostico?.semRota || 0
        ),
        inconsistenciasRota: Number(
          b.diagnostico
            ?.inconsistenciasRota || 0
        ),
      },
    });
  } catch (e: any) {
    console.error(
      "[PROGRAMACAO_POST]",
      e
    );

    const status =
      e?.message === "SEM_PERMISSAO"
        ? 403
        : 500;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Sem permissão."
            : e?.message ||
              "Falha ao liberar programação.",
      },
      {
        status,
      }
    );
  }
}
