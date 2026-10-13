import { sql } from "@/lib/db";
import { buildProcessingFromFilterProducts } from "@/lib/romaneio/parser";
import type { MountType, ProcessingResult } from "@/lib/romaneio/types";

export type PreparedRomaneio = {
  pedido: string;
  cliente: string;
  tipoPedido: string;
  montagem: MountType;
  status: string;
  hasMachining: boolean;
  origemUsinagem: string;
  warnings: string[];
  resultado: ProcessingResult;
  atualizadoEm?: string;
};

export async function ensurePreparedRomaneiosTable(db = sql()) {
  await db`
    create table if not exists pcp_romaneios_preparados(
      id uuid primary key default gen_random_uuid(),
      programacao_id uuid not null references pcp_programacoes(id) on delete cascade,
      pedido varchar(80) not null,
      cliente varchar(240) not null default '',
      tipo_pedido varchar(30) not null default 'NORMAL',
      montagem varchar(40) not null default 'MONTADO_HS',
      status varchar(30) not null default 'PRE_PRONTO',
      has_machining boolean not null default false,
      origem_usinagem varchar(30) not null default 'FILTRO',
      warnings jsonb not null default '[]'::jsonb,
      resultado jsonb not null default '{}'::jsonb,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      unique(programacao_id,pedido)
    )
  `;
  await db`create index if not exists ix_pcp_romaneios_preparados_prog on pcp_romaneios_preparados(programacao_id,status,pedido)`;
}

function mountFor(rows: any[]): MountType {
  const tipo = String(rows.find((x) => x.tipo_pedido)?.tipo_pedido || "NORMAL").toUpperCase();
  if (tipo === "REVENDA") return "REVENDA";
  if (tipo === "ENGENHARIA") {
    const m = String(rows.find((x) => x.montagem_engenharia)?.montagem_engenharia || "MONTADO_HS").toUpperCase();
    if (m === "MONTADO_TIMADEL" || m === "MONTADO_ESTANCIA") return m as MountType;
  }
  return "MONTADO_HS";
}

function statusFor(result: ProcessingResult) {
  const hard = (result.warnings || []).filter((x) =>
    /nenhuma linha utilizável|não foram associados|sem vínculo|inválid|erro/i.test(String(x))
  );
  if (hard.length) return "ATENCAO";
  return result.hasMachining ? "PRONTO" : "PRE_PRONTO";
}

export async function buildPreparedForOrder(args: {
  programacaoId: string;
  filtro: string;
  pedido: string;
  rows: any[];
  machiningBuffer?: Buffer;
  origemUsinagem?: "FILTRO" | "IA" | "UPLOAD";
  db?: ReturnType<typeof sql>;
}) {
  const db = args.db || sql();
  await ensurePreparedRomaneiosTable(db);

  const rows = args.rows;
  if (!rows.length) throw new Error(`Pedido ${args.pedido} sem produtos para romaneio.`);

  const first = rows[0];
  const mountType = mountFor(rows);
  const tipoPedido = String(first.tipo_pedido || "NORMAL").toUpperCase();

  const result = buildProcessingFromFilterProducts(
    {
      orderNumber: args.pedido,
      client: String(first.pedido_cliente || ""),
      destination: "",
      products: rows.map((row: any) => ({
        item: row.item,
        produto: row.produto,
        descricao: row.descricao,
        categoria: row.categoria,
        tipo: row.tipo,
        canal: row.canal,
        codigoModelo: row.codigo_modelo,
        quantidade: Number(row.quantidade || 0),
        medida: row.medida,
        acabamento: row.acabamento,
        cor: row.cor,
        rebaixo: row.rebaixo,
        material: row.material,
        descricaoModelo: row.descricao_modelo,
        outrasCaracteristicas: row.outras_caracteristicas,
      })),
    },
    args.machiningBuffer,
    {
      mountType,
      orderOptions: {
        mountType,
        filtro: args.filtro,
      },
    }
  );

  result.sourceMode = "FILTRO_51";
  result.sourceFileName = `Filtro 51 • Pedido ${args.pedido}`;

  const status = statusFor(result);
  const origemUsinagem = args.origemUsinagem || (args.machiningBuffer ? "UPLOAD" : "FILTRO");

  await db`
    insert into pcp_romaneios_preparados(
      programacao_id,pedido,cliente,tipo_pedido,montagem,status,
      has_machining,origem_usinagem,warnings,resultado,atualizado_em
    )
    values(
      ${args.programacaoId},
      ${args.pedido},
      ${String(first.pedido_cliente || "")},
      ${tipoPedido},
      ${mountType},
      ${status},
      ${Boolean(result.hasMachining)},
      ${origemUsinagem},
      ${JSON.stringify(result.warnings || [])}::jsonb,
      ${JSON.stringify(result)}::jsonb,
      now()
    )
    on conflict(programacao_id,pedido)
    do update set
      cliente=excluded.cliente,
      tipo_pedido=excluded.tipo_pedido,
      montagem=excluded.montagem,
      status=excluded.status,
      has_machining=excluded.has_machining,
      origem_usinagem=excluded.origem_usinagem,
      warnings=excluded.warnings,
      resultado=excluded.resultado,
      atualizado_em=now()
  `;

  return {
    pedido: args.pedido,
    cliente: String(first.pedido_cliente || ""),
    tipoPedido,
    montagem: mountType,
    status,
    hasMachining: Boolean(result.hasMachining),
    origemUsinagem,
    warnings: result.warnings || [],
    resultado: result,
  } satisfies PreparedRomaneio;
}

export async function prepareAllRomaneios(programacaoId: string, filtro: string, db = sql()) {
  await ensurePreparedRomaneiosTable(db);

  const rows = await db`
    select
      pedido,item,produto,descricao,categoria,tipo,canal,codigo_modelo,
      quantidade,medida,acabamento,cor,rebaixo,material,descricao_modelo,
      outras_caracteristicas,pedido_cliente,tipo_pedido,montagem_engenharia
    from pcp_produtos
    where programacao_id=${programacaoId}
    order by pedido,item
  `;

  const grouped = new Map<string, any[]>();
  for (const row of rows as any[]) {
    const pedido = String(row.pedido || "").trim();
    if (!pedido) continue;
    grouped.set(pedido, [...(grouped.get(pedido) || []), row]);
  }

  const preparados: PreparedRomaneio[] = [];
  const erros: Array<{ pedido: string; erro: string }> = [];

  for (const [pedido, produtos] of grouped) {
    try {
      preparados.push(await buildPreparedForOrder({
        programacaoId,
        filtro,
        pedido,
        rows: produtos,
        db,
      }));
    } catch (e: any) {
      erros.push({ pedido, erro: e?.message || "Falha ao preparar romaneio." });
    }
  }

  return {
    total: grouped.size,
    preparados: preparados.length,
    atencao: preparados.filter((x) => x.status === "ATENCAO").length,
    preProntos: preparados.filter((x) => x.status === "PRE_PRONTO").length,
    prontos: preparados.filter((x) => x.status === "PRONTO").length,
    erros,
  };
}
