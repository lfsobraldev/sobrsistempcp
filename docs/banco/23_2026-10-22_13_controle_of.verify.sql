-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
-- Conferir as colunas/funções alteradas no arquivo fonte e no precheck.
select 'erp_ordens_fabricacao.bloqueada' coluna,to_regclass('public.erp_ordens_fabricacao') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='erp_ordens_fabricacao' and column_name='bloqueada') existe;
select 'erp_ordens_fabricacao.bloqueio_motivo' coluna,to_regclass('public.erp_ordens_fabricacao') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='erp_ordens_fabricacao' and column_name='bloqueio_motivo') existe;
COMMIT;
