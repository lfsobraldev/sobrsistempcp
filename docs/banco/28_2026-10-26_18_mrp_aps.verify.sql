-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_of_agenda' objeto,to_regclass('public.erp_of_agenda') is not null existe;
select 'erp_v_ops_abertas' objeto,to_regclass('public.erp_v_ops_abertas') is not null existe;

COMMIT;
