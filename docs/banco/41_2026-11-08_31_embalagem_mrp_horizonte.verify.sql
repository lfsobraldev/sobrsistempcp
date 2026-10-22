-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'emb_planos' objeto,to_regclass('public.emb_planos') is not null existe;
select 'emb_pallets' objeto,to_regclass('public.emb_pallets') is not null existe;
select 'emb_itens' objeto,to_regclass('public.emb_itens') is not null existe;
select 'emb_v_resumo' objeto,to_regclass('public.emb_v_resumo') is not null existe;

COMMIT;
