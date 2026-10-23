-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_perda_motivos' objeto,to_regclass('public.pcp_perda_motivos') is not null existe;
select 'pcp_familia_responsaveis' objeto,to_regclass('public.pcp_familia_responsaveis') is not null existe;
select 'pcp_perdas_pecas' objeto,to_regclass('public.pcp_perdas_pecas') is not null existe;
select 'pcp_perdas_pecas_eventos' objeto,to_regclass('public.pcp_perdas_pecas_eventos') is not null existe;
select 'pcp_v_perdas_pecas' objeto,to_regclass('public.pcp_v_perdas_pecas') is not null existe;

COMMIT;
