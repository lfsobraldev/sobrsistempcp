-- MODELO para administrador, após 04 e ANTES de 08. Não executado pelo agente.
-- Conferir origem dos dados e backup. Não atribuir Sul por padrão.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:homologar-unidade',0));
-- Acrescentar SET LOCAL app.unidade_confirmada = 'SUL'; OU 'NORDESTE' após decisão formal.
do $homologacao$ begin
 if coalesce(current_setting('app.unidade_confirmada',true),'') not in('SUL','NORDESTE') then raise exception 'Unidade real não confirmada';end if;
 if exists(select 1 from erp_identidade_banco where singleton and unidade is not null and unidade<>current_setting('app.unidade_confirmada',true)) then raise exception 'Banco já homologado em outra unidade; não trocar identidade';end if;
end $homologacao$;
with n as(update erp_identidade_banco set unidade=current_setting('app.unidade_confirmada',true),homologado_por=current_user,homologado_em=now() where singleton and unidade is null returning *)
insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select current_user,'HOMOLOGAR_UNIDADE','IDENTIDADE_BANCO','singleton',to_jsonb(n) from n;
COMMIT;
-- Reversão: identidade é protegida contra troca. Restaurar backup em nova branch e reconfigurar a aplicação; não desativar trigger.
