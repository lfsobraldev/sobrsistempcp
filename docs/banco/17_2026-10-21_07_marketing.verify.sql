-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_marketing_campanhas' objeto,to_regclass('public.erp_marketing_campanhas') is not null existe;
select 'erp_marketing_despesas' objeto,to_regclass('public.erp_marketing_despesas') is not null existe;
select 'erp_marketing_oportunidades' objeto,to_regclass('public.erp_marketing_oportunidades') is not null existe;

COMMIT;
