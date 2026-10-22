-- GERADO do arquivo canônico 2026-10-21_fundacao_multiempresa.sql; SHA256 9b31f1b20d65bfacf82fede1765222f0feb2d3dd6cd6a0409e0248564a438468
-- Destino: compartilhado (conferir arquitetura). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_fundacao_multiempresa.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_fundacao_multiempresa.sql' and checksum<>'9b31f1b20d65bfacf82fede1765222f0feb2d3dd6cd6a0409e0248564a438468') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists pcp_empresas (
  id uuid primary key default gen_random_uuid(),
  codigo varchar(40) not null unique,
  razao_social varchar(240) not null,
  nome_fantasia varchar(240) not null default '',
  documento varchar(40) not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists pcp_filiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references pcp_empresas(id) on delete restrict,
  codigo varchar(40) not null,
  nome varchar(240) not null,
  documento varchar(40) not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo),
  unique (id, empresa_id)
);

create table if not exists pcp_usuario_empresas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references pcp_usuarios(id) on delete restrict,
  empresa_id uuid not null references pcp_empresas(id) on delete restrict,
  perfil varchar(30) not null check (
    perfil in (
      'PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE',
      'COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC'
    )
  ),
  escopo_filiais varchar(20) not null default 'TODAS'
    check (escopo_filiais in ('TODAS','SELECIONADAS')),
  ativo boolean not null default true,
  criado_por varchar(160) not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, empresa_id),
  unique (usuario_id, empresa_id)
);

create table if not exists pcp_usuario_filiais (
  usuario_empresa_id uuid not null,
  empresa_id uuid not null,
  filial_id uuid not null,
  criado_em timestamptz not null default now(),
  primary key (usuario_empresa_id, filial_id),
  foreign key (usuario_empresa_id, empresa_id)
    references pcp_usuario_empresas(id, empresa_id) on delete cascade,
  foreign key (filial_id, empresa_id)
    references pcp_filiais(id, empresa_id) on delete restrict
);

create index if not exists ix_pcp_filiais_empresa_ativo
  on pcp_filiais(empresa_id, ativo);
create index if not exists ix_pcp_usuario_empresas_empresa_ativo
  on pcp_usuario_empresas(empresa_id, ativo);
create index if not exists ix_pcp_usuario_filiais_filial
  on pcp_usuario_filiais(filial_id);

create table if not exists pcp_permissoes (
  codigo varchar(120) primary key,
  descricao varchar(240) not null,
  criado_em timestamptz not null default now()
);

create table if not exists pcp_perfil_permissoes (
  perfil varchar(30) not null check (
    perfil in (
      'PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE',
      'COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC'
    )
  ),
  permissao_codigo varchar(120) not null references pcp_permissoes(codigo) on delete restrict,
  criado_em timestamptz not null default now(),
  primary key (perfil, permissao_codigo)
);

create table if not exists pcp_auditoria_global (
  id bigserial primary key,
  empresa_id uuid references pcp_empresas(id) on delete set null,
  filial_id uuid,
  usuario_id uuid references pcp_usuarios(id) on delete set null,
  ator varchar(160) not null,
  acao varchar(80) not null,
  entidade varchar(120) not null,
  entidade_id varchar(160) not null default '',
  request_id varchar(160) not null default '',
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now(),
  check (filial_id is null or empresa_id is not null),
  foreign key (filial_id, empresa_id)
    references pcp_filiais(id, empresa_id) on delete restrict
);

create index if not exists ix_pcp_auditoria_global_empresa_criado
  on pcp_auditoria_global(empresa_id, criado_em desc);
create index if not exists ix_pcp_auditoria_global_entidade
  on pcp_auditoria_global(entidade, entidade_id, criado_em desc);
create index if not exists ix_pcp_auditoria_global_ator_criado
  on pcp_auditoria_global(ator, criado_em desc);

create or replace function pcp_auditoria_global_immutavel()
returns trigger as $$
begin
  raise exception 'pcp_auditoria_global é append-only: não pode ser alterada nem apagada';
end;
$$ language plpgsql;

drop trigger if exists trg_pcp_auditoria_global_immutavel
  on pcp_auditoria_global;
create trigger trg_pcp_auditoria_global_immutavel
  before update or delete on pcp_auditoria_global
  for each row execute function pcp_auditoria_global_immutavel();
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_fundacao_multiempresa.sql','9b31f1b20d65bfacf82fede1765222f0feb2d3dd6cd6a0409e0248564a438468',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_fundacao_multiempresa.sql','9b31f1b20d65bfacf82fede1765222f0feb2d3dd6cd6a0409e0248564a438468','APLICAR',current_user,'APLICADA');
COMMIT;
