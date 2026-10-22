-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'cmp_fornecedores' objeto,to_regclass('public.cmp_fornecedores') is not null existe;
select 'cmp_alcadas' objeto,to_regclass('public.cmp_alcadas') is not null existe;
select 'cmp_solicitacoes' objeto,to_regclass('public.cmp_solicitacoes') is not null existe;
select 'cmp_solicitacao_itens' objeto,to_regclass('public.cmp_solicitacao_itens') is not null existe;
select 'cmp_cotacao_propostas' objeto,to_regclass('public.cmp_cotacao_propostas') is not null existe;
select 'cmp_pedidos' objeto,to_regclass('public.cmp_pedidos') is not null existe;
select 'cmp_pedido_itens' objeto,to_regclass('public.cmp_pedido_itens') is not null existe;
select 'cmp_recebimentos' objeto,to_regclass('public.cmp_recebimentos') is not null existe;
select 'cmp_recebimento_itens' objeto,to_regclass('public.cmp_recebimento_itens') is not null existe;
select 'cmp_terceiros_movs' objeto,to_regclass('public.cmp_terceiros_movs') is not null existe;
select 'cmp_saldo_terceiros' objeto,to_regclass('public.cmp_saldo_terceiros') is not null existe;
select 'est_produtos.estoque_seguranca' coluna,to_regclass('public.est_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_produtos' and column_name='estoque_seguranca') existe;
select 'est_produtos.lead_time_dias' coluna,to_regclass('public.est_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_produtos' and column_name='lead_time_dias') existe;
select 'est_produtos.lote_compra' coluna,to_regclass('public.est_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_produtos' and column_name='lote_compra') existe;
COMMIT;
