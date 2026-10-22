-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.
-- verify.sql é checagem inicial, não prova completa de equivalência.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Administrador: acrescente SET LOCAL app.baseline_confirmado = '2026-10-21_02_schema_migrations.sql'; abaixo, após conferência presencial.
do $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from '2026-10-21_02_schema_migrations.sql' then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_02_schema_migrations.sql' and checksum<>'024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708') then raise exception 'Checksum divergente';end if;
end $pacote$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_02_schema_migrations.sql','024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708',now(),current_user,'BASELINE') on conflict(name) do nothing;
insert into schema_migration_events(migration_name,checksum,acao,actor,status) select '2026-10-21_02_schema_migrations.sql','024463b51bead1b8ed375bd091a52dc67ee9013d701f731b78906c8f3d6d7708','BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name='2026-10-21_02_schema_migrations.sql' and status='BASELINE');
COMMIT;
