import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { verifyAction } from "@/lib/ia/claude";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

async function unidadePOST(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { token } = await req.json();
    const a = verifyAction(token, s.usuario);
    if (!a) return NextResponse.json({ error: "Ação expirada ou inválida." }, { status: 400 });

    if (a.action === "prioridade") {
      if (!["PCP", "GERENTE", "ENCARREGADO"].includes(s.perfil)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      const { pedido, prioridade } = a.payload;
      const db = sql();
      const [pg] = await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
      if (!pg) return NextResponse.json({ error: "Nenhuma programação ativa." }, { status: 404 });
      const r = await db`update pcp_produtos set prioridade=${prioridade} where programacao_id=${pg.id} and pedido=${pedido} returning id, of`;
      if (!r.length) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
      await db`insert into pcp_eventos(usuario,tipo,descricao,depois) values (${s.usuario},'PRIORIDADE_IA',${`Prioridade do pedido ${pedido} → ${prioridade} (via assistente IA)`},${JSON.stringify({ pedido, prioridade })}::jsonb)`;
      return NextResponse.json({ ok: true, mensagem: `Pedido ${pedido} agora está como ${prioridade} (${r.length} itens).` });
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao executar ação." }, { status: 500 });
  }
}

export const POST = unidadeHandler(unidadePOST);
