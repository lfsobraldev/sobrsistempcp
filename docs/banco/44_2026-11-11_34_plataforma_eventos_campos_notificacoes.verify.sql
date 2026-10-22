-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_eventos' objeto,to_regclass('public.erp_eventos') is not null existe;
select 'erp_campos_def' objeto,to_regclass('public.erp_campos_def') is not null existe;
select 'erp_campos_valores' objeto,to_regclass('public.erp_campos_valores') is not null existe;
select 'erp_notificacoes' objeto,to_regclass('public.erp_notificacoes') is not null existe;
select 'erp_notificacoes_leituras' objeto,to_regclass('public.erp_notificacoes_leituras') is not null existe;

COMMIT;
