-- GERADO do arquivo canônico 2026-10-21_07_marketing.sql; SHA256 f35e1f0cf49cd020514aafbc1a5cac87946c1b2de621b1c7dbec0ec7e8ca9ba8
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-20_crm_comercial.sql, 2026-10-21_fundacao_multiempresa.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_07_marketing.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_07_marketing.sql' and checksum<>'f35e1f0cf49cd020514aafbc1a5cac87946c1b2de621b1c7dbec0ec7e8ca9ba8') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists erp_marketing_campanhas(
 id uuid primary key default gen_random_uuid(),nome text not null,canal text not null,
 inicio date not null,fim date not null check(fim>=inicio),orcamento_centavos bigint not null check(orcamento_centavos>=0),
 status text not null default 'PLANEJADA' check(status in ('PLANEJADA','ATIVA','PAUSADA','ENCERRADA','CANCELADA')),
 responsavel text not null,request_id uuid not null unique,requisicao jsonb not null,criado_em timestamptz not null default now()
);
create table if not exists erp_marketing_despesas(
 id uuid primary key default gen_random_uuid(),campanha_id uuid not null references erp_marketing_campanhas(id),
 descricao text not null,centavos bigint not null check(centavos>0),data date not null,request_id uuid not null unique,
 usuario text not null,criado_em timestamptz not null default now()
);
create table if not exists erp_marketing_oportunidades(
 oportunidade_id uuid primary key references crm_oportunidades(id),campanha_id uuid not null references erp_marketing_campanhas(id),
 usuario text not null,criado_em timestamptz not null default now()
);
create index if not exists erp_marketing_oport_campanha on erp_marketing_oportunidades(campanha_id);
create or replace function erp_despesa_marketing_imutavel() returns trigger language plpgsql as $$begin raise exception 'Despesa de marketing é imutável';end$$;
drop trigger if exists marketing_despesa_protegida on erp_marketing_despesas;
create trigger marketing_despesa_protegida before update or delete on erp_marketing_despesas for each row execute function erp_despesa_marketing_imutavel();
create or replace function erp_marketing_acao(p_acao text,p_dados jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_request uuid;anterior jsonb;c erp_marketing_campanhas%rowtype;d erp_marketing_despesas%rowtype;v_status text;
begin
 if p_acao='CRIAR' then
  v_request=(p_dados->>'requestId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('campanha:'||v_request::text,0));
  select id,requisicao into v_id,anterior from erp_marketing_campanhas where request_id=v_request;
  if v_id is not null then if anterior<>p_dados then raise exception 'Chave de requisição já utilizada';end if;return v_id;end if;
  insert into erp_marketing_campanhas(nome,canal,inicio,fim,orcamento_centavos,responsavel,request_id,requisicao)
  values(p_dados->>'nome',p_dados->>'canal',(p_dados->>'inicio')::date,(p_dados->>'fim')::date,(p_dados->>'orcamentoCentavos')::bigint,p_dados->>'responsavel',v_request,p_dados) returning id into v_id;
 else
  v_id=(p_dados->>'id')::uuid;select * into strict c from erp_marketing_campanhas where id=v_id for update;anterior=to_jsonb(c);
  if p_acao='STATUS' then
   v_status=p_dados->>'status';
   if c.status=v_status then return v_id;end if;
   if not ((c.status='PLANEJADA' and v_status in ('ATIVA','CANCELADA')) or (c.status='ATIVA' and v_status in ('PAUSADA','ENCERRADA')) or (c.status='PAUSADA' and v_status in ('ATIVA','ENCERRADA'))) then raise exception 'Transição de campanha inválida';end if;
   update erp_marketing_campanhas set status=v_status where id=v_id;
  elsif p_acao='DESPESA' then
   v_request=(p_dados->>'requestId')::uuid;
   select * into d from erp_marketing_despesas where request_id=v_request;
   if found then
    if d.campanha_id<>v_id or d.centavos<>(p_dados->>'centavos')::bigint or d.descricao<>p_dados->>'descricao' or d.data<>(p_dados->>'data')::date then raise exception 'Chave de despesa já utilizada';end if;return v_id;
   end if;
   if c.status not in ('ATIVA','PAUSADA') then raise exception 'Ative a campanha antes de registrar despesas';end if;
   insert into erp_marketing_despesas(campanha_id,descricao,centavos,data,request_id,usuario) values(v_id,p_dados->>'descricao',(p_dados->>'centavos')::bigint,(p_dados->>'data')::date,v_request,p_ator);
  elsif p_acao='VINCULAR' then
   if c.status not in ('ATIVA','PAUSADA') then raise exception 'Campanha não está disponível para atribuição';end if;
   if exists(select 1 from erp_marketing_oportunidades where oportunidade_id=(p_dados->>'oportunidadeId')::uuid and campanha_id<>v_id) then raise exception 'Oportunidade já atribuída a outra campanha';end if;
   insert into erp_marketing_oportunidades(oportunidade_id,campanha_id,usuario) values((p_dados->>'oportunidadeId')::uuid,v_id,p_ator) on conflict do nothing;
   if not found then
    if exists(select 1 from erp_marketing_oportunidades where oportunidade_id=(p_dados->>'oportunidadeId')::uuid and campanha_id<>v_id) then raise exception 'Oportunidade já atribuída a outra campanha';end if;
    return v_id;
   end if;
  else raise exception 'Ação de marketing inválida';end if;
 end if;
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,antes,depois) values(p_ator,p_acao||'_CAMPANHA','MARKETING',v_id::text,anterior,p_dados);return v_id;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_07_marketing.sql','f35e1f0cf49cd020514aafbc1a5cac87946c1b2de621b1c7dbec0ec7e8ca9ba8',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_07_marketing.sql','f35e1f0cf49cd020514aafbc1a5cac87946c1b2de621b1c7dbec0ec7e8ca9ba8','APLICAR',current_user,'APLICADA');
COMMIT;
