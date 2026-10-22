-- Só registrar após conferir TODOS os objetos, colunas, constraints, índices, funções e dados.
-- verify.sql é checagem inicial, não prova completa de equivalência.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Administrador: acrescente SET LOCAL app.baseline_confirmado = '2026-11-10_33_financeiro_fechamento_rateio_margem.sql'; abaixo, após conferência presencial.
do $pacote$ begin
 if current_setting('app.baseline_confirmado',true) is distinct from '2026-11-10_33_financeiro_fechamento_rateio_margem.sql' then raise exception 'Baseline não confirmado pelo administrador';end if;
 if exists(select 1 from schema_migrations where name='2026-11-10_33_financeiro_fechamento_rateio_margem.sql' and checksum<>'e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c') then raise exception 'Checksum divergente';end if;
end $pacote$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-10_33_financeiro_fechamento_rateio_margem.sql','e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c',now(),current_user,'BASELINE') on conflict(name) do nothing;
insert into schema_migration_events(migration_name,checksum,acao,actor,status) select '2026-11-10_33_financeiro_fechamento_rateio_margem.sql','e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c','BASELINE',current_user,'BASELINE' where exists(select 1 from schema_migrations where name='2026-11-10_33_financeiro_fechamento_rateio_margem.sql' and status='BASELINE');
COMMIT;
