-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_programacao_competencias' objeto,to_regclass('public.pcp_programacao_competencias') is not null existe;

COMMIT;
