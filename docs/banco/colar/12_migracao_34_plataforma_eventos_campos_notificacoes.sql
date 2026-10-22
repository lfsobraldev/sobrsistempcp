-- GERADO do arquivo canônico 2026-11-11_34_plataforma_eventos_campos_notificacoes.sql; SHA256 c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-10_33_financeiro_fechamento_rateio_margem.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-11_34_plataforma_eventos_campos_notificacoes.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-11_34_plataforma_eventos_campos_notificacoes.sql' and checksum<>'c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ============ A. API v1: novos escopos e eventos de webhook
do $$
declare r record;
begin
 for r in select conname from pg_constraint where conrelid='sys_tokens_api'::regclass and contype='c' and pg_get_constraintdef(oid) like '%escopos%' loop
  execute format('alter table sys_tokens_api drop constraint %I',r.conname);
 end loop;
 alter table sys_tokens_api add constraint sys_tokens_api_escopos_check check(escopos<@array['leitura','indicadores','alertas','pedidos','ordens','estoque','qualidade']::text[]);
 for r in select conname from pg_constraint where conrelid='sys_webhooks'::regclass and contype='c' and pg_get_constraintdef(oid) like '%eventos%' loop
  execute format('alter table sys_webhooks drop constraint %I',r.conname);
 end loop;
 alter table sys_webhooks add constraint sys_webhooks_eventos_check check(array_length(eventos,1)>0 and eventos<@array['alerta.criado','pedido.status','remessa.entregue','ordem.concluida','nc.aberta','aprovacao.decidida','periodo.fechado']::text[]);
end$$;

