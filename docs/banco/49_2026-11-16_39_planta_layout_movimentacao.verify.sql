-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'wms_plantas' objeto,to_regclass('public.wms_plantas') is not null existe;
select 'wms_layout_blocos' objeto,to_regclass('public.wms_layout_blocos') is not null existe;
select 'wms_peca_posicoes' objeto,to_regclass('public.wms_peca_posicoes') is not null existe;
select 'wms_movimentacoes' objeto,to_regclass('public.wms_movimentacoes') is not null existe;
select 'wms_v_localizador' objeto,to_regclass('public.wms_v_localizador') is not null existe;

COMMIT;
