-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_cargos_nivel' objeto,to_regclass('public.erp_cargos_nivel') is not null existe;
select 'erp_autorizacoes' objeto,to_regclass('public.erp_autorizacoes') is not null existe;
select 'erp_aprovacao_regras' objeto,to_regclass('public.erp_aprovacao_regras') is not null existe;
select 'erp_aprovacoes' objeto,to_regclass('public.erp_aprovacoes') is not null existe;
select 'erp_aprovacao_etapas' objeto,to_regclass('public.erp_aprovacao_etapas') is not null existe;
select 'erp_delegacoes' objeto,to_regclass('public.erp_delegacoes') is not null existe;
select 'erp_v_aprovacoes_pendentes' objeto,to_regclass('public.erp_v_aprovacoes_pendentes') is not null existe;
select 'erp_auditoria' objeto,to_regclass('public.erp_auditoria') is not null existe;
select 'erp_config' objeto,to_regclass('public.erp_config') is not null existe;

COMMIT;
