-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'rh_cargos' objeto,to_regclass('public.rh_cargos') is not null existe;
select 'rh_colaboradores' objeto,to_regclass('public.rh_colaboradores') is not null existe;
select 'rh_ausencias' objeto,to_regclass('public.rh_ausencias') is not null existe;
select 'rh_ponto' objeto,to_regclass('public.rh_ponto') is not null existe;
select 'rh_folha' objeto,to_regclass('public.rh_folha') is not null existe;
select 'ehs_ocorrencias' objeto,to_regclass('public.ehs_ocorrencias') is not null existe;
select 'ehs_epis' objeto,to_regclass('public.ehs_epis') is not null existe;
select 'ehs_epi_entregas' objeto,to_regclass('public.ehs_epi_entregas') is not null existe;
select 'ehs_treinamentos' objeto,to_regclass('public.ehs_treinamentos') is not null existe;
select 'ehs_treinamento_registros' objeto,to_regclass('public.ehs_treinamento_registros') is not null existe;
select 'ehs_v_vencimentos' objeto,to_regclass('public.ehs_v_vencimentos') is not null existe;
select 'ps_projetos' objeto,to_regclass('public.ps_projetos') is not null existe;
select 'ps_tarefas' objeto,to_regclass('public.ps_tarefas') is not null existe;
select 'ps_custos' objeto,to_regclass('public.ps_custos') is not null existe;

COMMIT;
