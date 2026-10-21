import { sql } from "@/lib/db";
type Db = ReturnType<typeof sql>;
const prontos = new WeakSet<Db>();
/** Garante as tabelas do apontamento (mesmo DDL de database/migrations/2026-10-21_pcp_apontamentos.sql). Idempotente. */
export async function garantirApontamentos(db: Db) {
  if (prontos.has(db)) return;
  await db`create table if not exists pcp_apontamentos(id bigserial primary key, operacao_id uuid references pcp_operacoes(id) on delete cascade, pedido varchar(80) not null default '', of varchar(80) not null default '', processo varchar(80) not null default '', tipo varchar(30) not null, quantidade numeric(16,3) not null, request_id varchar(80), usuario varchar(120) not null default '', data_producao date not null default ((now() at time zone 'America/Sao_Paulo')::date), criado_em timestamptz not null default now())`;
  await db`create unique index if not exists ux_pcp_apont_request on pcp_apontamentos(request_id) where request_id is not null`;
  await db`create index if not exists ix_pcp_apont_op on pcp_apontamentos(operacao_id, criado_em desc)`;
  await db`create index if not exists ix_pcp_apont_dia on pcp_apontamentos(data_producao, processo)`;
  await db`create table if not exists pcp_recursos_regras(processo varchar(80) primary key, max_em_andamento int check (max_em_andamento is null or max_em_andamento >= 1), atualizado_por varchar(120) not null default '', atualizado_em timestamptz not null default now())`;
  prontos.add(db);
}
