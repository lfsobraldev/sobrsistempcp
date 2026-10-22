-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_ia_log' objeto,to_regclass('public.pcp_ia_log') is not null existe;
select 'pcp_romaneios_hist' objeto,to_regclass('public.pcp_romaneios_hist') is not null existe;

COMMIT;
