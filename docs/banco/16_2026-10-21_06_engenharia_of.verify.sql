-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'est_unidades' objeto,to_regclass('public.est_unidades') is not null existe;
select 'est_produtos' objeto,to_regclass('public.est_produtos') is not null existe;
select 'est_produto_unidades' objeto,to_regclass('public.est_produto_unidades') is not null existe;
select 'est_locais' objeto,to_regclass('public.est_locais') is not null existe;
select 'est_saldos' objeto,to_regclass('public.est_saldos') is not null existe;
select 'est_movimentos' objeto,to_regclass('public.est_movimentos') is not null existe;
select 'est_inventarios' objeto,to_regclass('public.est_inventarios') is not null existe;
select 'est_inventario_itens' objeto,to_regclass('public.est_inventario_itens') is not null existe;
select 'erp_estruturas' objeto,to_regclass('public.erp_estruturas') is not null existe;
select 'erp_estrutura_itens' objeto,to_regclass('public.erp_estrutura_itens') is not null existe;
select 'erp_ordens_fabricacao' objeto,to_regclass('public.erp_ordens_fabricacao') is not null existe;
select 'erp_of_materiais' objeto,to_regclass('public.erp_of_materiais') is not null existe;
select 'est_produtos.classificacao' coluna,to_regclass('public.est_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_produtos' and column_name='classificacao') existe;
select 'est_produtos.classificacao' coluna,to_regclass('public.est_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_produtos' and column_name='classificacao') existe;
COMMIT;
