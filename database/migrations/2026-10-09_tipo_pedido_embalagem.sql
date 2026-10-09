-- Classificação de pedido para regras especiais de embalagem
alter table pcp_produtos
  add column if not exists tipo_pedido varchar(20) not null default 'NORMAL';

update pcp_produtos
set tipo_pedido = 'NORMAL'
where tipo_pedido is null
   or upper(tipo_pedido) not in ('NORMAL','REVENDA','ENGENHARIA');

create index if not exists ix_pcp_prod_tipo_pedido
  on pcp_produtos(programacao_id, pedido, tipo_pedido);
