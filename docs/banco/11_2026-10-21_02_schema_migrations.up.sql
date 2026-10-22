-- GERADO do arquivo canônico 2026-10-21_02_schema_migrations.sql; SHA256 024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708
-- Destino: compartilhado (conferir arquitetura). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_02_schema_migrations.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_02_schema_migrations.sql' and checksum<>'024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists schema_migrations (
  name varchar(200) primary key,
  checksum char(64) not null,
  aplicada_em timestamptz,
  aplicada_por varchar(160),
  duracao_ms bigint not null default 0,
  status varchar(20) not null default 'APLICADA' check (status in ('APLICADA', 'BASELINE', 'REVERTIDA', 'FALHOU')),
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists schema_migration_events (
  id bigserial primary key,
  migration_name varchar(200) not null,
  checksum char(64) not null,
  acao varchar(20) not null check (acao in ('BASELINE', 'APLICAR', 'REVERTER')),
  actor varchar(160) not null,
  status varchar(20) not null check (status in ('BASELINE', 'APLICADA', 'REVERTIDA', 'FALHOU')),
  duracao_ms bigint not null default 0,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists ix_schema_migrations_status on schema_migrations(status, aplicada_em desc);
create index if not exists ix_schema_migration_events_name on schema_migration_events(migration_name, criado_em desc);
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_02_schema_migrations.sql','024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_02_schema_migrations.sql','024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708','APLICAR',current_user,'APLICADA');
COMMIT;
