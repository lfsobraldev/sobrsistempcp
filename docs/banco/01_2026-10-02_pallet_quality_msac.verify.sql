-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_pallets' objeto,to_regclass('public.pcp_pallets') is not null existe;
select 'pcp_pallet_inspecoes' objeto,to_regclass('public.pcp_pallet_inspecoes') is not null existe;
select 'pcp_pallet_fotos' objeto,to_regclass('public.pcp_pallet_fotos') is not null existe;
select 'pcp_pallet_eventos' objeto,to_regclass('public.pcp_pallet_eventos') is not null existe;

COMMIT;
