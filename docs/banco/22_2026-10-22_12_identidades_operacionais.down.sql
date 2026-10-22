-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Identidades e códigos preservados. Contrato apenas de expansão; não remove vínculos.
select 'Identidades comerciais preservadas' as resultado;
COMMIT;
