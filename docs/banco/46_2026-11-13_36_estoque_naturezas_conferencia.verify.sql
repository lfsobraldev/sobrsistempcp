-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'est_naturezas' objeto,to_regclass('public.est_naturezas') is not null existe;
select 'est_v_saldo_natureza' objeto,to_regclass('public.est_v_saldo_natureza') is not null existe;
select 'est_v_consumo_of' objeto,to_regclass('public.est_v_consumo_of') is not null existe;
select 'est_consumo_conferencias' objeto,to_regclass('public.est_consumo_conferencias') is not null existe;
select 'est_v_consumo_conferir' objeto,to_regclass('public.est_v_consumo_conferir') is not null existe;
select 'est_v_apontamentos_em_lote' objeto,to_regclass('public.est_v_apontamentos_em_lote') is not null existe;
select 'est_locais.natureza' coluna,to_regclass('public.est_locais') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_locais' and column_name='natureza') existe;
select 'est_locais.tipo_local' coluna,to_regclass('public.est_locais') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_locais' and column_name='tipo_local') existe;
select 'est_locais.responsavel' coluna,to_regclass('public.est_locais') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='est_locais' and column_name='responsavel') existe;
COMMIT;
