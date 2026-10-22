-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_pallet_nao_conformidades' objeto,to_regclass('public.pcp_pallet_nao_conformidades') is not null existe;
select 'pcp_pallet_medicoes' objeto,to_regclass('public.pcp_pallet_medicoes') is not null existe;
select 'pcp_pallet_fotos.nc_id' coluna,to_regclass('public.pcp_pallet_fotos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_pallet_fotos' and column_name='nc_id') existe;
select 'pcp_pallet_fotos.tipo' coluna,to_regclass('public.pcp_pallet_fotos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_pallet_fotos' and column_name='tipo') existe;
COMMIT;
