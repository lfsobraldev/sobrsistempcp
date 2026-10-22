-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_identidade_banco' objeto,to_regclass('public.erp_identidade_banco') is not null existe;
select 'pcp_programacao_mensal_base' objeto,to_regclass('public.pcp_programacao_mensal_base') is not null existe;

COMMIT;
