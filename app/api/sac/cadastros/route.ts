import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

const VIEW = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL", "SAC", "LOGISTICA"] as const;

async function exists(db: ReturnType<typeof sql>, name: string) {
  const [row] = await db`select to_regclass(${"public." + name}) as name`;
  return Boolean(row?.name);
}

export async function GET() {
  try {
    await requireRoles([...VIEW]);
    const db = sql();
    const [clientsTable, repsTable, ordersTable, measurementsTable] = await Promise.all([
      exists(db, "crm_clientes"), exists(db, "crm_representantes"), exists(db, "pcp_controle_entregas"), exists(db, "pcp_medicao_revisoes"),
    ]);
    if (!clientsTable) return NextResponse.json({ error: "O cadastro central Comercial ainda não foi inicializado." }, { status: 409 });
    const [clients, reps, links, orders, measurements] = await Promise.all([
      db`select id,razao_social,nome_fantasia from crm_clientes where ativo order by coalesce(nullif(nome_fantasia,''),razao_social) limit 2000`,
      repsTable ? db`select id,nome from crm_representantes where ativo order by nome limit 1000` : [],
      repsTable && await exists(db,"crm_cliente_representantes") ? db`select cliente_id,representante_id from crm_cliente_representantes where ativo` : [],
      ordersTable ? db`select c.pedido,c.crm_cliente_id,coalesce(nullif(cl.nome_fantasia,''),cl.razao_social,c.cliente) cliente
        from pcp_controle_entregas c join crm_clientes cl on cl.id=c.crm_cliente_id
        order by c.criado_em desc limit 3000` : [],
      measurementsTable ? db`select id,pedido,crm_cliente_id,versao,data_medicao::text data_medicao,status,itens
        from pcp_medicao_revisoes order by pedido,versao desc limit 5000` : [],
    ]);
    return NextResponse.json({ clientes: clients, representantes: reps, vinculos: links, pedidos: orders, medicoes: measurements }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : error instanceof Error ? error.message : "Falha ao consultar cadastros SAC." }, { status: forbidden ? 403 : 500 });
  }
}