-- Somente leitura; executar após up ou antes de baseline.
BEGIN TRANSACTION READ ONLY;
-- Conferir as colunas/funções alteradas no arquivo fonte e no precheck.

COMMIT;
