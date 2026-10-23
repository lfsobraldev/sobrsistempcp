-- Somente leitura. Cole no SQL Editor do Neon do MESMO banco que o site usa e me envie o resultado.
select
  current_database() as banco,
  to_regprocedure('erp_painel_funcao(text)') is not null as painel_funcao_existe,
  (select count(*) from schema_migrations where status='APLICADA') as migracoes_aplicadas,
  (select string_agg(name||':'||status, E'\n' order by name) from schema_migrations where name >= '2026-11-10') as migracoes_recentes;
