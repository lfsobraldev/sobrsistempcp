-- Migração idempotente • Módulo de Inspeção / Qualidade / MSAC de Pallets
create extension if not exists pgcrypto;
create table if not exists pcp_pallets(
  id uuid primary key default gen_random_uuid(), codigo varchar(60) not null unique, pedido varchar(60) not null,
  cliente varchar(240) not null default '', filtro varchar(60) not null default '', pallet varchar(60) not null,
  tipo_produto varchar(240) not null default '', quantidade numeric(16,3) not null default 0, jogos numeric(16,3) not null default 0,
  turno varchar(20) not null default 'A', destino varchar(240) not null default '', montador varchar(160) not null default '',
  conferente varchar(160) not null default '', observacao text not null default '', status varchar(40) not null default 'AGUARDANDO_INSPECAO',
  qualidade_status varchar(30) not null default 'PENDENTE', qualidade_usuario varchar(160) not null default '', qualidade_em timestamptz,
  qualidade_observacao text not null default '', msac_status varchar(30) not null default 'PENDENTE', msac_usuario varchar(160) not null default '',
  msac_em timestamptz, msac_observacao text not null default '', bloqueio_motivo text not null default '', bloqueado_por varchar(160) not null default '',
  bloqueado_em timestamptz, criado_por varchar(160) not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists pcp_pallet_inspecoes(id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, area varchar(30) not null, resultado varchar(30) not null default 'CONFORME', checklist jsonb not null default '{}'::jsonb, observacao text not null default '', usuario varchar(160) not null default '', criado_em timestamptz not null default now());
create table if not exists pcp_pallet_fotos(id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, data_url text not null, legenda varchar(300) not null default '', area varchar(30) not null default 'QUALIDADE', usuario varchar(160) not null default '', criado_em timestamptz not null default now());
create table if not exists pcp_pallet_eventos(id bigserial primary key, pallet_id uuid not null references pcp_pallets(id) on delete cascade, usuario varchar(160) not null default '', tipo varchar(80) not null, descricao text not null default '', antes jsonb, depois jsonb, criado_em timestamptz not null default now());
create index if not exists ix_pcp_pallets_status on pcp_pallets(status,atualizado_em desc);
create index if not exists ix_pcp_pallets_pedido on pcp_pallets(pedido);
create index if not exists ix_pcp_pallet_inspecoes on pcp_pallet_inspecoes(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_fotos on pcp_pallet_fotos(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_eventos on pcp_pallet_eventos(pallet_id,criado_em desc);
