-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'wms_v_localizador' objeto,to_regclass('public.wms_v_localizador') is not null existe;
select 'wms_v_localizador_end' objeto,to_regclass('public.wms_v_localizador_end') is not null existe;
select 'wms_v_sem_endereco' objeto,to_regclass('public.wms_v_sem_endereco') is not null existe;
select 'pcp_rastro_leituras' objeto,to_regclass('public.pcp_rastro_leituras') is not null existe;
select 'pcp_v_rastro_atual' objeto,to_regclass('public.pcp_v_rastro_atual') is not null existe;
select 'pcp_v_rastro_setor_datas' objeto,to_regclass('public.pcp_v_rastro_setor_datas') is not null existe;
select 'pcp_v_rastro_paradas' objeto,to_regclass('public.pcp_v_rastro_paradas') is not null existe;

COMMIT;
