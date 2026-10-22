-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_programacao_lotes' objeto,to_regclass('public.pcp_programacao_lotes') is not null existe;
select 'pcp_programacao_mensal_itens' objeto,to_regclass('public.pcp_programacao_mensal_itens') is not null existe;
select 'pcp_programacao_acessos' objeto,to_regclass('public.pcp_programacao_acessos') is not null existe;
select 'pcp_programacao_mensal_base' objeto,to_regclass('public.pcp_programacao_mensal_base') is not null existe;
select 'pcp_programacao_mensal_efetiva' objeto,to_regclass('public.pcp_programacao_mensal_efetiva') is not null existe;

COMMIT;
