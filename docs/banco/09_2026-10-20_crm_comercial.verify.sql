-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'crm_clientes' objeto,to_regclass('public.crm_clientes') is not null existe;
select 'crm_cliente_contatos' objeto,to_regclass('public.crm_cliente_contatos') is not null existe;
select 'crm_cliente_enderecos' objeto,to_regclass('public.crm_cliente_enderecos') is not null existe;
select 'crm_representantes' objeto,to_regclass('public.crm_representantes') is not null existe;
select 'crm_cliente_representantes' objeto,to_regclass('public.crm_cliente_representantes') is not null existe;
select 'crm_oportunidades' objeto,to_regclass('public.crm_oportunidades') is not null existe;
select 'crm_interacoes' objeto,to_regclass('public.crm_interacoes') is not null existe;
select 'crm_propostas' objeto,to_regclass('public.crm_propostas') is not null existe;
select 'crm_historico' objeto,to_regclass('public.crm_historico') is not null existe;
select 'pcp_controle_entregas.crm_cliente_id' coluna,to_regclass('public.pcp_controle_entregas') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_cliente_id') existe;
select 'pcp_controle_entregas.crm_representante_id' coluna,to_regclass('public.pcp_controle_entregas') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_representante_id') existe;
COMMIT;
