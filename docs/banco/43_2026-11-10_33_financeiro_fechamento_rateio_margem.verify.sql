-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'fin_periodos' objeto,to_regclass('public.fin_periodos') is not null existe;
select 'fin_periodo_historico' objeto,to_regclass('public.fin_periodo_historico') is not null existe;
select 'fin_rateio_regras' objeto,to_regclass('public.fin_rateio_regras') is not null existe;
select 'fin_rateio_apuracoes' objeto,to_regclass('public.fin_rateio_apuracoes') is not null existe;
select 'fin_v_margem_pedido' objeto,to_regclass('public.fin_v_margem_pedido') is not null existe;
select 'fin_v_margem_pedido_calc' objeto,to_regclass('public.fin_v_margem_pedido_calc') is not null existe;
select 'fin_v_margem_cliente' objeto,to_regclass('public.fin_v_margem_cliente') is not null existe;

COMMIT;
