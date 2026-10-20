-- Medições e liberação técnica versionadas. Apenas adiciona tabelas/colunas.
create extension if not exists pgcrypto;

alter table crm_oportunidades
  add column if not exists medicao_obrigatoria boolean not null default false;

create table if not exists pcp_medicao_revisoes (
  id uuid primary key default gen_random_uuid(),
  pedido varchar(80) not null,
  versao integer not null check (versao > 0),
  crm_cliente_id uuid references crm_clientes(id) on delete set null,
  crm_representante_id uuid references crm_representantes(id) on delete set null,
  data_medicao date not null,
  itens jsonb not null check (jsonb_typeof(itens)='array'),
  observacoes text not null default '',
  status varchar(40) not null default 'AGUARDANDO_CONFERENCIA'
    check (status in ('AGUARDANDO_CONFERENCIA','COM_PENDENCIAS','AGUARDANDO_APROVACAO','APROVADA_PARA_PRODUCAO')),
  pendencias text not null default '',
  medido_por varchar(160) not null,
  conferido_por varchar(160) not null default '',
  conferido_em timestamptz,
  aprovado_por varchar(160) not null default '',
  aprovado_em timestamptz,
  revisao_de uuid references pcp_medicao_revisoes(id) on delete restrict,
  criado_por varchar(160) not null,
  criado_em timestamptz not null default now(),
  unique(pedido,versao)
);
create index if not exists ix_pcp_medicao_pedido_versao on pcp_medicao_revisoes(pedido,versao desc);
create index if not exists ix_pcp_medicao_status on pcp_medicao_revisoes(status,criado_em desc);

create table if not exists pcp_medicao_eventos (
  id bigserial primary key,
  medicao_id uuid not null references pcp_medicao_revisoes(id) on delete restrict,
  pedido varchar(80) not null,
  tipo varchar(60) not null,
  descricao text not null default '',
  antes jsonb,
  depois jsonb,
  usuario varchar(160) not null,
  criado_em timestamptz not null default now()
);
create index if not exists ix_pcp_medicao_eventos_medicao on pcp_medicao_eventos(medicao_id,criado_em desc);

do $$
begin
  if to_regclass('public.pcp_controle_entregas') is not null then
    alter table pcp_controle_entregas add column if not exists medicao_obrigatoria boolean not null default false;
  end if;
  if to_regclass('public.pcp_comercial_especificacoes') is not null then
    alter table pcp_comercial_especificacoes add column if not exists medicao_id uuid references pcp_medicao_revisoes(id) on delete set null;
  end if;
  if to_regclass('public.pcp_sac_atendimentos') is not null then
    alter table pcp_sac_atendimentos add column if not exists crm_cliente_id uuid references crm_clientes(id) on delete set null;
    alter table pcp_sac_atendimentos add column if not exists crm_representante_id uuid references crm_representantes(id) on delete set null;
    alter table pcp_sac_atendimentos add column if not exists medicao_id uuid references pcp_medicao_revisoes(id) on delete set null;
    alter table pcp_sac_atendimentos add column if not exists item_referencia varchar(80) not null default '';
  end if;
end $$;