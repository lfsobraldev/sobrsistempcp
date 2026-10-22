-- GERADO do arquivo canônico 2026-10-21_08_competencias_programacao.sql; SHA256 96c03490764cd802fee4d12bb405eb0246d1b8567b658e18e2811b8af4b36608
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_04_unidades_globais.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_08_competencias_programacao.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_08_competencias_programacao.sql' and checksum<>'96c03490764cd802fee4d12bb405eb0246d1b8567b658e18e2811b8af4b36608') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_08_competencias_programacao.sql','96c03490764cd802fee4d12bb405eb0246d1b8567b658e18e2811b8af4b36608',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_08_competencias_programacao.sql','96c03490764cd802fee4d12bb405eb0246d1b8567b658e18e2811b8af4b36608','APLICAR',current_user,'APLICADA');
COMMIT;
