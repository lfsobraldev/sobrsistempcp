import { sql } from "@/lib/db";
type Db = ReturnType<typeof sql>;

/** DDL aditivo e idempotente do módulo de Estoque. Espelhado em database/migrations/2026-10-22_estoque.sql (gerado deste array). */
export const ESTOQUE_DDL: string[] = [
  `create table if not exists est_unidades(codigo varchar(10) primary key, descricao varchar(60) not null, fracionavel boolean not null default false)`,
  `insert into est_unidades(codigo,descricao,fracionavel) values ('UN','Unidade',false),('PC','Peça',false),('PAR','Par',false),('JG','Jogo',false),('CX','Caixa',false),('PCT','Pacote',false),('KG','Quilograma',true),('M','Metro',true),('M2','Metro quadrado',true),('M3','Metro cúbico',true),('L','Litro',true) on conflict (codigo) do nothing`,
  `create table if not exists est_produtos(id uuid primary key default gen_random_uuid(), codigo varchar(60) not null unique, descricao varchar(240) not null default '', unidade_base varchar(10) not null references est_unidades(codigo), estoque_minimo numeric(16,3) not null default 0 check(estoque_minimo>=0), ativo boolean not null default true, origem varchar(20) not null default 'MANUAL', criado_por varchar(120) not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now())`,
  `create table if not exists est_produto_unidades(produto_id uuid not null references est_produtos(id) on delete cascade, unidade varchar(10) not null references est_unidades(codigo), fator numeric(16,6) not null check(fator>0), codigo_barras varchar(64), primary key(produto_id,unidade))`,
  `create unique index if not exists ux_est_codigo_barras on est_produto_unidades(codigo_barras) where codigo_barras is not null`,
  `create table if not exists est_locais(id uuid primary key default gen_random_uuid(), codigo varchar(40) not null unique, descricao varchar(160) not null default '', ativo boolean not null default true, criado_em timestamptz not null default now())`,
  `create table if not exists est_saldos(produto_id uuid not null references est_produtos(id), local_id uuid not null references est_locais(id), fisico numeric(16,3) not null default 0, reservado numeric(16,3) not null default 0, bloqueado numeric(16,3) not null default 0, atualizado_em timestamptz not null default now(), primary key(produto_id,local_id), check(fisico>=0), check(reservado>=0), check(bloqueado>=0), check(reservado+bloqueado<=fisico))`,
  `create table if not exists est_movimentos(id bigserial primary key, tipo varchar(20) not null, produto_id uuid not null references est_produtos(id), local_origem_id uuid references est_locais(id), local_destino_id uuid references est_locais(id), quantidade_base numeric(16,3) not null check(quantidade_base>0), quantidade_informada numeric(16,3) not null, unidade_informada varchar(10) not null, fator numeric(16,6) not null default 1, sinal smallint not null default 1, baixa_reserva boolean not null default false, documento varchar(80) not null default '', pedido varchar(80) not null default '', of varchar(80) not null default '', motivo varchar(200) not null default '', observacao varchar(500) not null default '', request_id varchar(80), usuario varchar(120) not null, criado_em timestamptz not null default now())`,
  `create unique index if not exists ux_est_mov_request on est_movimentos(request_id) where request_id is not null`,
  `create index if not exists ix_est_mov_produto on est_movimentos(produto_id, criado_em desc)`,
  `create index if not exists ix_est_mov_pedido on est_movimentos(pedido) where pedido<>''`,
  `create or replace function est_mov_imutavel() returns trigger as $$ begin raise exception 'est_movimentos é um histórico auditável: não pode ser alterado nem apagado'; end; $$ language plpgsql`,
  `drop trigger if exists tr_est_mov_imutavel on est_movimentos`,
  `create trigger tr_est_mov_imutavel before update or delete on est_movimentos for each row execute function est_mov_imutavel()`,
  `create table if not exists est_inventarios(id uuid primary key default gen_random_uuid(), numero bigserial, tipo varchar(10) not null check(tipo in('GERAL','LOCAL')), local_id uuid references est_locais(id), status varchar(20) not null default 'EM_CONTAGEM' check(status in('EM_CONTAGEM','FECHADO','CANCELADO')), observacao varchar(300) not null default '', criado_por varchar(120) not null, criado_em timestamptz not null default now(), fechado_por varchar(120) not null default '', fechado_em timestamptz)`,
  `create table if not exists est_inventario_itens(id uuid primary key default gen_random_uuid(), inventario_id uuid not null references est_inventarios(id) on delete cascade, produto_id uuid not null references est_produtos(id), local_id uuid not null references est_locais(id), saldo_sistema numeric(16,3) not null, contado numeric(16,3) check(contado is null or contado>=0), contado_por varchar(120) not null default '', contado_em timestamptz, conferido boolean not null default false, conferido_por varchar(120) not null default '', conferido_em timestamptz, ajustado boolean not null default false, unique(inventario_id,produto_id,local_id))`,
  `create index if not exists ix_est_inv_item_inv on est_inventario_itens(inventario_id)`,
  `create index if not exists ix_est_inv_item_pl on est_inventario_itens(produto_id,local_id)`,
];

const prontos = new WeakSet<Db>();
export async function garantirEstoque(db: Db) {
  if (prontos.has(db)) return;
  for (const s of ESTOQUE_DDL) await db.query(s);
  prontos.add(db);
}
