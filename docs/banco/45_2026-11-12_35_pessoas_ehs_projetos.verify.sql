-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'rh_banco_horas_lanc' objeto,to_regclass('public.rh_banco_horas_lanc') is not null existe;
select 'rh_v_banco_horas' objeto,to_regclass('public.rh_v_banco_horas') is not null existe;
select 'rh_v_ferias_saldo' objeto,to_regclass('public.rh_v_ferias_saldo') is not null existe;
select 'rh_v_colaborador_custo' objeto,to_regclass('public.rh_v_colaborador_custo') is not null existe;
select 'ehs_inspecoes' objeto,to_regclass('public.ehs_inspecoes') is not null existe;
select 'ps_tarefa_dependencias' objeto,to_regclass('public.ps_tarefa_dependencias') is not null existe;
select 'ehs_ocorrencias.cat_numero' coluna,to_regclass('public.ehs_ocorrencias') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='ehs_ocorrencias' and column_name='cat_numero') existe;
select 'ehs_ocorrencias.cat_data' coluna,to_regclass('public.ehs_ocorrencias') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='ehs_ocorrencias' and column_name='cat_data') existe;
COMMIT;
