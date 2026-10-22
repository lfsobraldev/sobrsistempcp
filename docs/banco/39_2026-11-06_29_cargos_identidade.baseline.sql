-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.
-- verify.sql é checagem inicial, não prova completa de equivalência.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Administrador: acrescente SET LOCAL app.baseline_confirmado = '2026-11-06_29_cargos_identidade.sql'; abaixo, após conferência presencial.
do $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from '2026-11-06_29_cargos_identidade.sql' then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name='2026-11-06_29_cargos_identidade.sql' and checksum<>'87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48') then raise exception 'Checksum divergente';end if;
end $pacote$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-06_29_cargos_identidade.sql','87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48',now(),current_user,'BASELINE') on conflict(name) do nothing;
insert into schema_migration_events(migration_name,checksum,acao,actor,status) select '2026-11-06_29_cargos_identidade.sql','87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48','BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name='2026-11-06_29_cargos_identidade.sql' and status='BASELINE');
COMMIT;
