-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'crm_pedidos_venda' objeto,to_regclass('public.crm_pedidos_venda') is not null existe;
select 'crm_pedido_venda_itens' objeto,to_regclass('public.crm_pedido_venda_itens') is not null existe;
select 'crm_pedido_venda_historico' objeto,to_regclass('public.crm_pedido_venda_historico') is not null existe;
select 'crm_comissao_regras' objeto,to_regclass('public.crm_comissao_regras') is not null existe;
select 'crm_comissoes' objeto,to_regclass('public.crm_comissoes') is not null existe;
select 'crm_clientes.limite_credito' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='limite_credito') existe;
select 'crm_clientes.condicao_pagamento' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='condicao_pagamento') existe;
COMMIT;
