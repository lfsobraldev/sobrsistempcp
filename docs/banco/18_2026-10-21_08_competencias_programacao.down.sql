-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Desligar ERP_PROGRAMACAO_STATUS na aplicação; preservar documentos e auditoria.
drop trigger if exists lote_competencia_controlada on pcp_programacao_lotes;
select 'Competências e histórico preservados' as resultado;
COMMIT;
