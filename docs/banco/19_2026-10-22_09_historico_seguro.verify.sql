-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
-- Conferir as colunas/funções alteradas no arquivo fonte e no precheck.
select 'pcp_programacoes.arquivada' coluna,to_regclass('public.pcp_programacoes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_programacoes' and column_name='arquivada') existe;
select 'pcp_programacoes.arquivada_em' coluna,to_regclass('public.pcp_programacoes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_programacoes' and column_name='arquivada_em') existe;
select 'pcp_programacoes.arquivada_por' coluna,to_regclass('public.pcp_programacoes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_programacoes' and column_name='arquivada_por') existe;
COMMIT;
