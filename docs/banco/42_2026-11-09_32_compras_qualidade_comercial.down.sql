-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop view if exists vnd_v_funil;
drop view if exists vnd_v_pedido_revisoes;
drop view if exists qld_v_capa_eficacia;
create or replace function qld_encerrar_nc(p_nc uuid,p_ator text) returns void language plpgsql as $f$
declare n qld_nao_conformidades%rowtype;pend int;tot int;
begin
 select * into strict n from qld_nao_conformidades where id=p_nc for update;
 if n.status='ENCERRADA' then raise exception 'NC já encerrada';end if;
 if length(trim(n.causa_raiz))<5 then raise exception 'Registre a causa raiz antes de encerrar';end if;
 select count(*),count(*) filter (where concluida_em is null) into tot,pend from qld_acoes where nc_id=p_nc;
 if tot=0 then raise exception 'Registre ao menos uma ação (corretiva/preventiva)';end if;
 if pend>0 then raise exception 'Há % ação(ões) pendente(s)',pend;end if;
 update qld_nao_conformidades set status='ENCERRADA',encerrado_por=p_ator,encerrado_em=now() where id=p_nc;
end$f$;
drop function if exists qld_eficacia_verificar(uuid,boolean,text,text);
drop function if exists qld_eficacia_definir_prazo(uuid,date,text);
drop view if exists cmp_v_fornecedor_score;
drop table if exists cmp_fornecedor_avaliacoes;
drop function if exists cmp_cotacao_escolher(uuid,int,uuid,text,text);
drop view if exists cmp_v_cotacao_comparativa;
COMMIT;
