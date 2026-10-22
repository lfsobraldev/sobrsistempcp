-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_perdas_producao' objeto,to_regclass('public.pcp_perdas_producao') is not null existe;
select 'pcp_capacidades_maquina' objeto,to_regclass('public.pcp_capacidades_maquina') is not null existe;
select 'pcp_metas_maquina' objeto,to_regclass('public.pcp_metas_maquina') is not null existe;
select 'pcp_setups' objeto,to_regclass('public.pcp_setups') is not null existe;
select 'pcp_acoes_operacionais' objeto,to_regclass('public.pcp_acoes_operacionais') is not null existe;
select 'pcp_andon.prioridade' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='prioridade') existe;
select 'pcp_andon.responsavel' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='responsavel') existe;
select 'pcp_andon.assumido_por' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='assumido_por') existe;
select 'pcp_andon.assumido_em' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='assumido_em') existe;
select 'pcp_andon.tratamento_em' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='tratamento_em') existe;
select 'pcp_andon.resolvido_por' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='resolvido_por') existe;
select 'pcp_andon.observacao_final' coluna,to_regclass('public.pcp_andon') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_andon' and column_name='observacao_final') existe;
COMMIT;
