-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'qld_instrumentos' objeto,to_regclass('public.qld_instrumentos') is not null existe;
select 'qld_planos' objeto,to_regclass('public.qld_planos') is not null existe;
select 'qld_plano_caracteristicas' objeto,to_regclass('public.qld_plano_caracteristicas') is not null existe;
select 'qld_lotes_inspecao' objeto,to_regclass('public.qld_lotes_inspecao') is not null existe;
select 'qld_medicoes' objeto,to_regclass('public.qld_medicoes') is not null existe;
select 'qld_nao_conformidades' objeto,to_regclass('public.qld_nao_conformidades') is not null existe;
select 'qld_acoes' objeto,to_regclass('public.qld_acoes') is not null existe;

COMMIT;
