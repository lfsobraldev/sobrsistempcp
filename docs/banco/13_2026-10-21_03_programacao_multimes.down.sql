-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
-- Reversão lógica sem eliminar dados ou estrutura; reativação é manual e auditada.
with alterados as (
 update pcp_programacao_lotes set status='DESFEITO',desfeito_em=now() where status='ATIVO' returning *
)
insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,entidade_id,antes,depois)
select f.empresa_id,a.filial_id,'MIGRATION_DOWN','REVERTER_MIGRACAO','PROGRAMACAO_MENSAL',a.id::text,
 jsonb_build_object('status','ATIVO'),jsonb_build_object('status','DESFEITO')
from alterados a join pcp_filiais f on f.id=a.filial_id;
-- A projeção volta automaticamente aos registros legados. Nenhum DROP/DELETE.
COMMIT;
