-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_lider_unidade_etapas' objeto,to_regclass('public.pcp_lider_unidade_etapas') is not null existe;

COMMIT;
