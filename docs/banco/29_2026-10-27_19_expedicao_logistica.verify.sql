-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'exp_transportadoras' objeto,to_regclass('public.exp_transportadoras') is not null existe;
select 'exp_remessas' objeto,to_regclass('public.exp_remessas') is not null existe;
select 'exp_remessa_itens' objeto,to_regclass('public.exp_remessa_itens') is not null existe;
select 'exp_remessa_pallets' objeto,to_regclass('public.exp_remessa_pallets') is not null existe;
select 'exp_ocorrencias' objeto,to_regclass('public.exp_ocorrencias') is not null existe;
select 'exp_devolucoes' objeto,to_regclass('public.exp_devolucoes') is not null existe;
select 'exp_eventos_faturamento' objeto,to_regclass('public.exp_eventos_faturamento') is not null existe;
select 'exp_portal_tokens' objeto,to_regclass('public.exp_portal_tokens') is not null existe;

COMMIT;
