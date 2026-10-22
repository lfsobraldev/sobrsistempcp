-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'fin_contas_bancarias' objeto,to_regclass('public.fin_contas_bancarias') is not null existe;
select 'fin_centros_custo' objeto,to_regclass('public.fin_centros_custo') is not null existe;
select 'ctb_contas' objeto,to_regclass('public.ctb_contas') is not null existe;
select 'ctb_regras_lancamento' objeto,to_regclass('public.ctb_regras_lancamento') is not null existe;
select 'ctb_lancamentos' objeto,to_regclass('public.ctb_lancamentos') is not null existe;
select 'ctb_partidas' objeto,to_regclass('public.ctb_partidas') is not null existe;
select 'ctb_pendencias' objeto,to_regclass('public.ctb_pendencias') is not null existe;
select 'fin_titulos' objeto,to_regclass('public.fin_titulos') is not null existe;
select 'fin_extratos' objeto,to_regclass('public.fin_extratos') is not null existe;
select 'fin_baixas' objeto,to_regclass('public.fin_baixas') is not null existe;
select 'fin_orcamento' objeto,to_regclass('public.fin_orcamento') is not null existe;

COMMIT;
