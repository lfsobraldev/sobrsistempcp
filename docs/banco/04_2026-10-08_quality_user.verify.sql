-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_usuarios' objeto,to_regclass('public.pcp_usuarios') is not null existe;

COMMIT;
