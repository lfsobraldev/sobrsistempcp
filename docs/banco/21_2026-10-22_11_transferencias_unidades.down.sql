-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Não apaga documentos ou movimentos em trânsito.
select 'Transferências preservadas; desative a flag de ciclo industrial' as resultado;
COMMIT;
