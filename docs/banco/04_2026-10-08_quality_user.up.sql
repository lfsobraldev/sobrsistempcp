-- GERADO do arquivo canônico 2026-10-08_quality_user.sql; SHA256 2d0a4a92a13aca00741c9476df73858e27880b9a3d504e35ca2f43d08bb469c9
-- Destino: compartilhado (conferir arquitetura). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-08_quality_user.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-08_quality_user.sql' and checksum<>'2d0a4a92a13aca00741c9476df73858e27880b9a3d504e35ca2f43d08bb469c9') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists pcp_usuarios(
  id uuid primary key default gen_random_uuid(),
  usuario varchar(80) not null unique,
  nome varchar(150) not null,
  senha_hash text not null,
  perfil varchar(30) not null,
  ativo boolean not null default true,
  criado_por varchar(100) not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table pcp_usuarios
  drop constraint if exists ck_pcp_usuarios_perfil;

alter table pcp_usuarios
  add constraint ck_pcp_usuarios_perfil
  check (
    perfil in (
      'PCP',
      'GERENTE',
      'ENCARREGADO',
      'LIDER',
      'APONTADOR',
      'QUALIDADE'
    )
  );

create index if not exists ix_pcp_usuarios_ativo
  on pcp_usuarios(ativo,perfil);
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-08_quality_user.sql','2d0a4a92a13aca00741c9476df73858e27880b9a3d504e35ca2f43d08bb469c9',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-08_quality_user.sql','2d0a4a92a13aca00741c9476df73858e27880b9a3d504e35ca2f43d08bb469c9','APLICAR',current_user,'APLICADA');
COMMIT;
