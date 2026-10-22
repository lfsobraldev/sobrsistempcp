-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
-- Conferir as colunas/funções alteradas no arquivo fonte e no precheck.
select 'pcp_produtos.tipo_pedido' coluna,to_regclass('public.pcp_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_produtos' and column_name='tipo_pedido') existe;
select 'pcp_produtos.montagem_engenharia' coluna,to_regclass('public.pcp_produtos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_produtos' and column_name='montagem_engenharia') existe;
COMMIT;
