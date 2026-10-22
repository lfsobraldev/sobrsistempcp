-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin raise exception 'Sem reversão automática segura: preservar dados e controle. Desligar flags e usar plano de restauração.';end $pacote$;
COMMIT;
