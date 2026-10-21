-- migrate:up
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

-- migrate:down
 drop index if exists ix_schema_migration_events_name;
 drop index if exists ix_schema_migrations_status;
 drop table if exists schema_migration_events;
 drop table if exists schema_migrations;
