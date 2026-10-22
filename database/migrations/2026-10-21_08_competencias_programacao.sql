-- depends-on: 2026-10-21_04_unidades_globais.sql
-- scope: operational
-- migrate:up
create table if not exists pcp_programacao_competencias(
 empresa_id uuid not null references pcp_empresas(id),filial_id uuid not null,competencia date not null check(extract(day from competencia)=1),
 status text not null default 'PLANEJADO' check(status in ('ATIVO','PLANEJADO','ENCERRADO')),
 atualizado_por text not null,atualizado_em timestamptz not null default now(),primary key(filial_id,competencia),
 foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id)
);
create unique index if not exists ux_programacao_competencia_ativa on pcp_programacao_competencias(filial_id) where status='ATIVO';
-- Reaproveita a competência da programação industrial ativa. Outros meses permanecem planejados até ação explícita.
with novos as(
 insert into pcp_programacao_competencias(empresa_id,filial_id,competencia,status,atualizado_por)
 select f.empresa_id,b.filial_id,b.competencia,
 case when b.competencia=(select date_trunc('month',max(data_programacao))::date from pcp_programacoes where status='ATIVA') then 'ATIVO' else 'PLANEJADO' end,'MIGRATION_08'
 from (select distinct filial_id,competencia from pcp_programacao_mensal_base) b join pcp_filiais f on f.id=b.filial_id
 on conflict do nothing returning *
) insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,depois)
 select empresa_id,filial_id,'MIGRATION_08','CADASTRAR_COMPETENCIA','PROGRAMACAO_COMPETENCIA',to_jsonb(novos) from novos;
create or replace function pcp_controlar_lote_competencia() returns trigger language plpgsql as $$
declare st text;emp uuid;criada boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('competencias:'||new.filial_id::text,0));
 select empresa_id into strict emp from pcp_filiais where id=new.filial_id and ativo;
 insert into pcp_programacao_competencias(empresa_id,filial_id,competencia,atualizado_por) values(emp,new.filial_id,new.competencia,new.usuario) on conflict do nothing;
 criada=found;
 select status into strict st from pcp_programacao_competencias where filial_id=new.filial_id and competencia=new.competencia for update;
 if st='ENCERRADO' then raise exception 'Competência encerrada; alterações de lotes estão bloqueadas';end if;
 if criada then insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,depois) values(emp,new.filial_id,new.usuario,'CADASTRAR_COMPETENCIA','PROGRAMACAO_COMPETENCIA',jsonb_build_object('competencia',new.competencia,'status','PLANEJADO'));end if;
 return new;
end$$;
drop trigger if exists lote_competencia_controlada on pcp_programacao_lotes;
create trigger lote_competencia_controlada before insert or update on pcp_programacao_lotes for each row execute function pcp_controlar_lote_competencia();
create or replace function pcp_transicionar_competencia(p_filial uuid,p_mes date,p_status text,p_ator text) returns jsonb language plpgsql as $$
declare c pcp_programacao_competencias%rowtype;outro pcp_programacao_competencias%rowtype;emp uuid;
begin
 if p_status not in ('ATIVO','ENCERRADO') or extract(day from p_mes)<>1 then raise exception 'Transição de competência inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended('competencias:'||p_filial::text,0));
 select empresa_id into strict emp from pcp_filiais where id=p_filial and ativo;
 insert into pcp_programacao_competencias(empresa_id,filial_id,competencia,atualizado_por) values(emp,p_filial,p_mes,p_ator) on conflict do nothing;
 select * into strict c from pcp_programacao_competencias where filial_id=p_filial and competencia=p_mes for update;
 if c.status=p_status then return to_jsonb(c);end if;
 if c.status='ENCERRADO' then raise exception 'Competência encerrada não pode ser reativada neste fluxo';end if;
 if not exists(select 1 from pcp_programacao_mensal_efetiva where filial_id=p_filial and competencia=p_mes) then raise exception 'Importe itens antes de ativar ou encerrar o mês';end if;
 if p_status='ATIVO' then
  for outro in select * from pcp_programacao_competencias where filial_id=p_filial and status='ATIVO' for update loop
   update pcp_programacao_competencias set status='ENCERRADO',atualizado_por=p_ator,atualizado_em=clock_timestamp() where filial_id=p_filial and competencia=outro.competencia;
   insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,antes,depois) values(emp,p_filial,p_ator,'ENCERRAR_COMPETENCIA','PROGRAMACAO_COMPETENCIA',to_jsonb(outro),jsonb_build_object('competencia',outro.competencia,'status','ENCERRADO'));
  end loop;
 end if;
 update pcp_programacao_competencias set status=p_status,atualizado_por=p_ator,atualizado_em=clock_timestamp() where filial_id=p_filial and competencia=p_mes;
 insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,antes,depois) values(emp,p_filial,p_ator,'ALTERAR_COMPETENCIA','PROGRAMACAO_COMPETENCIA',to_jsonb(c),jsonb_build_object('competencia',p_mes,'status',p_status));
 return jsonb_build_object('competencia',p_mes,'status',p_status);
end$$;
create index if not exists ix_prog_itens_filtro_pedido on pcp_programacao_mensal_itens(filtro,pedido,lote_id);
-- migrate:down
-- Desligar ERP_PROGRAMACAO_STATUS na aplicação; preservar documentos e auditoria.
drop trigger if exists lote_competencia_controlada on pcp_programacao_lotes;
select 'Competências e histórico preservados' as resultado;
