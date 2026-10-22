-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'pcp_controle_entregas' objeto,to_regclass('public.pcp_controle_entregas') is not null existe;
select 'pcp_clientes_operacionais' objeto,to_regclass('public.pcp_clientes_operacionais') is not null existe;
select 'crm_clientes.codigo' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='codigo') existe;
select 'crm_representantes.codigo' coluna,to_regclass('public.crm_representantes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_representantes' and column_name='codigo') existe;
select 'pcp_controle_entregas.crm_cliente_id' coluna,to_regclass('public.pcp_controle_entregas') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_cliente_id') existe;
select 'pcp_controle_entregas.crm_representante_id' coluna,to_regclass('public.pcp_controle_entregas') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_representante_id') existe;
COMMIT;
