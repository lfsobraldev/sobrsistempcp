-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Desativação operacional: ERP_MULTIUNIDADE=disabled no servidor. Não apagar identificação ou dados.
select 'Estruturas e identidade preservadas; desativação exige configuração do servidor' as orientacao;
COMMIT;
