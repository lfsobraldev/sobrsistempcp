-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Contas com os novos cargos precisariam ser migradas antes de restaurar a lista antiga; preservado.
select 'Cargos preservados' as resultado;
COMMIT;
