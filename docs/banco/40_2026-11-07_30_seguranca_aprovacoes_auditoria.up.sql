-- GERADO do arquivo canônico 2026-11-07_30_seguranca_aprovacoes_auditoria.sql; SHA256 5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-06_29_cargos_identidade.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-07_30_seguranca_aprovacoes_auditoria.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-07_30_seguranca_aprovacoes_auditoria.sql' and checksum<>'5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. Hierarquia de cargos e matriz de autorização
create table if not exists erp_cargos_nivel(
 cargo varchar(30) primary key, nivel integer not null check(nivel between 1 and 9), descricao varchar(120) not null default ''
);
insert into erp_cargos_nivel(cargo,nivel,descricao) values
 ('APONTADOR',1,'Operador / apontador'),('LIDER',2,'Líder'),('LIDER_ENTREGAS',2,'Líder de entregas'),('QUALIDADE',3,'Qualidade'),('LOGISTICA',3,'Logística'),('COMERCIAL',3,'Comercial'),('SAC',3,'SAC'),
 ('ENCARREGADO',4,'Encarregado'),('SUPERVISOR',5,'Supervisor'),('PCP',6,'PCP'),('GERENTE',7,'Gerente'),('DIRETOR',8,'Diretor'),('ADMINISTRADOR',9,'Administrador')
on conflict(cargo) do nothing;

-- Objeto de autorização: cargo x módulo x ação (+ limite de valor). Ausência de linha = negado.
create table if not exists erp_autorizacoes(
 cargo varchar(30) not null references erp_cargos_nivel(cargo),
 modulo varchar(30) not null,
 acao varchar(10) not null check(acao in('VER','CRIAR','EDITAR','APROVAR','CANCELAR','EXPORTAR')),
 permitido boolean not null default true,
 limite_valor numeric(16,2) check(limite_valor is null or limite_valor>=0),
 atualizado_por varchar(160) not null default 'sistema', atualizado_em timestamptz not null default now(),
 primary key(cargo,modulo,acao)
);
insert into erp_autorizacoes(cargo,modulo,acao,limite_valor)
select c.cargo,m.modulo,a.acao,
 case when a.acao='APROVAR' then (case c.cargo when 'ENCARREGADO' then 5000 when 'SUPERVISOR' then 10000 when 'PCP' then 20000 when 'GERENTE' then 50000 else null end) end
from (values('ENCARREGADO'),('SUPERVISOR'),('PCP'),('GERENTE'),('DIRETOR'),('ADMINISTRADOR')) c(cargo)
cross join (values('COMPRAS'),('VENDAS'),('FINANCEIRO'),('ESTOQUE'),('WMS'),('PRODUCAO'),('QUALIDADE'),('RH'),('FISCAL'),('PROJETOS')) m(modulo)
cross join (values('APROVAR'),('CANCELAR'),('EXPORTAR')) a(acao)
where not (c.cargo in('ENCARREGADO') and a.acao in('CANCELAR'))
 and not (c.cargo in('ENCARREGADO','SUPERVISOR') and m.modulo in('FINANCEIRO','FISCAL','RH'))
on conflict do nothing;

create or replace function erp_cargo_nivel(p_cargo text) returns integer language sql stable as $$
 select coalesce((select nivel from erp_cargos_nivel where cargo=p_cargo),0)
$$;
create or replace function erp_pode(p_cargo text,p_modulo text,p_acao text,p_valor numeric default null) returns boolean language sql stable as $$
 select coalesce((select a.permitido and (p_valor is null or a.limite_valor is null or p_valor<=a.limite_valor)
  from erp_autorizacoes a where a.cargo=p_cargo and a.modulo=p_modulo and a.acao=p_acao),false)
$$;

