-- GERADO do arquivo canônico 2026-10-21_05_acessos_centrais.sql; SHA256 c29a4470ccb943d1320d2a87472714418d368be936899f82f64d14ae1d8c1375
-- Destino: identidade. Dependências: 2026-10-21_fundacao_multiempresa.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_05_acessos_centrais.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_05_acessos_centrais.sql' and checksum<>'c29a4470ccb943d1320d2a87472714418d368be936899f82f64d14ae1d8c1375') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
alter table pcp_usuarios drop constraint if exists ck_pcp_usuarios_perfil;
alter table pcp_usuarios add constraint ck_pcp_usuarios_perfil check(perfil in ('PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC'));
create table if not exists pcp_lider_unidade_etapas(
 usuario_id uuid not null references pcp_usuarios(id),
 unidade text not null check(unidade in ('SUL','NORDESTE')),
 etapa text not null check(etapa in ('PREPARACAO','COLAGEM_PORTAS','ESQUADRIAS_BORDAS','RECOBRIDORA_PERFIL','USINAGEM_2','LUSTRACAO','CNC','USINAGEM','PLASTIFICADORA','PLASTIFICADORA_PORTAS','EMBALAGEM','EXPEDICAO')),
 turno text not null check(turno in ('A','B')),primary key(usuario_id,unidade,etapa)
);
create or replace function erp_salvar_usuario(p_id uuid,p_dados jsonb,p_hash text,p_ator text,p_versao timestamptz)
returns uuid language plpgsql as $$
declare v_id uuid; anterior jsonb; acesso jsonb; f pcp_filiais%rowtype; vinculo uuid; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('usuario:'||(p_dados->>'usuario'),0));
 if p_id is null then
  if p_hash is null then raise exception 'Senha obrigatória';end if;
  insert into pcp_usuarios(usuario,nome,senha_hash,perfil,ativo,criado_por)
  values(p_dados->>'usuario',p_dados->>'nome',p_hash,p_dados->>'perfil',(p_dados->>'ativo')::boolean,p_ator) returning id into v_id;
 else
  select jsonb_build_object('usuario',usuario,'nome',nome,'perfil',perfil,'ativo',ativo) into anterior from pcp_usuarios where id=p_id for update;
  if anterior is null then raise exception 'Usuário não encontrado';end if;
  if exists(select 1 from pcp_usuarios where id=p_id and usuario<>p_dados->>'usuario') then raise exception 'O login não pode ser renomeado';end if;
  if not exists(select 1 from pcp_usuarios where id=p_id and atualizado_em=p_versao) then raise exception 'Versão desatualizada';end if;
  update pcp_usuarios set nome=p_dados->>'nome',perfil=p_dados->>'perfil',ativo=(p_dados->>'ativo')::boolean,
  senha_hash=coalesce(p_hash,senha_hash),atualizado_em=clock_timestamp() where id=p_id;v_id=p_id;
 end if;
 -- Substituição explícita dos grants deste login, na mesma transação.
 delete from pcp_usuario_filiais where usuario_empresa_id in(select id from pcp_usuario_empresas where usuario_id=v_id);
 update pcp_usuario_empresas set ativo=false,escopo_filiais='SELECIONADAS',atualizado_em=clock_timestamp() where usuario_id=v_id;
 delete from pcp_lider_unidade_etapas where usuario_id=v_id;
 for acesso in select value from jsonb_array_elements(p_dados->'acessos') loop
  select count(*) into n from pcp_filiais x join pcp_empresas e on e.id=x.empresa_id and e.ativo where x.ativo and x.codigo=acesso->>'unidade';
  if n<>1 then raise exception 'Cadastre uma única filial ativa para a unidade solicitada';end if;
  select x.* into strict f from pcp_filiais x join pcp_empresas e on e.id=x.empresa_id and e.ativo where x.ativo and x.codigo=acesso->>'unidade';
  insert into pcp_usuario_empresas(usuario_id,empresa_id,perfil,escopo_filiais,ativo,criado_por)
  values(v_id,f.empresa_id,p_dados->>'perfil','SELECIONADAS',true,p_ator)
  on conflict(usuario_id,empresa_id) do update set perfil=excluded.perfil,ativo=true,escopo_filiais='SELECIONADAS',atualizado_em=clock_timestamp() returning id into vinculo;
  insert into pcp_usuario_filiais(usuario_empresa_id,empresa_id,filial_id) values(vinculo,f.empresa_id,f.id) on conflict do nothing;
  if p_dados->>'perfil'='LIDER_ENTREGAS' then
   insert into pcp_lider_unidade_etapas(usuario_id,unidade,etapa,turno)
   select v_id,acesso->>'unidade',etapa,acesso->>'turno' from jsonb_array_elements_text(acesso->'etapas') etapa;
  end if;
 end loop;
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,antes,depois)
 values(p_ator,case when p_id is null then 'CRIAR_USUARIO' else 'EDITAR_USUARIO' end,'USUARIO',v_id::text,anterior,
 (p_dados-'senha')||jsonb_build_object('senha_alterada',p_hash is not null));
 return v_id;
end $$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_05_acessos_centrais.sql','c29a4470ccb943d1320d2a87472714418d368be936899f82f64d14ae1d8c1375',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_05_acessos_centrais.sql','c29a4470ccb943d1320d2a87472714418d368be936899f82f64d14ae1d8c1375','APLICAR',current_user,'APLICADA');
COMMIT;
