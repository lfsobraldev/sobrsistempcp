-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Expand/contract: não apaga nem altera ledgers, revisões, filhos ou snapshots.
-- Desative ERP_CICLO_INDUSTRIAL; OFs integradas permanecem protegidas contra apontamento legado.
select 'Ciclo preservado; desative a flag e publique versão compatível para descontinuação' as resultado;
COMMIT;
