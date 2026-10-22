-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Preserva dados, eventos e marcação. A consulta de arquivados continua disponível.
select 'Histórico e auditoria preservados' as resultado;
COMMIT;
