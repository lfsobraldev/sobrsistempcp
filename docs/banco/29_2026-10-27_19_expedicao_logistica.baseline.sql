-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.
-- verify.sql é checagem inicial, não prova completa de equivalência.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Administrador: acrescente SET LOCAL app.baseline_confirmado = '2026-10-27_19_expedicao_logistica.sql'; abaixo, após conferência presencial.
do $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from '2026-10-27_19_expedicao_logistica.sql' then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name='2026-10-27_19_expedicao_logistica.sql' and checksum<>'10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b') then raise exception 'Checksum divergente';end if;
end $pacote$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-27_19_expedicao_logistica.sql','10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b',now(),current_user,'BASELINE') on conflict(name) do nothing;
insert into schema_migration_events(migration_name,checksum,acao,actor,status) select '2026-10-27_19_expedicao_logistica.sql','10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b','BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name='2026-10-27_19_expedicao_logistica.sql' and status='BASELINE');
COMMIT;
