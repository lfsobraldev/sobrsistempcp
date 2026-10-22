-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'fis_emitente' objeto,to_regclass('public.fis_emitente') is not null existe;
select 'fis_cfop' objeto,to_regclass('public.fis_cfop') is not null existe;
select 'fis_produto_fiscal' objeto,to_regclass('public.fis_produto_fiscal') is not null existe;
select 'fis_parametros' objeto,to_regclass('public.fis_parametros') is not null existe;
select 'fis_regras' objeto,to_regclass('public.fis_regras') is not null existe;
select 'fis_provedores' objeto,to_regclass('public.fis_provedores') is not null existe;
select 'fis_documentos' objeto,to_regclass('public.fis_documentos') is not null existe;
select 'fis_creditos' objeto,to_regclass('public.fis_creditos') is not null existe;
select 'crm_clientes.uf' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='uf') existe;
select 'crm_clientes.ie' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='ie') existe;
select 'crm_clientes.regime_tributario' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='regime_tributario') existe;
select 'crm_clientes.contribuinte_icms' coluna,to_regclass('public.crm_clientes') is not null aplicavel,exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_clientes' and column_name='contribuinte_icms') existe;
COMMIT;
