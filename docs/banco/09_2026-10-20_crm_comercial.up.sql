-- GERADO do arquivo canônico 2026-10-20_crm_comercial.sql; SHA256 3cc9545c10d0adf76aea812554deb684f64024b93a6cd300c0ef1a5cb246a43e
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-20_crm_comercial.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-20_crm_comercial.sql' and checksum<>'3cc9545c10d0adf76aea812554deb684f64024b93a6cd300c0ef1a5cb246a43e') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- CRM comercial: estruturas novas e aditivas; preserva controles de pedido existentes.
create extension if not exists pgcrypto;

create table if not exists crm_clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social varchar(240) not null,
  nome_fantasia varchar(240) not null default '',
  documento varchar(40) not null default '',
  email varchar(240) not null default '',
  telefone varchar(50) not null default '',
  origem varchar(80) not null default '',
  observacoes text not null default '',
  ativo boolean not null default true,
  criado_por varchar(160) not null,
  atualizado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_crm_clientes_documento
  on crm_clientes (regexp_replace(documento, '[^[:alnum:]]', '', 'g'))
  where documento <> '';
create index if not exists ix_crm_clientes_nome on crm_clientes (lower(razao_social));

create table if not exists crm_cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references crm_clientes(id) on delete cascade,
  nome varchar(180) not null,
  cargo varchar(120) not null default '',
  email varchar(240) not null default '',
  telefone varchar(50) not null default '',
  principal boolean not null default false,
  criado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_crm_cliente_contatos_cliente on crm_cliente_contatos(cliente_id);

create table if not exists crm_cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references crm_clientes(id) on delete cascade,
  tipo varchar(40) not null default 'COMERCIAL',
  logradouro varchar(240) not null default '',
  numero varchar(40) not null default '',
  complemento varchar(120) not null default '',
  bairro varchar(120) not null default '',
  cidade varchar(160) not null default '',
  uf varchar(2) not null default '',
  cep varchar(12) not null default '',
  principal boolean not null default false,
  criado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_crm_cliente_enderecos_cliente on crm_cliente_enderecos(cliente_id);

create table if not exists crm_representantes (
  id uuid primary key default gen_random_uuid(),
  nome varchar(180) not null,
  documento varchar(40) not null default '',
  email varchar(240) not null default '',
  telefone varchar(50) not null default '',
  regiao varchar(160) not null default '',
  comissao_percentual numeric(7,4) not null default 0 check (comissao_percentual between 0 and 100),
  ativo boolean not null default true,
  observacoes text not null default '',
  criado_por varchar(160) not null,
  atualizado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_crm_representantes_documento
  on crm_representantes (regexp_replace(documento, '[^[:alnum:]]', '', 'g'))
  where documento <> '';

create table if not exists crm_cliente_representantes (
  cliente_id uuid not null references crm_clientes(id) on delete cascade,
  representante_id uuid not null references crm_representantes(id) on delete restrict,
  ativo boolean not null default true,
  criado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, representante_id)
);
create index if not exists ix_crm_cliente_representantes_representante
  on crm_cliente_representantes(representante_id, ativo);

create table if not exists crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references crm_clientes(id) on delete restrict,
  contato_id uuid references crm_cliente_contatos(id) on delete set null,
  representante_id uuid references crm_representantes(id) on delete set null,
  titulo varchar(240) not null,
  descricao text not null default '',
  origem varchar(80) not null,
  status varchar(24) not null default 'NOVA'
    check (status in ('NOVA','QUALIFICADA','PROPOSTA','NEGOCIACAO','GANHA','PERDIDA','CONVERTIDA')),
  valor_estimado numeric(16,2) not null default 0 check (valor_estimado >= 0),
  fechamento_previsto date,
  proxima_acao varchar(500) not null default '',
  proxima_acao_em date,
  pedido varchar(80),
  criado_por varchar(160) not null,
  atualizado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  convertido_em timestamptz
);
create unique index if not exists ux_crm_oportunidades_pedido
  on crm_oportunidades(pedido) where pedido is not null;
create index if not exists ix_crm_oportunidades_status_acao
  on crm_oportunidades(status, proxima_acao_em);
create index if not exists ix_crm_oportunidades_cliente
  on crm_oportunidades(cliente_id, criado_em desc);

create table if not exists crm_interacoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references crm_oportunidades(id) on delete cascade,
  cliente_id uuid references crm_clientes(id) on delete cascade,
  tipo varchar(40) not null,
  descricao text not null,
  proxima_acao varchar(500) not null default '',
  proxima_acao_em date,
  criado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  constraint ck_crm_interacoes_origem check (oportunidade_id is not null or cliente_id is not null)
);
create index if not exists ix_crm_interacoes_oportunidade
  on crm_interacoes(oportunidade_id, criado_em desc);
create index if not exists ix_crm_interacoes_cliente on crm_interacoes(cliente_id,criado_em desc);

create table if not exists crm_propostas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  oportunidade_id uuid not null references crm_oportunidades(id) on delete restrict,
  status varchar(20) not null default 'RASCUNHO'
    check (status in ('RASCUNHO','ENVIADA','NEGOCIACAO','ACEITA','RECUSADA','EXPIRADA')),
  validade date,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  total numeric(16,2) not null default 0 check (total >= 0),
  condicoes text not null default '',
  observacoes text not null default '',
  criado_por varchar(160) not null,
  atualizado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_crm_propostas_oportunidade
  on crm_propostas(oportunidade_id, criado_em desc);
create unique index if not exists ux_crm_proposta_aceita_oportunidade
  on crm_propostas(oportunidade_id) where status='ACEITA';

create table if not exists crm_historico (
  id bigserial primary key,
  entidade varchar(30) not null,
  entidade_id uuid not null,
  tipo varchar(60) not null,
  descricao text not null default '',
  antes jsonb,
  depois jsonb,
  usuario varchar(160) not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_crm_historico_entidade
  on crm_historico(entidade, entidade_id, criado_em desc);

-- Vincula novos pedidos da conversão ao cadastro central sem reescrever nomes antigos.
do $$
begin
  if to_regclass('public.pcp_controle_entregas') is not null then
    alter table pcp_controle_entregas add column if not exists crm_cliente_id uuid;
    alter table pcp_controle_entregas add column if not exists crm_representante_id uuid;
    if not exists (select 1 from pg_constraint where conname='fk_pcp_controle_entregas_crm_cliente') then
      alter table pcp_controle_entregas add constraint fk_pcp_controle_entregas_crm_cliente
        foreign key (crm_cliente_id) references crm_clientes(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname='fk_pcp_controle_entregas_crm_representante') then
      alter table pcp_controle_entregas add constraint fk_pcp_controle_entregas_crm_representante
        foreign key (crm_representante_id) references crm_representantes(id) on delete set null;
    end if;
    create index if not exists ix_pcp_controle_entregas_crm_cliente
      on pcp_controle_entregas(crm_cliente_id) where crm_cliente_id is not null;
  end if;
end $$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-20_crm_comercial.sql','3cc9545c10d0adf76aea812554deb684f64024b93a6cd300c0ef1a5cb246a43e',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-20_crm_comercial.sql','3cc9545c10d0adf76aea812554deb684f64024b93a6cd300c0ef1a5cb246a43e','APLICAR',current_user,'APLICADA');
COMMIT;
