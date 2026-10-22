-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_medicao_revisoes' objeto,to_regclass('public.pcp_medicao_revisoes') is not null existe;
select 'pcp_medicao_eventos' objeto,to_regclass('public.pcp_medicao_eventos') is not null existe;
select 'crm_oportunidades.medicao_obrigatoria' coluna,to_regclass('public.crm_oportunidades') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_oportunidades' and column_name='medicao_obrigatoria') existe;
select 'pcp_controle_entregas.medicao_obrigatoria' coluna,to_regclass('public.pcp_controle_entregas') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='medicao_obrigatoria') existe;
select 'pcp_comercial_especificacoes.medicao_id' coluna,to_regclass('public.pcp_comercial_especificacoes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_comercial_especificacoes' and column_name='medicao_id') existe;
select 'pcp_sac_atendimentos.crm_cliente_id' coluna,to_regclass('public.pcp_sac_atendimentos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_sac_atendimentos' and column_name='crm_cliente_id') existe;
select 'pcp_sac_atendimentos.crm_representante_id' coluna,to_regclass('public.pcp_sac_atendimentos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_sac_atendimentos' and column_name='crm_representante_id') existe;
select 'pcp_sac_atendimentos.medicao_id' coluna,to_regclass('public.pcp_sac_atendimentos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_sac_atendimentos' and column_name='medicao_id') existe;
select 'pcp_sac_atendimentos.item_referencia' coluna,to_regclass('public.pcp_sac_atendimentos') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_sac_atendimentos' and column_name='item_referencia') existe;
COMMIT;
