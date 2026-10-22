-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
select 'schema_migrations' objeto,to_regclass('public.schema_migrations') is not null existe;
select 'schema_migration_events' objeto,to_regclass('public.schema_migration_events') is not null existe;

COMMIT;
