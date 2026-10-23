-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'cert_nfs' objeto,to_regclass('public.cert_nfs') is not null existe;
select 'cert_nf_itens' objeto,to_regclass('public.cert_nf_itens') is not null existe;
select 'cert_pedido_nfs' objeto,to_regclass('public.cert_pedido_nfs') is not null existe;
select 'cert_consumos' objeto,to_regclass('public.cert_consumos') is not null existe;
select 'cert_v_saldo_item' objeto,to_regclass('public.cert_v_saldo_item') is not null existe;
select 'cert_v_saldo_produto' objeto,to_regclass('public.cert_v_saldo_produto') is not null existe;

COMMIT;
