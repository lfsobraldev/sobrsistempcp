-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_pedido_local' objeto,to_regclass('public.pcp_pedido_local') is not null existe;

COMMIT;
