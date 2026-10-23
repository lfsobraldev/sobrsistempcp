-- Cole SOMENTE no banco central de usuários (identidade). Faça backup antes. Pode rodar de novo.
-- GERADO do arquivo canônico 2026-11-06_29_cargos_identidade.sql; SHA256 87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-05_28_rh_ehs_projetos.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-06_29_cargos_identidade.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-06_29_cargos_identidade.sql' and checksum<>'87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Novos cargos acima/entre os existentes: SUPERVISOR, DIRETOR, ADMINISTRADOR.
-- A lista é reescrita em todas as tabelas de identidade que restringem o perfil. Idempotente.
do $$
declare t text;c record;
 v_lista constant text := $l$'PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC','SUPERVISOR','DIRETOR','ADMINISTRADOR'$l$;
begin
 foreach t in array array['pcp_usuarios','pcp_usuario_empresas','pcp_perfil_permissoes'] loop
  if to_regclass('public.'||t) is not null then
   for c in select conname from pg_constraint where conrelid=('public.'||t)::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%LIDER_ENTREGAS%' loop
    execute format('alter table %I drop constraint %I',t,c.conname);
   end loop;
   execute format('alter table %I add constraint %I check(perfil in (%s))',t,'ck_'||t||'_perfil',v_lista);
  end if;
 end loop;
end $$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-06_29_cargos_identidade.sql','87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-06_29_cargos_identidade.sql','87a2de360e15c88d1b1cb129aa6e1d61b07d4ef9ea32275ff0ee380dc4d43c48','APLICAR',current_user,'APLICADA');
COMMIT;
