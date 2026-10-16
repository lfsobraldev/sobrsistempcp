-- Local de Montagem por pedido (preenchimento manual; vazio quando não informado)
create table if not exists pcp_pedido_local (
  pedido varchar(60) primary key,
  local_montagem varchar(60) not null default '',
  atualizado_por varchar(80),
  atualizado_em timestamptz not null default now()
);
