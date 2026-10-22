-- depends-on: 2026-11-05_28_rh_ehs_projetos.sql
-- scope: identity
-- migrate:up
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

-- migrate:down
-- Contas com os novos cargos precisariam ser migradas antes de restaurar a lista antiga; preservado.
select 'Cargos preservados' as resultado;
