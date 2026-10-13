create table if not exists pcp_ia_log(
  id bigserial primary key,
  usuario varchar(120) not null,
  pergunta text not null default '',
  resposta text not null default '',
  anexos text[] not null default '{}',
  criado_em timestamptz not null default now()
);
create table if not exists pcp_romaneios_hist(
  id uuid primary key default gen_random_uuid(),
  pedido varchar(80) not null default '',
  cliente varchar(240) not null default '',
  transportadora varchar(160) not null default '',
  rota varchar(160) not null default '',
  total_itens int not null default 0,
  dados jsonb not null default '{}'::jsonb,
  origem varchar(20) not null default 'IA',
  criado_por varchar(120) not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists ix_romaneios_hist_pedido on pcp_romaneios_hist(pedido);
create index if not exists ix_romaneios_hist_cliente on pcp_romaneios_hist(cliente, criado_em desc);
