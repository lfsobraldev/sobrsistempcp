-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'erp_substitutos' objeto,to_regclass('public.erp_substitutos') is not null existe;
select 'erp_of_substituicoes' objeto,to_regclass('public.erp_of_substituicoes') is not null existe;
select 'crm_pedido_venda_of' objeto,to_regclass('public.crm_pedido_venda_of') is not null existe;
select 'cst_retrabalho' objeto,to_regclass('public.cst_retrabalho') is not null existe;
select 'est_enderecos' objeto,to_regclass('public.est_enderecos') is not null existe;
select 'est_endereco_saldos' objeto,to_regclass('public.est_endereco_saldos') is not null existe;
select 'est_endereco_movs' objeto,to_regclass('public.est_endereco_movs') is not null existe;
select 'est_v_pendente_enderecar' objeto,to_regclass('public.est_v_pendente_enderecar') is not null existe;
select 'est_ciclico_regras' objeto,to_regclass('public.est_ciclico_regras') is not null existe;
select 'est_ciclico_contagens' objeto,to_regclass('public.est_ciclico_contagens') is not null existe;
select 'cmp_portal_tokens' objeto,to_regclass('public.cmp_portal_tokens') is not null existe;
select 'cmp_confirmacoes' objeto,to_regclass('public.cmp_confirmacoes') is not null existe;
select 'fin_ajustes' objeto,to_regclass('public.fin_ajustes') is not null existe;

COMMIT;