-- ================================================================ B. Alçadas e aprovação em múltiplos níveis
create table if not exists erp_aprovacao_regras(
 id uuid primary key default gen_random_uuid(),
 modulo varchar(30) not null, tipo_documento varchar(40) not null,
 valor_min numeric(16,2) not null default 0 check(valor_min>=0),
 valor_max numeric(16,2) check(valor_max is null or valor_max>=valor_min),
 nivel integer not null check(nivel between 1 and 5),
 cargo_aprovador varchar(30) not null references erp_cargos_nivel(cargo),
 ativo boolean not null default true,
 criado_por varchar(160) not null default 'sistema', criado_em timestamptz not null default now(),
 unique(modulo,tipo_documento,valor_min,nivel)
);
insert into erp_aprovacao_regras(modulo,tipo_documento,valor_min,valor_max,nivel,cargo_aprovador) values
 ('COMPRAS','PEDIDO_COMPRA',0,5000,1,'ENCARREGADO'),
 ('COMPRAS','PEDIDO_COMPRA',5000.01,20000,1,'GERENTE'),
 ('COMPRAS','PEDIDO_COMPRA',20000.01,null,1,'GERENTE'),
 ('COMPRAS','PEDIDO_COMPRA',20000.01,null,2,'DIRETOR'),
 ('VENDAS','DESCONTO',0,null,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',0,10000,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',10000.01,null,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',10000.01,null,2,'DIRETOR'),
 ('ESTOQUE','AJUSTE_INVENTARIO',0,null,1,'GERENTE'),
 ('WMS','REVISAO_APLICAR',0,null,1,'PCP')
on conflict do nothing;

create table if not exists erp_aprovacoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 modulo varchar(30) not null, tipo_documento varchar(40) not null,
 documento_id varchar(80) not null, documento_ref varchar(160) not null default '',
 valor numeric(16,2) not null default 0 check(valor>=0),
 descricao text not null default '',
 solicitante varchar(160) not null,
 status varchar(10) not null default 'PENDENTE' check(status in('PENDENTE','APROVADO','REJEITADO','CANCELADO')),
 nivel_atual integer not null default 1, niveis_total integer not null check(niveis_total>0),
 criado_em timestamptz not null default now(), encerrado_em timestamptz
);
create unique index if not exists ux_erp_aprovacao_aberta on erp_aprovacoes(modulo,tipo_documento,documento_id) where status='PENDENTE';
create table if not exists erp_aprovacao_etapas(
 aprovacao_id uuid not null references erp_aprovacoes(id) on delete cascade,
 nivel integer not null, cargo_exigido varchar(30) not null,
 status varchar(10) not null default 'PENDENTE' check(status in('PENDENTE','APROVADO','REJEITADO')),
 decidido_por varchar(160) not null default '', decidido_em timestamptz, parecer text not null default '',
 primary key(aprovacao_id,nivel)
);
create table if not exists erp_delegacoes(
 id uuid primary key default gen_random_uuid(),
 de_usuario varchar(160) not null, para_usuario varchar(160) not null,
 cargo_delegado varchar(30) not null references erp_cargos_nivel(cargo),
 inicio date not null, fim date not null, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim>=inicio), check(de_usuario<>para_usuario)
);

