-- Somente após precheck confirmar a existência de ambas as tabelas.
BEGIN TRANSACTION READ ONLY;
select name,checksum,status,aplicada_em,aplicada_por,erro from schema_migrations order by name;
select migration_name,acao,status,actor,criado_em,erro from schema_migration_events order by id;
COMMIT;
