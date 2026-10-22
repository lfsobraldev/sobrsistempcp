-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.
-- verify.sql é checagem inicial, não prova completa de equivalência.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Administrador: acrescente SET LOCAL app.baseline_confirmado = '2026-10-29_21_fiscal.sql'; abaixo, após conferência presencial.
do $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from '2026-10-29_21_fiscal.sql' then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name='2026-10-29_21_fiscal.sql' and checksum<>'43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10') then raise exception 'Checksum divergente';end if;
end $pacote$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-29_21_fiscal.sql','43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10',now(),current_user,'BASELINE') on conflict(name) do nothing;
insert into schema_migration_events(migration_name,checksum,acao,actor,status) select '2026-10-29_21_fiscal.sql','43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10','BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name='2026-10-29_21_fiscal.sql' and status='BASELINE');
COMMIT;