create or replace function erp_aprovacao_solicitar(p_modulo text,p_tipo text,p_doc text,p_ref text,p_valor numeric,p_desc text,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_n integer;
begin
 if coalesce(trim(p_doc),'')='' then raise exception 'Informe o documento a aprovar';end if;
 if p_valor is null or p_valor<0 then raise exception 'Valor inválido';end if;
 select count(*) into v_n from erp_aprovacao_regras where ativo and modulo=p_modulo and tipo_documento=p_tipo and p_valor>=valor_min and (valor_max is null or p_valor<=valor_max);
 if v_n=0 then raise exception 'SEM_REGRA: não há alçada cadastrada para % / % neste valor',p_modulo,p_tipo;end if;
 insert into erp_aprovacoes(modulo,tipo_documento,documento_id,documento_ref,valor,descricao,solicitante,niveis_total)
 values(p_modulo,p_tipo,p_doc,coalesce(p_ref,''),p_valor,coalesce(p_desc,''),p_ator,v_n) returning id into v_id;
 insert into erp_aprovacao_etapas(aprovacao_id,nivel,cargo_exigido)
 select v_id,row_number() over(order by nivel),cargo_aprovador from erp_aprovacao_regras
 where ativo and modulo=p_modulo and tipo_documento=p_tipo and p_valor>=valor_min and (valor_max is null or p_valor<=valor_max) order by nivel;
 return v_id;
end$$;

-- Decisão: o cargo efetivo é o maior entre o próprio e o delegado vigente; solicitante não aprova a própria solicitação;
-- a mesma pessoa não aprova dois níveis do mesmo documento (quatro olhos).
create or replace function erp_aprovacao_decidir(p_id uuid,p_decisao text,p_parecer text,p_ator text,p_cargo text) returns text language plpgsql as $$
declare v_a record;v_e record;v_nivel integer;v_deleg integer;v_novo text;
begin
 if p_decisao not in('APROVAR','REJEITAR') then raise exception 'Decisão inválida';end if;
 select * into v_a from erp_aprovacoes where id=p_id for update;
 if not found then raise exception 'Aprovação não encontrada';end if;
 if v_a.status<>'PENDENTE' then raise exception 'Aprovação já encerrada';end if;
 if v_a.solicitante=p_ator then raise exception 'SEPARACAO_DE_FUNCOES: quem solicita não pode aprovar';end if;
 if exists(select 1 from erp_aprovacao_etapas where aprovacao_id=p_id and decidido_por=p_ator) then raise exception 'SEPARACAO_DE_FUNCOES: você já decidiu um nível deste documento';end if;
 select * into v_e from erp_aprovacao_etapas where aprovacao_id=p_id and nivel=v_a.nivel_atual;
 v_nivel:=erp_cargo_nivel(p_cargo);
 select coalesce(max(erp_cargo_nivel(cargo_delegado)),0) into v_deleg from erp_delegacoes where ativo and para_usuario=p_ator and current_date between inicio and fim;
 if greatest(v_nivel,v_deleg)<erp_cargo_nivel(v_e.cargo_exigido) then raise exception 'Este nível exige o cargo % ou superior',v_e.cargo_exigido;end if;
 if p_decisao='APROVAR' and not erp_pode(case when v_deleg>v_nivel then (select cargo_delegado from erp_delegacoes where ativo and para_usuario=p_ator and current_date between inicio and fim order by erp_cargo_nivel(cargo_delegado) desc limit 1) else p_cargo end,v_a.modulo,'APROVAR',case when v_a.nivel_atual>=v_a.niveis_total then v_a.valor end) then
  raise exception 'O cargo não tem alçada para aprovar este valor em %',v_a.modulo;
 end if;
 if p_decisao='REJEITAR' and coalesce(trim(p_parecer),'')='' then raise exception 'Informe o parecer da rejeição';end if;
 update erp_aprovacao_etapas set status=case when p_decisao='APROVAR' then 'APROVADO' else 'REJEITADO' end,decidido_por=p_ator,decidido_em=now(),parecer=coalesce(p_parecer,'') where aprovacao_id=p_id and nivel=v_a.nivel_atual;
 if p_decisao='REJEITAR' then
  update erp_aprovacoes set status='REJEITADO',encerrado_em=now() where id=p_id;v_novo:='REJEITADO';
 elsif v_a.nivel_atual>=v_a.niveis_total then
  update erp_aprovacoes set status='APROVADO',encerrado_em=now() where id=p_id;v_novo:='APROVADO';
 else
  update erp_aprovacoes set nivel_atual=nivel_atual+1 where id=p_id;v_novo:='PENDENTE';
 end if;
 return v_novo;
end$$;

create or replace function erp_aprovacao_cancelar(p_id uuid,p_ator text) returns void language plpgsql as $$
begin
 update erp_aprovacoes set status='CANCELADO',encerrado_em=now() where id=p_id and status='PENDENTE' and solicitante=p_ator;
 if not found then raise exception 'Só o solicitante cancela uma aprovação pendente';end if;
end$$;

create or replace view erp_v_aprovacoes_pendentes as
 select a.id,a.numero,a.modulo,a.tipo_documento,a.documento_ref,a.valor,a.descricao,a.solicitante,a.criado_em,a.nivel_atual,a.niveis_total,e.cargo_exigido,(current_date-a.criado_em::date) dias
 from erp_aprovacoes a join erp_aprovacao_etapas e on e.aprovacao_id=a.id and e.nivel=a.nivel_atual where a.status='PENDENTE';

-- ================================================================ C. Auditoria (quem, quando, o quê, antes/depois)
create table if not exists erp_auditoria(
 id bigserial primary key,
 ator varchar(160) not null, acao varchar(20) not null,
 entidade varchar(80) not null, entidade_id varchar(120) not null default '',
 antes jsonb, depois jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_auditoria_ent on erp_auditoria(entidade,entidade_id,criado_em desc);
create index if not exists ix_erp_auditoria_ator on erp_auditoria(ator,criado_em desc);
create or replace function erp_auditoria_imutavel() returns trigger language plpgsql as $$ begin raise exception 'erp_auditoria é um histórico auditável: não pode ser alterado nem apagado'; end $$;
drop trigger if exists tr_erp_auditoria_imutavel on erp_auditoria;
create trigger tr_erp_auditoria_imutavel before update or delete on erp_auditoria for each row execute function erp_auditoria_imutavel();

-- Trigger genérico: o ator vem das colunas atualizado_por / criado_por / encerrada_por da própria linha.
create or replace function erp_auditar() returns trigger language plpgsql as $$
declare v_novo jsonb;v_vel jsonb;v_ator text;v_id text;
begin
 v_novo:=case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
 v_vel:=case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
 v_ator:=coalesce(v_novo->>'atualizado_por',v_novo->>'encerrada_por',nullif(v_novo->>'encerrado_por',''),v_novo->>'criado_por',v_vel->>'criado_por','sistema');
 if v_ator='' then v_ator:=coalesce(v_novo->>'criado_por',v_vel->>'criado_por','sistema');end if;
 v_id:=coalesce(v_novo->>'id',v_vel->>'id','');
 if TG_OP='UPDATE' and v_novo=v_vel then return NEW;end if;
 insert into erp_auditoria(ator,acao,entidade,entidade_id,antes,depois) values(v_ator,TG_OP,TG_TABLE_NAME,v_id,v_vel,v_novo);
 return case when TG_OP='DELETE' then OLD else NEW end;
end$$;
do $$
declare t text;
begin
 foreach t in array array['crm_pedidos_venda','cmp_pedidos','fin_titulos','exp_remessas','est_inventarios','pcp_pedido_revisoes','wms_sobras','wms_picking_listas','wms_recebimentos','erp_aprovacoes','erp_autorizacoes','erp_aprovacao_regras','rh_colaboradores','ehs_ocorrencias','ps_projetos'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists tr_erp_auditar on %I',t);
   execute format('create trigger tr_erp_auditar after insert or update or delete on %I for each row execute function erp_auditar()',t);
  end if;
 end loop;
end $$;

-- ================================================================ D. Configuração por unidade
create table if not exists erp_config(
 chave varchar(60) primary key, valor text not null, descricao varchar(200) not null default '',
 atualizado_por varchar(160) not null default 'sistema', atualizado_em timestamptz not null default now()
);
insert into erp_config(chave,valor,descricao) values
 ('empresa.nome','Famossul','Nome exibido no login, cabeçalho e documentos impressos'),
 ('revisao.prazo_dias','2','Prazo padrão (dias) para responder uma revisão de pedido')
on conflict do nothing;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-07_30_seguranca_aprovacoes_auditoria.sql','5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-07_30_seguranca_aprovacoes_auditoria.sql','5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444','APLICAR',current_user,'APLICADA');
COMMIT;
