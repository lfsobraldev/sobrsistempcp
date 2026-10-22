-- GERADO do arquivo canônico 2026-10-02_pallet_quality_msac.sql; SHA256 2d2164da721137d2f6ed27ec9081f26fe64d88e1e341309946688bb52f877a3b
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-02_pallet_quality_msac.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-02_pallet_quality_msac.sql' and checksum<>'2d2164da721137d2f6ed27ec9081f26fe64d88e1e341309946688bb52f877a3b') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-02_pallet_quality_msac.sql','2d2164da721137d2f6ed27ec9081f26fe64d88e1e341309946688bb52f877a3b',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-02_pallet_quality_msac.sql','2d2164da721137d2f6ed27ec9081f26fe64d88e1e341309946688bb52f877a3b','APLICAR',current_user,'APLICADA');
COMMIT;
