-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'cst_taxas' objeto,to_regclass('public.cst_taxas') is not null existe;
select 'cst_precos_padrao' objeto,to_regclass('public.cst_precos_padrao') is not null existe;
select 'cst_padrao' objeto,to_regclass('public.cst_padrao') is not null existe;
select 'cst_horas_of' objeto,to_regclass('public.cst_horas_of') is not null existe;
select 'cst_of_resultados' objeto,to_regclass('public.cst_of_resultados') is not null existe;
select 'cst_v_valorizacao' objeto,to_regclass('public.cst_v_valorizacao') is not null existe;
select 'cst_v_margem_pedidos' objeto,to_regclass('public.cst_v_margem_pedidos') is not null existe;

COMMIT;
