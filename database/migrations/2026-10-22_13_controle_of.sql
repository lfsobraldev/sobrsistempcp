-- depends-on: 2026-10-22_10_ciclo_industrial.sql
-- scope: operational
-- migrate:up
alter table erp_ordens_fabricacao add column if not exists bloqueada boolean not null default false;
alter table erp_ordens_fabricacao add column if not exists bloqueio_motivo text not null default '';
-- Bloqueio herdado da OF pai. Usa o mesmo lock do ledger, não apenas validação de tela.
create or replace function erp_ciclo_impedida(p_id uuid) returns boolean language sql stable as $$
 with recursive a as(select id,of_pai_id,bloqueada,status from erp_ordens_fabricacao where id=p_id union all select o.id,o.of_pai_id,o.bloqueada,o.status from erp_ordens_fabricacao o join a on a.of_pai_id=o.id)
 select coalesce(bool_or(bloqueada or status='CANCELADA'),false) from a
$$;
create or replace function erp_ciclo_guardar_bloqueio() returns trigger language plpgsql as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 if tg_table_name='pcp_operacoes' then
  v_id=new.of_id;
 elsif tg_table_name='pcp_apontamentos' then
  select of_id into v_id from pcp_operacoes where id=new.operacao_id;
 else v_id=new.of_id;
 end if;
 if v_id is not null and erp_ciclo_impedida(v_id) then raise exception 'OF bloqueada ou cancelada: revise o impedimento antes de continuar';end if;
 return new;
end$$;
drop trigger if exists erp_ciclo_bloqueio_operacao on pcp_operacoes;
create trigger erp_ciclo_bloqueio_operacao before update of quantidade_produzida,quantidade_refugo,status on pcp_operacoes for each row execute function erp_ciclo_guardar_bloqueio();
drop trigger if exists erp_ciclo_bloqueio_apontamento on pcp_apontamentos;
create trigger erp_ciclo_bloqueio_apontamento before insert on pcp_apontamentos for each row execute function erp_ciclo_guardar_bloqueio();
drop trigger if exists erp_ciclo_bloqueio_movimento on est_movimentos;
create trigger erp_ciclo_bloqueio_movimento before insert on est_movimentos for each row execute function erp_ciclo_guardar_bloqueio();
create or replace function erp_ciclo_controlar(p_id uuid,p_acao text,p_motivo text,p_ator text) returns uuid language plpgsql as $$
declare o erp_ordens_fabricacao%rowtype;ids uuid[];m record;v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into strict o from erp_ordens_fabricacao where id=p_id and versao_producao_id is not null for update;
 if p_acao not in('BLOQUEAR','DESBLOQUEAR','CANCELAR') or length(trim(p_motivo))<3 then raise exception 'Informe ação e motivo com ao menos três caracteres';end if;
 if p_acao='CANCELAR' and o.status='CANCELADA' then return p_id;end if;
 if o.status in('CONCLUIDA','CANCELADA') then raise exception 'OF encerrada não aceita esta ação';end if;
 if p_acao in('BLOQUEAR','DESBLOQUEAR') then
  update erp_ordens_fabricacao set bloqueada=(p_acao='BLOQUEAR'),bloqueio_motivo=case when p_acao='BLOQUEAR' then trim(p_motivo) else '' end where id=p_id;
 else
  with recursive a as(select id from erp_ordens_fabricacao where id=p_id union all select f.id from erp_ordens_fabricacao f join a on f.of_pai_id=a.id) select array_agg(id) into ids from a;
  if exists(select 1 from pcp_operacoes where of_id=any(ids) and (quantidade_produzida<>0 or quantidade_refugo<>0)) or exists(select 1 from pcp_apontamentos a join pcp_operacoes op on op.id=a.operacao_id where op.of_id=any(ids) and a.tipo='CICLO' and a.estoque_status<>'ESTORNADO') or exists(select 1 from erp_ordens_fabricacao where id=any(ids) and status='CONCLUIDA') then raise exception 'OF ou filha com execução: estorne os apontamentos antes de cancelar';end if;
  if erp_ciclo_impedida(p_id) then raise exception 'Desbloqueie a OF e seus pais antes de cancelar';end if;
  if exists(select 1 from erp_ordens_fabricacao where id=any(ids) and bloqueada) then raise exception 'Desbloqueie as OFs filhas antes de cancelar';end if;
  foreach v_id in array ids loop
   for m in select produto_id,local_origem_id,sum(case when tipo='RESERVA' then quantidade_base else -quantidade_base end) saldo from est_movimentos where of_id=v_id and tipo in('RESERVA','LIBERA_RESERVA') group by produto_id,local_origem_id having sum(case when tipo='RESERVA' then quantidade_base else -quantidade_base end)>0 loop
    perform erp_ciclo_mov('LIBERA_RESERVA',m.produto_id,m.local_origem_id,m.saldo,v_id,null,null,null,'CANCEL:'||v_id||':'||m.produto_id||':'||m.local_origem_id,p_ator);
   end loop;
   perform erp_ciclo_auditar(p_ator,'CANCELAR_OF','ORDEM_FABRICACAO',v_id::text,jsonb_build_object('motivo',trim(p_motivo),'raiz',p_id));
  end loop;
  update erp_ordens_fabricacao set status='CANCELADA' where id=any(ids);
  return p_id;
 end if;
 perform erp_ciclo_auditar(p_ator,p_acao||'_OF','ORDEM_FABRICACAO',p_id::text,jsonb_build_object('motivo',trim(p_motivo)));return p_id;
end$$;
-- migrate:down
-- Expand/contract: desligue o ciclo e reverta a aplicação. Preservar impedimentos,
-- funções, auditoria e reservas; remover a proteção permitiria produzir OF bloqueada.