-- ============ B. Outbox durável de eventos (registra sempre; entrega via fila de webhooks)
create table if not exists erp_eventos(
 id bigserial primary key,
 tipo varchar(40) not null,
 payload jsonb not null default '{}'::jsonb,
 entregas integer not null default 0,
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_eventos_tipo on erp_eventos(tipo,criado_em desc);
create or replace function erp_evento(p_tipo text,p_payload jsonb) returns integer language plpgsql as $$
declare n integer;
begin
 n=sys_emitir_evento(p_tipo,p_payload);
 insert into erp_eventos(tipo,payload,entregas) values(p_tipo,p_payload,n);
 return n;
end$$;

create or replace function erp_trg_ev_of() returns trigger language plpgsql as $$
begin
 if new.status='CONCLUIDA' and old.status is distinct from 'CONCLUIDA' then perform erp_evento('ordem.concluida',jsonb_build_object('numero',new.numero,'pedido',new.pedido,'quantidade',new.quantidade));end if;
 return new;
end$$;
drop trigger if exists erp_ev_of_t on erp_ordens_fabricacao;
create trigger erp_ev_of_t after update of status on erp_ordens_fabricacao for each row execute function erp_trg_ev_of();

create or replace function erp_trg_ev_nc() returns trigger language plpgsql as $$
begin
 perform erp_evento('nc.aberta',jsonb_build_object('numero',new.numero,'origem',new.origem,'descricao',left(new.descricao,200)));
 return new;
end$$;
drop trigger if exists erp_ev_nc_t on qld_nao_conformidades;
create trigger erp_ev_nc_t after insert on qld_nao_conformidades for each row execute function erp_trg_ev_nc();

create or replace function erp_trg_ev_aprov() returns trigger language plpgsql as $$
begin
 if new.status in('APROVADO','REJEITADO') and old.status is distinct from new.status then
  perform erp_evento('aprovacao.decidida',jsonb_build_object('numero',new.numero,'modulo',new.modulo,'documento',new.documento_ref,'status',new.status,'valor',new.valor));
 end if;
 return new;
end$$;
drop trigger if exists erp_ev_aprov_t on erp_aprovacoes;
create trigger erp_ev_aprov_t after update of status on erp_aprovacoes for each row execute function erp_trg_ev_aprov();

create or replace function erp_trg_ev_periodo() returns trigger language plpgsql as $$
begin
 if new.status='FECHADO' and (tg_op='INSERT' or old.status is distinct from 'FECHADO') then perform erp_evento('periodo.fechado',jsonb_build_object('competencia',new.competencia));end if;
 return new;
end$$;
drop trigger if exists erp_ev_periodo_t on fin_periodos;
create trigger erp_ev_periodo_t after insert or update of status on fin_periodos for each row execute function erp_trg_ev_periodo();

-- ============ C. Campos customizados por entidade
create table if not exists erp_campos_def(
 id uuid primary key default gen_random_uuid(),
 entidade varchar(24) not null check(entidade in('PEDIDO_VENDA','CLIENTE','PRODUTO','FORNECEDOR','ORDEM_FABRICACAO','NAO_CONFORMIDADE')),
 chave varchar(40) not null check(chave ~ '^[a-z][a-z0-9_]{1,39}$'),
 rotulo varchar(80) not null,
 tipo varchar(8) not null check(tipo in('TEXTO','NUMERO','DATA','BOOLEANO','LISTA')),
 opcoes jsonb not null default '[]'::jsonb check(jsonb_typeof(opcoes)='array'),
 obrigatorio boolean not null default false,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(entidade,chave),
 check(tipo<>'LISTA' or jsonb_array_length(opcoes)>0)
);
create table if not exists erp_campos_valores(
 entidade varchar(24) not null, registro_id varchar(80) not null, chave varchar(40) not null,
 valor jsonb not null, atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now(),
 primary key(entidade,registro_id,chave),
 foreign key(entidade,chave) references erp_campos_def(entidade,chave) on update cascade
);
create or replace function erp_campo_gravar(p_ent text,p_reg text,p_chave text,p_valor jsonb,p_ator text) returns void language plpgsql as $$
declare d erp_campos_def%rowtype;
begin
 select * into d from erp_campos_def where entidade=p_ent and chave=p_chave and ativo;
 if not found then raise exception 'Campo inexistente ou inativo';end if;
 if p_valor is null or p_valor='null'::jsonb or p_valor='""'::jsonb then
  if d.obrigatorio then raise exception 'CAMPO_OBRIGATORIO: %',d.rotulo;end if;
  delete from erp_campos_valores where entidade=p_ent and registro_id=p_reg and chave=p_chave;return;
 end if;
 if d.tipo='NUMERO' and jsonb_typeof(p_valor)<>'number' then raise exception 'CAMPO_INVALIDO: % deve ser número',d.rotulo;end if;
 if d.tipo='BOOLEANO' and jsonb_typeof(p_valor)<>'boolean' then raise exception 'CAMPO_INVALIDO: % deve ser verdadeiro/falso',d.rotulo;end if;
 if d.tipo='DATA' and (jsonb_typeof(p_valor)<>'string' or (p_valor#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'CAMPO_INVALIDO: % deve ser data AAAA-MM-DD',d.rotulo;end if;
 if d.tipo='TEXTO' and (jsonb_typeof(p_valor)<>'string' or length(p_valor#>>'{}')>500) then raise exception 'CAMPO_INVALIDO: % deve ter até 500 caracteres',d.rotulo;end if;
 if d.tipo='LISTA' and not d.opcoes @> jsonb_build_array(p_valor) then raise exception 'CAMPO_INVALIDO: % fora das opções',d.rotulo;end if;
 insert into erp_campos_valores(entidade,registro_id,chave,valor,atualizado_por) values(p_ent,p_reg,p_chave,p_valor,p_ator)
  on conflict(entidade,registro_id,chave) do update set valor=excluded.valor,atualizado_por=excluded.atualizado_por,atualizado_em=now();
end$$;

-- ============ D. Central de notificações (por usuário ou por cargo, com leitura individual)
create table if not exists erp_notificacoes(
 id uuid primary key default gen_random_uuid(),
 usuario varchar(160), cargo varchar(20),
 tipo varchar(20) not null default 'INFO' check(tipo in('INFO','APROVACAO','ALERTA','QUALIDADE','FINANCEIRO')),
 titulo varchar(160) not null, corpo text not null default '', link varchar(160) not null default '',
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_notif on erp_notificacoes(cargo,usuario,criado_em desc);
create table if not exists erp_notificacoes_leituras(
 notificacao_id uuid not null references erp_notificacoes(id) on delete cascade, usuario varchar(160) not null, lida_em timestamptz not null default now(),
 primary key(notificacao_id,usuario)
);
create or replace function erp_notificar(p_usuario text,p_cargo text,p_tipo text,p_titulo text,p_corpo text,p_link text) returns uuid language plpgsql as $$
declare v uuid;
begin
 if coalesce(p_usuario,'')='' and coalesce(p_cargo,'')='' then raise exception 'Informe usuário ou cargo de destino';end if;
 insert into erp_notificacoes(usuario,cargo,tipo,titulo,corpo,link) values(nullif(p_usuario,''),nullif(p_cargo,''),p_tipo,left(p_titulo,160),coalesce(p_corpo,''),coalesce(p_link,'')) returning id into v;
 return v;
end$$;
create or replace function erp_notificacoes_do_usuario(p_usuario text,p_cargo text,p_limite int default 50) returns table(id uuid,tipo text,titulo text,corpo text,link text,criado_em timestamptz,lida boolean) language sql stable as $$
 select n.id,n.tipo::text,n.titulo::text,n.corpo,n.link::text,n.criado_em,exists(select 1 from erp_notificacoes_leituras l where l.notificacao_id=n.id and l.usuario=p_usuario)
 from erp_notificacoes n where n.usuario=p_usuario or (n.usuario is null and n.cargo=p_cargo)
 order by n.criado_em desc limit least(greatest(p_limite,1),200)$$;
create or replace function erp_notificacao_ler(p_id uuid,p_usuario text) returns void language sql as $$
 insert into erp_notificacoes_leituras(notificacao_id,usuario) values(p_id,p_usuario) on conflict do nothing$$;

create or replace function erp_trg_notif_aprov() returns trigger language plpgsql as $$
begin
 perform erp_notificar(null,'GERENTE','APROVACAO','Aprovação pendente #'||new.numero,new.modulo||' · '||new.documento_ref||' · R$ '||new.valor,'/seguranca');
 return new;
end$$;
drop trigger if exists erp_notif_aprov_t on erp_aprovacoes;
create trigger erp_notif_aprov_t after insert on erp_aprovacoes for each row execute function erp_trg_notif_aprov();
create or replace function erp_trg_notif_nc() returns trigger language plpgsql as $$
begin
 perform erp_notificar(null,'QUALIDADE','QUALIDADE','Nova não conformidade #'||new.numero,left(new.descricao,200),'/qualidade-inspecao');
 return new;
end$$;
drop trigger if exists erp_notif_nc_t on qld_nao_conformidades;
create trigger erp_notif_nc_t after insert on qld_nao_conformidades for each row execute function erp_trg_notif_nc();
create or replace function erp_trg_notif_alerta() returns trigger language plpgsql as $$
begin
 if new.severidade='ALTA' then perform erp_notificar(null,'PCP','ALERTA',new.tipo||': '||left(new.mensagem,120),new.mensagem,new.link);end if;
 return new;
end$$;
drop trigger if exists erp_notif_alerta_t on sys_alertas;
create trigger erp_notif_alerta_t after insert on sys_alertas for each row execute function erp_trg_notif_alerta();

-- ============ E. Painel por função (cartões contados no banco)
create or replace function erp_painel_funcao(p_cargo text) returns jsonb language plpgsql stable as $$
declare r jsonb:='[]'::jsonb;
begin
 if p_cargo in('PCP','GERENTE','DIRETOR','ADMINISTRADOR') then
  r=r||jsonb_build_object('chave','aprovacoes','rotulo','Aprovações pendentes','valor',(select count(*) from erp_aprovacoes where status='PENDENTE'),'link','/seguranca');
  r=r||jsonb_build_object('chave','alertas','rotulo','Alertas abertos','valor',(select count(*) from sys_alertas where resolvido_em is null),'link','/indicadores');
  r=r||jsonb_build_object('chave','ofs_atrasadas','rotulo','OFs atrasadas','valor',(select count(*) from erp_ordens_fabricacao where status in('PLANEJADA','LIBERADA') and prazo<current_date),'link','/ordens-fabricacao');
  r=r||jsonb_build_object('chave','revisoes','rotulo','Revisões de pedido abertas','valor',(select count(*) from pcp_pedido_revisoes where status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA')),'link','/wms');
 end if;
 if p_cargo in('PCP','GERENTE','DIRETOR','ADMINISTRADOR','QUALIDADE') then
  r=r||jsonb_build_object('chave','ncs','rotulo','NCs abertas','valor',(select count(*) from qld_nao_conformidades where status<>'ENCERRADA'),'link','/qualidade-inspecao');
 end if;
 if p_cargo in('GERENTE','DIRETOR','ADMINISTRADOR','PCP') then
  r=r||jsonb_build_object('chave','receber_vencido','rotulo','A receber vencido','valor',(select coalesce(sum(valor-valor_baixado),0) from fin_titulos where tipo='RECEBER' and status in('ABERTO','PARCIAL') and vencimento<current_date),'link','/financeiro','moeda',true);
  r=r||jsonb_build_object('chave','pagar_vencido','rotulo','A pagar vencido','valor',(select coalesce(sum(valor-valor_baixado),0) from fin_titulos where tipo='PAGAR' and status in('ABERTO','PARCIAL') and vencimento<current_date),'link','/financeiro','moeda',true);
 end if;
 if p_cargo in('LOGISTICA','PCP','GERENTE','ENCARREGADO') then
  r=r||jsonb_build_object('chave','embalagem','rotulo','Planos de embalagem em aberto','valor',(select count(*) from emb_planos where status in('RASCUNHO','EM_EMBALAGEM')),'link','/embalagem');
 end if;
 if p_cargo in('ENCARREGADO','SUPERVISOR','LIDER','PCP','GERENTE') then
  r=r||jsonb_build_object('chave','ofs_liberadas','rotulo','OFs liberadas','valor',(select count(*) from erp_ordens_fabricacao where status='LIBERADA'),'link','/ordens-fabricacao');
 end if;
 return r;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-11_34_plataforma_eventos_campos_notificacoes.sql','c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-11_34_plataforma_eventos_campos_notificacoes.sql','c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594','APLICAR',current_user,'APLICADA');
COMMIT;
