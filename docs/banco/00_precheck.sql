-- SOMENTE LEITURA. Executar separadamente em identidade, Sul e Nordeste.
BEGIN TRANSACTION READ ONLY;
select current_database() banco,current_user operador,version() versao_postgres,now() consulta;
select n.nspname esquema,c.relname objeto,c.relkind tipo from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p','v','m') order by objeto;
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname;
select conrelid::regclass tabela,conname,contype,pg_get_constraintdef(oid) definicao from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
select p.proname funcao,pg_get_function_identity_arguments(p.oid) argumentos from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname;
select to_regclass('public.schema_migrations') registro_migracoes,to_regclass('public.erp_identidade_banco') identidade,to_regclass('public.pcp_clientes_operacionais') clientes_operacionais;
-- Se schema_migrations existir, execute também 00b_historico.sql. Sua ausência não prova que SQL nunca foi aplicado.
COMMIT;
