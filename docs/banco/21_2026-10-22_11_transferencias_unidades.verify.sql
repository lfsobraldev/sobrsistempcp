-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'est_transferencias_unidades' objeto,to_regclass('public.est_transferencias_unidades') is not null existe;

COMMIT;
