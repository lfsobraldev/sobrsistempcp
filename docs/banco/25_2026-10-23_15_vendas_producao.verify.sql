-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_v_of_comercial' objeto,to_regclass('public.erp_v_of_comercial') is not null existe;

COMMIT;
