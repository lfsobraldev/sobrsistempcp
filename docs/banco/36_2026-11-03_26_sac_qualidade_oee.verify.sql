-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'sac_anexos' objeto,to_regclass('public.sac_anexos') is not null existe;

COMMIT;
