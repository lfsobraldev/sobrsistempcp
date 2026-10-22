-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_sac_atendimentos' objeto,to_regclass('public.pcp_sac_atendimentos') is not null existe;
select 'pcp_sac_eventos' objeto,to_regclass('public.pcp_sac_eventos') is not null existe;

COMMIT;
