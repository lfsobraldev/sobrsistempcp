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
