-- PARTE 1 de 4 — migrações 08 a 16. Execute na ordem 1,2,3,4. Pode rodar de novo sem problema.
-- Preparação do controle, derivada da migração 02. Não marca migrações como aplicadas.
BEGIN;
create table if not exists schema_migrations (
  name varchar(200) primary key,
  checksum char(64) not null,
  aplicada_em timestamptz,
  aplicada_por varchar(160),
  duracao_ms bigint not null default 0,
  status varchar(20) not null default 'APLICADA' check (status in ('APLICADA', 'BASELINE', 'REVERTIDA', 'FALHOU')),
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists schema_migration_events (
  id bigserial primary key,
  migration_name varchar(200) not null,
  checksum char(64) not null,
  acao varchar(20) not null check (acao in ('BASELINE', 'APLICAR', 'REVERTER')),
  actor varchar(160) not null,
  status varchar(20) not null check (status in ('BASELINE', 'APLICADA', 'REVERTIDA', 'FALHOU')),
  duracao_ms bigint not null default 0,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists ix_schema_migrations_status on schema_migrations(status, aplicada_em desc);
create index if not exists ix_schema_migration_events_name on schema_migration_events(migration_name, criado_em desc);
COMMIT;

-- >>>>>>>>>> migração 08_competencias_programacao
-- GERADO do arquivo canônico 2026-10-21_08_competencias_programacao.sql; SHA256 96c03490764cd802fee4d12bb405eb0246d1b8567b658e18e2811b8af4b36608
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_04_unidades_globais.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_08_competencias_programacao.sql' and status in('APLICADA','BASELINE')) then null;end if;
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

-- >>>>>>>>>> migração 09_historico_seguro
-- GERADO do arquivo canônico 2026-10-22_09_historico_seguro.sql; SHA256 1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_fundacao_multiempresa.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_09_historico_seguro.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_09_historico_seguro.sql' and checksum<>'1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
alter table pcp_programacoes add column if not exists arquivada boolean not null default false;
alter table pcp_programacoes add column if not exists arquivada_em timestamptz;
alter table pcp_programacoes add column if not exists arquivada_por text;
create or replace function pcp_arquivar_historico(p_ator text) returns integer language plpgsql as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('pcp:arquivar-historico',0));
 with alteradas as(update pcp_programacoes set arquivada=true,arquivada_em=clock_timestamp(),arquivada_por=p_ator where status<>'ATIVA' and not arquivada returning *)
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select p_ator,'ARQUIVAR','PROGRAMACAO',id::text,to_jsonb(alteradas) from alteradas;
 get diagnostics n=row_count;
 return n;
end$$;
create or replace function pcp_arquivar_programacao(p_id uuid,p_ator text) returns boolean language plpgsql as $$
begin
 with alterada as(update pcp_programacoes set status=case when status='ATIVA' then 'ENCERRADA' else status end,arquivada=true,arquivada_em=clock_timestamp(),arquivada_por=p_ator where id=p_id and not arquivada returning *)
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select p_ator,'ARQUIVAR','PROGRAMACAO',id::text,to_jsonb(alterada) from alterada;
 return found;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_09_historico_seguro.sql','1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_09_historico_seguro.sql','1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 10_ciclo_industrial
-- GERADO do arquivo canônico 2026-10-22_10_ciclo_industrial.sql; SHA256 bd592492fdba5cb375919cc7e60674641c20354c66abef552eb3f29fe765b394
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_06_engenharia_of.sql, 2026-10-22_09_historico_seguro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_10_ciclo_industrial.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_10_ciclo_industrial.sql' and checksum<>'bd592492fdba5cb375919cc7e60674641c20354c66abef552eb3f29fe765b394') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Expansão: OF, operações, apontamentos e ledger existentes continuam sendo as fontes.
alter table pcp_capacidades_maquina add column if not exists calendario jsonb not null default '{}';
alter table pcp_capacidades_maquina add column if not exists empresa_id uuid references pcp_empresas(id);
alter table pcp_capacidades_maquina add column if not exists filial_id uuid references pcp_filiais(id);
create table if not exists erp_roteiros(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,filial_id uuid not null,
 produto_id uuid not null references est_produtos(id),versao integer not null,status text not null default 'RASCUNHO' check(status in('RASCUNHO','APROVADA')),
 operacoes jsonb not null check(jsonb_typeof(operacoes)='array'),request_id uuid not null unique,requisicao jsonb not null,
 criado_por text not null,criado_em timestamptz not null default now(),aprovado_por text,
 foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id),unique(produto_id,versao),unique(id,empresa_id,filial_id)
);
create table if not exists erp_versoes_producao(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,filial_id uuid not null,
 produto_id uuid not null references est_produtos(id),estrutura_id uuid not null references erp_estruturas(id),roteiro_id uuid not null,
 inicio date not null,fim date, minimo numeric not null default 0 check(minimo>=0),maximo numeric check(maximo is null or maximo>=minimo),
 criado_por text not null,criado_em timestamptz not null default now(),check(fim is null or fim>=inicio),
 foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id),foreign key(roteiro_id,empresa_id,filial_id) references erp_roteiros(id,empresa_id,filial_id)
);
create or replace function erp_revisao_protegida() returns trigger language plpgsql as $$begin
 if tg_table_name='erp_versoes_producao' or old.status='APROVADA' then raise exception 'Revisão imutável: cadastre nova versão';end if;
 return new;end$$;
drop trigger if exists erp_roteiro_protegido on erp_roteiros;
create trigger erp_roteiro_protegido before update or delete on erp_roteiros for each row execute function erp_revisao_protegida();
drop trigger if exists erp_versao_protegida on erp_versoes_producao;
create trigger erp_versao_protegida before update or delete on erp_versoes_producao for each row execute function erp_revisao_protegida();
alter table erp_ordens_fabricacao alter column origem_produto_id drop not null;
alter table erp_ordens_fabricacao add column if not exists empresa_id uuid references pcp_empresas(id);
alter table erp_ordens_fabricacao add column if not exists filial_id uuid references pcp_filiais(id);
alter table erp_ordens_fabricacao add column if not exists versao_producao_id uuid references erp_versoes_producao(id);
alter table erp_ordens_fabricacao add column if not exists of_pai_id uuid references erp_ordens_fabricacao(id);
alter table erp_ordens_fabricacao add column if not exists origem_raiz_id uuid references pcp_produtos(id);
alter table erp_ordens_fabricacao add column if not exists snapshot jsonb;
alter table erp_ordens_fabricacao add column if not exists local_id uuid references est_locais(id);
alter table erp_ordens_fabricacao add column if not exists falta_saldo text not null default 'BLOQUEAR' check(falta_saldo in('BLOQUEAR','PENDENTE'));
alter table pcp_operacoes alter column produto_id drop not null;
alter table pcp_operacoes add column if not exists of_id uuid references erp_ordens_fabricacao(id);
alter table pcp_operacoes add column if not exists roteiro_snapshot jsonb;
create index if not exists erp_op_of on pcp_operacoes(of_id,sequencia);
create index if not exists erp_of_pai on erp_ordens_fabricacao(of_pai_id);
create table if not exists pcp_apontamentos(id bigserial primary key,operacao_id uuid references pcp_operacoes(id),pedido varchar(80) not null default '',of varchar(80) not null default '',processo varchar(80) not null default '',tipo varchar(30) not null,quantidade numeric(16,3) not null,request_id varchar(80),usuario varchar(120) not null default '',data_producao date not null default ((now() at time zone 'America/Sao_Paulo')::date),criado_em timestamptz not null default now());
create unique index if not exists ux_pcp_apont_request on pcp_apontamentos(request_id) where request_id is not null;
alter table pcp_apontamentos add column if not exists ciclo_payload jsonb;
alter table pcp_apontamentos add column if not exists estoque_status text;
alter table pcp_apontamentos add column if not exists estoque_erro text;
alter table pcp_apontamentos add column if not exists estorno_de bigint references pcp_apontamentos(id);
create unique index if not exists erp_apont_estorno_unico on pcp_apontamentos(estorno_de) where estorno_de is not null;
create table if not exists est_lotes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,filial_id uuid not null,produto_id uuid not null references est_produtos(id),
 codigo text not null,serie text,validade date,criado_por text not null,criado_em timestamptz not null default now(),
 foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id),unique(produto_id,codigo),unique(produto_id,serie)
);
alter table est_movimentos add column if not exists empresa_id uuid references pcp_empresas(id);
alter table est_movimentos add column if not exists filial_id uuid references pcp_filiais(id);
alter table est_movimentos add column if not exists of_id uuid references erp_ordens_fabricacao(id);
alter table est_movimentos add column if not exists operacao_id uuid references pcp_operacoes(id);
alter table est_movimentos add column if not exists apontamento_id bigint references pcp_apontamentos(id);
alter table est_movimentos add column if not exists lote_id uuid references est_lotes(id);
alter table est_movimentos add column if not exists estorno_de bigint references est_movimentos(id);
alter table est_movimentos add column if not exists custo_total numeric(20,6) not null default 0 check(custo_total>=0);
create index if not exists est_mov_rastreio on est_movimentos(lote_id,of_id,apontamento_id);
create table if not exists est_custeio_alocacoes(
 entrada_id bigint not null references est_movimentos(id),saida_id bigint not null references est_movimentos(id),
 quantidade numeric(16,3) not null,custo numeric(20,6) not null,empresa_id uuid not null,filial_id uuid not null,
 primary key(entrada_id,saida_id),foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id)
);
drop trigger if exists est_custeio_imutavel on est_custeio_alocacoes;
create trigger est_custeio_imutavel before update or delete on est_custeio_alocacoes for each row execute function est_mov_imutavel();
create or replace view est_saldos_lotes as
 select produto_id,lote_id,coalesce(local_destino_id,local_origem_id) local_id,
 sum(case when tipo='ENTRADA' then quantidade_base when tipo='SAIDA' then -quantidade_base else 0 end) saldo
 from est_movimentos where lote_id is not null group by produto_id,lote_id,coalesce(local_destino_id,local_origem_id);
alter table pcp_pallets add column if not exists apontamento_id bigint references pcp_apontamentos(id);
alter table pcp_pallets add column if not exists lote_id uuid references est_lotes(id);
create unique index if not exists pcp_pallet_apont_unico on pcp_pallets(apontamento_id) where apontamento_id is not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='erp_ordens_fabricacao'::regclass and conname='erp_of_ciclo_filial_fk') then alter table erp_ordens_fabricacao add constraint erp_of_ciclo_filial_fk foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id);end if;
 if not exists(select 1 from pg_constraint where conrelid='est_movimentos'::regclass and conname='est_mov_ciclo_filial_fk') then alter table est_movimentos add constraint est_mov_ciclo_filial_fk foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id);end if;
 if not exists(select 1 from pg_constraint where conrelid='pcp_capacidades_maquina'::regclass and conname='erp_centro_filial_fk') then alter table pcp_capacidades_maquina add constraint erp_centro_filial_fk foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id);end if;
 if not exists(select 1 from pg_constraint where conrelid='erp_ordens_fabricacao'::regclass and conname='erp_of_ciclo_scope_ck') then alter table erp_ordens_fabricacao add constraint erp_of_ciclo_scope_ck check(versao_producao_id is null or (empresa_id is not null and filial_id is not null and snapshot is not null and local_id is not null and origem_raiz_id is not null));end if;
 if not exists(select 1 from pg_constraint where conrelid='pcp_operacoes'::regclass and conname='erp_operacao_origem_ck') then alter table pcp_operacoes add constraint erp_operacao_origem_ck check(produto_id is not null or of_id is not null);end if;
end$$;
create or replace function erp_ciclo_auditar(ator text,acao text,entidade text,id text,dados jsonb) returns void language sql as $$
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) values(ator,acao,entidade,id,dados);
$$;
-- Serializa planejamento, reserva e execução; saldos também recebem row lock, inclusive contra o fluxo legado.
create or replace function erp_ciclo_mov(p_tipo text,p_prod uuid,p_local uuid,p_q numeric,p_of uuid,p_op uuid,p_ap bigint,p_lote uuid,p_key text,p_ator text,p_custo numeric default 0,p_estorno bigint default null)
returns bigint language plpgsql as $$
declare o erp_ordens_fabricacao%rowtype;s est_saldos%rowtype;l est_lotes%rowtype;v_id bigint;v_res numeric;v_custo numeric:=p_custo;u text;fracionavel boolean;v_rest numeric;rec record;v_usar numeric;v_legado numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 if p_key is null or p_key='' then raise exception 'Chave idempotente obrigatória';end if;
 if length(p_key)>70 then p_key='C:'||md5(p_key);end if;
 if p_tipo not in('ENTRADA','SAIDA','RESERVA','LIBERA_RESERVA') or p_q<=0 or p_q<>round(p_q,3) then raise exception 'Movimento ou quantidade inválida';end if;
 if p_of is not null then select * into strict o from erp_ordens_fabricacao where id=p_of;else select empresa_id,filial_id into strict o.empresa_id,o.filial_id from est_lotes where id=p_lote and produto_id=p_prod;end if;
 select id into v_id from est_movimentos where request_id=p_key;
 if v_id is not null then
  if not exists(select 1 from est_movimentos where id=v_id and tipo=p_tipo and produto_id=p_prod and quantidade_base=p_q and of_id is not distinct from p_of and lote_id is not distinct from p_lote and coalesce(local_origem_id,local_destino_id)=p_local) then raise exception 'Chave de movimento reutilizada com outros dados';end if;return v_id;
 end if;
 select p.unidade_base,ub.fracionavel into strict u,fracionavel from est_produtos p join est_unidades ub on ub.codigo=p.unidade_base where p.id=p_prod and p.ativo;
 if not fracionavel and p_q<>trunc(p_q) then raise exception 'Produto não fracionável';end if;
 if not exists(select 1 from est_locais where id=p_local and ativo) then raise exception 'Depósito inválido';end if;
 if exists(select 1 from est_inventarios where status='EM_CONTAGEM' and (tipo='GERAL' or local_id=p_local)) then raise exception 'Depósito com inventário em contagem';end if;
 if p_lote is not null then
  select * into strict l from est_lotes where id=p_lote and produto_id=p_prod and empresa_id=o.empresa_id and filial_id=o.filial_id;
  if l.serie is not null and p_q<>1 then raise exception 'Série exige movimento de uma unidade';end if;
  if l.validade<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Lote vencido';end if;
  if p_tipo='SAIDA' and coalesce((select saldo from est_saldos_lotes where lote_id=p_lote and local_id=p_local),0)<p_q then raise exception 'SALDO_INSUFICIENTE: lote';end if;
  if p_tipo='ENTRADA' and l.serie is not null and coalesce((select sum(saldo) from est_saldos_lotes where lote_id=p_lote),0)+p_q>1 then raise exception 'Série admite uma unidade';end if;
 end if;
 insert into est_saldos(produto_id,local_id) values(p_prod,p_local) on conflict do nothing;
 select * into strict s from est_saldos where produto_id=p_prod and local_id=p_local for update;
 select greatest(0,coalesce(sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' or (tipo='SAIDA' and baixa_reserva) then -quantidade_base else 0 end),0)) into v_res from est_movimentos where of_id=p_of and produto_id=p_prod and local_origem_id=p_local;
 if p_tipo='RESERVA' and s.fisico-s.reservado-s.bloqueado<p_q then raise exception 'SALDO_INSUFICIENTE: reserva';end if;
 if p_tipo='LIBERA_RESERVA' and v_res<p_q then raise exception 'Reserva da OF insuficiente';end if;
 if p_tipo='SAIDA' and s.fisico-s.bloqueado-(s.reservado-least(v_res,p_q))<p_q then raise exception 'SALDO_INSUFICIENTE: componente';end if;
 -- Reserva parcial é liberada em movimento próprio, evitando baixar reserva de outra OF.
 if p_tipo='SAIDA' and v_res>0 then perform erp_ciclo_mov('LIBERA_RESERVA',p_prod,p_local,least(v_res,p_q),p_of,p_op,p_ap,null,p_key||':R',p_ator);end if;
 if p_tipo='SAIDA' and p_estorno is null then
  select coalesce(sum(case when tipo='ENTRADA' then custo_total when tipo='SAIDA' then -custo_total else 0 end),0)/nullif(s.fisico,0) into v_custo from est_movimentos where produto_id=p_prod and (local_destino_id=p_local or local_origem_id=p_local);
  v_custo=greatest(0,coalesce(v_custo,0))*p_q;
 end if;
 update est_saldos set fisico=fisico+case when p_tipo='ENTRADA' then p_q when p_tipo='SAIDA' then -p_q else 0 end,
 reservado=reservado+case when p_tipo='RESERVA' then p_q when p_tipo='LIBERA_RESERVA' then -p_q else 0 end,atualizado_em=now() where produto_id=p_prod and local_id=p_local;
 insert into est_movimentos(tipo,produto_id,local_origem_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,pedido,of,of_id,operacao_id,apontamento_id,lote_id,request_id,usuario,empresa_id,filial_id,custo_total,estorno_de)
 values(p_tipo,p_prod,case when p_tipo<>'ENTRADA' then p_local end,case when p_tipo='ENTRADA' then p_local end,p_q,p_q,u,coalesce(o.pedido,''),coalesce('OF-'||o.numero,''),p_of,p_op,p_ap,p_lote,p_key,p_ator,o.empresa_id,o.filial_id,case when p_tipo in('RESERVA','LIBERA_RESERVA') then 0 else v_custo end,p_estorno) returning id into v_id;
 -- PEPS como valorização auxiliar: alocações imutáveis dos recebimentos, sem segundo ledger.
 if p_tipo='SAIDA' then
  v_rest=p_q;
  select coalesce(sum(greatest(0,m.quantidade_base-coalesce((select sum(a.quantidade) from est_custeio_alocacoes a where a.saida_id=m.id),0)-coalesce((select sum(r.quantidade_base) from est_movimentos r where r.tipo='ENTRADA' and r.estorno_de=m.id),0))),0) into v_legado from est_movimentos m where m.tipo='SAIDA' and m.produto_id=p_prod and m.local_origem_id=p_local and m.id<>v_id and (p_lote is null or m.lote_id=p_lote);
  for rec in select m.id,m.quantidade_base,m.custo_total,m.quantidade_base-coalesce((select sum(a.quantidade) from est_custeio_alocacoes a where a.entrada_id=m.id),0) livre from est_movimentos m where m.produto_id=p_prod and m.local_destino_id=p_local and m.tipo='ENTRADA' and m.estorno_de is null and (p_lote is null or m.lote_id=p_lote) order by m.id loop
   v_usar=least(v_legado,greatest(0,rec.livre));v_legado=v_legado-v_usar;rec.livre=rec.livre-v_usar;
   v_usar=least(v_rest,greatest(0,rec.livre));if v_usar>0 then
    insert into est_custeio_alocacoes values(rec.id,v_id,v_usar,v_usar*rec.custo_total/rec.quantidade_base,o.empresa_id,o.filial_id);
    v_rest=v_rest-v_usar;end if;exit when v_rest=0;
  end loop;
  -- Saldo legado sem entrada de origem não recebe custo inventado.
 elsif p_tipo='ENTRADA' and p_estorno is not null then
  insert into est_custeio_alocacoes select entrada_id,v_id,-quantidade,-custo,o.empresa_id,o.filial_id from est_custeio_alocacoes where saida_id=p_estorno;
 end if;
 perform erp_ciclo_auditar(p_ator,p_tipo,'EST_MOVIMENTO',v_id::text,jsonb_build_object('of',p_of,'apontamento',p_ap,'quantidade',p_q,'lote',p_lote));return v_id;
end$$;
create or replace function erp_ciclo_roteiro(p_emp uuid,p_fil uuid,p_prod uuid,p_ops jsonb,p_request uuid,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_payload jsonb;v_old jsonb;v_versao int;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 v_payload=jsonb_build_object('empresa',p_emp,'filial',p_fil,'produto',p_prod,'operacoes',p_ops);
 select id,requisicao into v_id,v_old from erp_roteiros where request_id=p_request;
 if v_id is not null then if v_old<>v_payload then raise exception 'Chave de roteiro reutilizada';end if;return v_id;end if;
 if jsonb_array_length(p_ops)=0 or jsonb_array_length(p_ops)>100 then raise exception 'Informe até 100 operações';end if;
 if exists(select 1 from jsonb_to_recordset(p_ops) x(sequencia int,processo text,centro_id uuid,chave text,setup numeric,ciclo numeric,parcial boolean,entrada boolean,componentes jsonb)
 left join pcp_capacidades_maquina c on c.id=x.centro_id where c.id is null or c.empresa_id<>p_emp or c.filial_id<>p_fil or x.processo<>c.processo or x.chave not in('INTERNA','EXTERNA') or x.setup<0 or x.ciclo<=0 or x.sequencia<1 or x.componentes is null or jsonb_typeof(x.componentes)<>'array') then raise exception 'Operação, centro, turno ou chave inválidos';end if;
 if (select count(distinct (v->>'sequencia')::int) from jsonb_array_elements(p_ops) v)<>jsonb_array_length(p_ops) then raise exception 'Sequência repetida';end if;
 if (select count(*) from jsonb_array_elements(p_ops) v where (v->>'entrada')::boolean)<>1 or not (select (v->>'entrada')::boolean from jsonb_array_elements(p_ops) v order by (v->>'sequencia')::int desc limit 1) then raise exception 'Somente a última operação deve gerar entrada';end if;
 if exists(select 1 from jsonb_array_elements(p_ops) op cross join lateral jsonb_array_elements(op->'componentes') c where c->>'consumo' not in('AUTOMATICO','MANUAL')) then raise exception 'Modo de consumo inválido';end if;
 select coalesce(max(versao),0)+1 into v_versao from erp_roteiros where produto_id=p_prod;
 insert into erp_roteiros(empresa_id,filial_id,produto_id,versao,operacoes,request_id,requisicao,criado_por) values(p_emp,p_fil,p_prod,v_versao,p_ops,p_request,v_payload,p_ator) returning id into v_id;
 perform erp_ciclo_auditar(p_ator,'CRIAR_ROTEIRO','ROTEIRO',v_id::text,v_payload);return v_id;
end$$;
create or replace function erp_ciclo_aprovar_roteiro(p_id uuid,p_ator text) returns uuid language plpgsql as $$begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 update erp_roteiros set status='APROVADA',aprovado_por=p_ator where id=p_id and status='RASCUNHO';
 if not exists(select 1 from erp_roteiros where id=p_id) then raise exception 'Roteiro não encontrado';end if;
 if found then perform erp_ciclo_auditar(p_ator,'APROVAR_ROTEIRO','ROTEIRO',p_id::text,'{}');end if;return p_id;
end$$;
create or replace function erp_ciclo_versao(p_emp uuid,p_fil uuid,p_bom uuid,p_roteiro uuid,p_inicio date,p_fim date,p_min numeric,p_max numeric,p_ator text) returns uuid language plpgsql as $$
declare b erp_estruturas%rowtype;r erp_roteiros%rowtype;v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into strict b from erp_estruturas where id=p_bom and status='APROVADA';
 select * into strict r from erp_roteiros where id=p_roteiro and status='APROVADA' and produto_id=b.produto_id and empresa_id=p_emp and filial_id=p_fil;
 if exists(select 1 from jsonb_array_elements(r.operacoes) op cross join lateral jsonb_array_elements(op->'componentes') c full join erp_estrutura_itens i on i.estrutura_id=p_bom and i.componente_id=(c->>'produto_id')::uuid where i.componente_id is null) then raise exception 'Componente fora da BOM';end if;
 if exists(select 1 from erp_estrutura_itens i where i.estrutura_id=p_bom and (select count(*) from jsonb_array_elements(r.operacoes) op cross join lateral jsonb_array_elements(op->'componentes') c where (c->>'produto_id')::uuid=i.componente_id)<>1) then raise exception 'Cada componente deve pertencer a exatamente uma operação';end if;
 if exists(select 1 from erp_versoes_producao where produto_id=b.produto_id and empresa_id=p_emp and filial_id=p_fil and daterange(inicio,fim,'[]')&&daterange(p_inicio,p_fim,'[]') and numrange(minimo,maximo,'[]')&&numrange(p_min,p_max,'[]')) then raise exception 'Versão com validade e faixa de lote sobrepostas';end if;
 insert into erp_versoes_producao(empresa_id,filial_id,produto_id,estrutura_id,roteiro_id,inicio,fim,minimo,maximo,criado_por) values(p_emp,p_fil,b.produto_id,p_bom,p_roteiro,p_inicio,p_fim,p_min,p_max,p_ator) returning id into v_id;
 perform erp_ciclo_auditar(p_ator,'CRIAR_VERSAO_PRODUCAO','VERSAO_PRODUCAO',v_id::text,to_jsonb(r));return v_id;
end$$;
-- OF filha usa a mesma entidade; não cria demanda fictícia nem duplica pcp_produtos.
create or replace function erp_ciclo_gerar(p_emp uuid,p_fil uuid,p_prod uuid,p_q numeric,p_data date,p_local uuid,p_politica text,p_usar_saldo boolean,p_origem uuid,p_raiz uuid,p_pai uuid,p_ator text,p_caminho uuid[] default '{}') returns uuid language plpgsql as $$
declare v erp_versoes_producao%rowtype;r erp_roteiros%rowtype;o_id uuid;op jsonb;comp record;op_id uuid;v_snapshot jsonb;v_necessidade numeric;livre numeric;pedido_ref text;v_exist uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 if p_prod=any(p_caminho) or cardinality(p_caminho)>=25 then raise exception 'BOM cíclica ou profunda demais';end if;
 if p_q<=0 or p_q<>round(p_q,3) then raise exception 'Quantidade inválida';end if;
 if exists(select 1 from est_produtos p join est_unidades u on u.codigo=p.unidade_base where p.id=p_prod and not u.fracionavel and p_q<>trunc(p_q)) then raise exception 'Produto não fracionável';end if;
 if p_origem is not null then
  select id into v_exist from erp_ordens_fabricacao where origem_produto_id=p_origem;
  if v_exist is not null then
   if not exists(select 1 from erp_ordens_fabricacao where id=v_exist and versao_producao_id is not null and local_id=p_local and prazo=p_data and falta_saldo=p_politica and quantidade=p_q and (snapshot->>'usarSaldoSemi')::boolean=p_usar_saldo and empresa_id=p_emp and filial_id=p_fil) then raise exception 'Origem já vinculada a outra OF';end if;return v_exist;
  end if;
 end if;
 select * into v from erp_versoes_producao where produto_id=p_prod and empresa_id=p_emp and filial_id=p_fil and inicio<=p_data and (fim is null or fim>=p_data) and minimo<=p_q and (maximo is null or maximo>=p_q);
 if v.id is null then raise exception 'Não existe versão de produção válida com BOM e roteiro aprovados para esta data e quantidade';end if;
 select * into strict r from erp_roteiros where id=v.roteiro_id and status='APROVADA';
 if not exists(select 1 from est_locais where id=p_local and ativo) then raise exception 'Depósito inválido';end if;
 select pedido into strict pedido_ref from pcp_produtos where id=p_raiz;
 if p_origem is not null and not exists(select 1 from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id join est_produtos ep on ep.id=p_prod where p.id=p_origem and p.quantidade=p_q and upper(regexp_replace(trim(p.produto),'\s+','','g'))=ep.codigo and g.status in('ATIVA','ENCERRADA') and not coalesce((to_jsonb(g)->>'arquivada')::boolean,false)) then raise exception 'Origem não corresponde ao produto ou programação válida';end if;
 if exists(select 1 from erp_explodir_estrutura(v.estrutura_id,1) where ciclo) then raise exception 'BOM cíclica';end if;
 select jsonb_build_object('usarSaldoSemi',p_usar_saldo,'bom',to_jsonb(e),'componentes',(select jsonb_agg(to_jsonb(i)) from erp_estrutura_itens i where i.estrutura_id=e.id),'roteiro',to_jsonb(r)) into v_snapshot from erp_estruturas e where e.id=v.estrutura_id;
 insert into erp_ordens_fabricacao(origem_produto_id,origem_raiz_id,produto_estoque_id,estrutura_id,quantidade,pedido,criado_por,prazo,empresa_id,filial_id,versao_producao_id,of_pai_id,snapshot,local_id,falta_saldo)
 values(p_origem,p_raiz,p_prod,v.estrutura_id,p_q,pedido_ref,p_ator,p_data,p_emp,p_fil,v.id,p_pai,v_snapshot,p_local,p_politica) returning id into o_id;
 perform set_config('erp.ciclo_write','on',true);
 if p_origem is not null and exists(select 1 from pcp_operacoes po where po.produto_id=p_origem and (po.quantidade_produzida<>0 or po.quantidade_refugo<>0 or po.status not in('PENDENTE','LIBERADA') or not exists(select 1 from jsonb_array_elements(r.operacoes) x where (x->>'sequencia')::int=po.sequencia and x->>'processo'=po.processo))) then raise exception 'Roteiro difere das operações existentes ou há produção; revise a engenharia antes da OF';end if;
 for op in select value from jsonb_array_elements(r.operacoes) order by (value->>'sequencia')::int loop
  op_id=null;
  if p_origem is not null then select id into op_id from pcp_operacoes where produto_id=p_origem and sequencia=(op->>'sequencia')::int and processo=op->>'processo';end if;
  if op_id is null then
   insert into pcp_operacoes(produto_id,of_id,processo,sequencia,quantidade_planejada,roteiro_snapshot) values(p_origem,o_id,op->>'processo',(op->>'sequencia')::int,p_q,op) returning id into op_id;
  else update pcp_operacoes set of_id=o_id,roteiro_snapshot=op where id=op_id;end if;
 end loop;
 for comp in select i.*,p.classificacao,u.fracionavel from erp_estrutura_itens i join est_produtos p on p.id=i.componente_id join est_unidades u on u.codigo=p.unidade_base where estrutura_id=v.estrutura_id order by componente_id loop
  v_necessidade=case when comp.fracionavel then ceil(p_q*comp.quantidade*(1+comp.perda_percentual/100)*1000)/1000 else ceil(p_q*comp.quantidade*(1+comp.perda_percentual/100)) end;
  insert into erp_of_materiais values(o_id,comp.componente_id,v_necessidade);
  if comp.classificacao='SEMIACABADO' then
   livre=0;if p_usar_saldo then select greatest(0,coalesce(fisico-reservado-bloqueado,0)) into livre from est_saldos where produto_id=comp.componente_id and local_id=p_local;livre=coalesce(livre,0);end if;
   if v_necessidade>livre then perform erp_ciclo_gerar(p_emp,p_fil,comp.componente_id,v_necessidade-livre,p_data,p_local,p_politica,p_usar_saldo,null,p_raiz,o_id,p_ator,p_caminho||p_prod);end if;
  end if;
 end loop;
 perform erp_ciclo_auditar(p_ator,'GERAR_OF_ENGENHARIA','ORDEM_FABRICACAO',o_id::text,v_snapshot);return o_id;
end$$;
-- Não permite que a API legada altere quantidades de uma OF integrada sem movimentar estoque.
create or replace function erp_validar_apontamento_of() returns trigger language plpgsql as $$
declare st text;v uuid;
begin
 select status,versao_producao_id into st,v from erp_ordens_fabricacao where id=new.of_id or (origem_produto_id=new.produto_id and new.of_id is null) for update;
 if v is not null then
  if current_setting('erp.ciclo_write',true) is distinct from 'on' then raise exception 'Use o apontamento integrado por operação desta OF';end if;
 elsif st is not null and st<>'LIBERADA' then raise exception 'Libere ou reabra a OF antes de alterar a operação';end if;
 return new;
end$$;
create or replace function erp_ciclo_confirmar(p_id uuid,p_ator text) returns uuid language plpgsql as $$
declare o erp_ordens_fabricacao%rowtype;f record;m record;disponivel numeric;precisa numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into strict o from erp_ordens_fabricacao where id=p_id and versao_producao_id is not null for update;
 if o.status='LIBERADA' then return p_id;end if;
 if o.status<>'PLANEJADA' then raise exception 'Confirmação inválida';end if;
 -- Mesma barreira de medição/qualidade da OF existente, antes de qualquer reserva.
 if o.origem_produto_id is not null then perform erp_transicionar_of(p_id,'LIBERAR',p_ator);update erp_ordens_fabricacao set status='PLANEJADA' where id=p_id;end if;
 for f in select id from erp_ordens_fabricacao where of_pai_id=p_id order by id loop perform erp_ciclo_confirmar(f.id,p_ator);end loop;
 -- O snapshot direto inclui semiacabados; substitui a explosão achatada do liberador legado ainda na mesma transação.
 delete from erp_of_materiais where of_id=p_id;
 insert into erp_of_materiais select p_id,(i->>'componente_id')::uuid,case when u.fracionavel then ceil(o.quantidade*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100)*1000)/1000 else ceil(o.quantidade*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100)) end from jsonb_array_elements(o.snapshot->'componentes') i join est_produtos p on p.id=(i->>'componente_id')::uuid join est_unidades u on u.codigo=p.unidade_base;
 for m in select * from erp_of_materiais where of_id=p_id order by produto_id loop
  select greatest(0,fisico-reservado-bloqueado) into disponivel from est_saldos where produto_id=m.produto_id and local_id=o.local_id for update;disponivel=coalesce(disponivel,0);
  precisa=least(m.necessidade,disponivel);
  if precisa<m.necessidade and not exists(select 1 from erp_ordens_fabricacao where of_pai_id=p_id and produto_estoque_id=m.produto_id and quantidade>=m.necessidade-precisa) and o.falta_saldo='BLOQUEAR' then raise exception 'SALDO_INSUFICIENTE: confirmação';end if;
  if precisa>0 then perform erp_ciclo_mov('RESERVA',m.produto_id,o.local_id,precisa,p_id,null,null,null,'R:'||p_id||':'||m.produto_id,p_ator);end if;
 end loop;
 update erp_ordens_fabricacao set status='LIBERADA',liberado_em=now() where id=p_id;
 perform set_config('erp.ciclo_write','on',true);
 update pcp_operacoes set status='LIBERADA' where of_id=p_id and sequencia=(select min(sequencia) from pcp_operacoes where of_id=p_id);
 perform erp_ciclo_auditar(p_ator,'CONFIRMAR_OF','ORDEM_FABRICACAO',p_id::text,jsonb_build_object('snapshot',o.snapshot));return p_id;
end$$;
create or replace function erp_ciclo_processar(p_ap bigint,p_ator text) returns bigint language plpgsql as $$
declare a pcp_apontamentos%rowtype;op pcp_operacoes%rowtype;o erp_ordens_fabricacao%rowtype;i jsonb;c jsonb;escolha jsonb;v_q numeric;v_consumida numeric;v_boas numeric;v_refugo numeric;v_total numeric;v_anterior numeric;v_lote uuid;v_mov bigint;v_saldo numeric;v_rest numeric;v_tomar numeric;v_local uuid;v_prod uuid;v_erro text;v_custo numeric;rec record;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into strict a from pcp_apontamentos where id=p_ap and tipo='CICLO' for update;
 if a.estoque_status in('PROCESSADO','ESTORNADO') then return p_ap;end if;
 select * into strict op from pcp_operacoes where id=a.operacao_id;
 select * into strict o from erp_ordens_fabricacao where id=op.of_id;
 if o.status<>'LIBERADA' then raise exception 'OF não liberada';end if;
 v_boas=(a.ciclo_payload->>'boa')::numeric;v_refugo=(a.ciclo_payload->>'refugo')::numeric;
 begin
  for c in select value from jsonb_array_elements(op.roteiro_snapshot->'componentes') loop
   v_prod=(c->>'produto_id')::uuid;
   select value into strict i from jsonb_array_elements(o.snapshot->'componentes') where (value->>'componente_id')::uuid=v_prod;
   v_total=v_boas+case when coalesce((a.ciclo_payload->>'consumirRefugo')::boolean,true) then v_refugo else 0 end;
   -- Diferença entre necessidades acumuladas evita arredondar cada parcial para cima.
   select coalesce(sum((ciclo_payload->>'boa')::numeric+case when coalesce((ciclo_payload->>'consumirRefugo')::boolean,true) then (ciclo_payload->>'refugo')::numeric else 0 end),0) into v_anterior from pcp_apontamentos where operacao_id=op.id and tipo='CICLO' and estoque_status='PROCESSADO' and id<>p_ap;
   select case when u.fracionavel then ceil((v_anterior+v_total)*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100)*1000)/1000-ceil(v_anterior*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100)*1000)/1000 else ceil((v_anterior+v_total)*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100))-ceil(v_anterior*(i->>'quantidade')::numeric*(1+(i->>'perda_percentual')::numeric/100)) end into v_q from est_produtos p join est_unidades u on u.codigo=p.unidade_base where p.id=v_prod;
   select value into escolha from jsonb_array_elements(coalesce(a.ciclo_payload->'consumos','[]')) where (value->>'produtoId')::uuid=v_prod;
   if c->>'consumo'='MANUAL' and (escolha is null or (escolha->>'quantidade')::numeric is distinct from v_q) then raise exception 'REQUISICAO_MANUAL: informe a quantidade do componente';end if;
   v_local=coalesce((escolha->>'localId')::uuid,o.local_id);v_lote=(escolha->>'loteId')::uuid;v_rest=v_q;
   if v_rest>0 and v_lote is not null then
    perform erp_ciclo_mov('SAIDA',v_prod,v_local,v_rest,o.id,op.id,a.id,v_lote,'A:'||a.id||':'||v_prod,p_ator);v_rest=0;
   elsif v_rest>0 then
    -- Lotes recebidos/produzidos primeiro; o restante só pode usar o saldo legado não loteado.
    for rec in select l.id,s.saldo from est_lotes l join est_saldos_lotes s on s.lote_id=l.id where s.produto_id=v_prod and s.local_id=v_local and s.saldo>0 and (l.validade is null or l.validade>=(now() at time zone 'America/Sao_Paulo')::date) order by l.criado_em,l.id loop
     v_tomar=least(v_rest,rec.saldo);perform erp_ciclo_mov('SAIDA',v_prod,v_local,v_tomar,o.id,op.id,a.id,rec.id,'A:'||a.id||':'||v_prod||':'||rec.id,p_ator);v_rest=v_rest-v_tomar;exit when v_rest=0;
    end loop;
    if v_rest>0 then
     select coalesce(s.fisico,0)-coalesce((select sum(sl.saldo) from est_saldos_lotes sl where sl.produto_id=v_prod and sl.local_id=v_local),0) into v_saldo from est_saldos s where s.produto_id=v_prod and s.local_id=v_local;
     if coalesce(v_saldo,0)<v_rest then raise exception 'SALDO_INSUFICIENTE: componente ou lote';end if;
     perform erp_ciclo_mov('SAIDA',v_prod,v_local,v_rest,o.id,op.id,a.id,null,'A:'||a.id||':'||v_prod||':LEG',p_ator);
    end if;
   end if;
  end loop;
  if (op.roteiro_snapshot->>'entrada')::boolean and v_boas>0 then
   insert into est_lotes(empresa_id,filial_id,produto_id,codigo,serie,criado_por) values(o.empresa_id,o.filial_id,o.produto_estoque_id,coalesce(nullif(a.ciclo_payload->>'lote',''),'OF-'||o.numero),nullif(a.ciclo_payload->>'serie',''),p_ator) on conflict(produto_id,codigo) do nothing;
   select id into strict v_lote from est_lotes where produto_id=o.produto_estoque_id and codigo=coalesce(nullif(a.ciclo_payload->>'lote',''),'OF-'||o.numero) and empresa_id=o.empresa_id and filial_id=o.filial_id and serie is not distinct from nullif(a.ciclo_payload->>'serie','');
   select greatest(0,coalesce(sum(case when tipo='SAIDA' then custo_total when tipo='ENTRADA' then -custo_total else 0 end),0)) into v_custo from est_movimentos where of_id=o.id;
   perform erp_ciclo_mov('ENTRADA',o.produto_estoque_id,o.local_id,v_boas,o.id,op.id,a.id,v_lote,'A:'||a.id||':PROD',p_ator,v_custo);
   if exists(select 1 from est_produtos where id=o.produto_estoque_id and classificacao='ACABADO') then
    insert into pcp_pallets(codigo,pedido,pallet,tipo_produto,quantidade,criado_por,apontamento_id,lote_id) values('OF-'||o.numero||'-A-'||a.id,o.pedido,'A-'||a.id,(select codigo from est_produtos where id=o.produto_estoque_id),v_boas,p_ator,a.id,v_lote);
   end if;
  end if;
  update pcp_apontamentos set estoque_status='PROCESSADO',estoque_erro=null where id=p_ap;
  perform set_config('erp.ciclo_write','on',true);
  update pcp_operacoes set status='LIBERADA' where of_id=o.id and sequencia=(select min(sequencia) from pcp_operacoes where of_id=o.id and sequencia>op.sequencia) and status='PENDENTE';
 exception when raise_exception or check_violation then
  get stacked diagnostics v_erro=message_text;
  if o.falta_saldo<>'PENDENTE' or (v_erro not like 'SALDO_INSUFICIENTE:%' and v_erro not like 'REQUISICAO_MANUAL:%') then raise;end if;
  update pcp_apontamentos set estoque_status='PENDENTE',estoque_erro=v_erro where id=p_ap;
 end;
 perform erp_ciclo_auditar(p_ator,'PROCESSAR_APONTAMENTO','APONTAMENTO',p_ap::text,(select jsonb_build_object('estoque_status',estoque_status,'erro',estoque_erro) from pcp_apontamentos where id=p_ap));return p_ap;
end$$;
create or replace function erp_ciclo_apontar(p_op uuid,p_payload jsonb,p_key uuid,p_ator text) returns bigint language plpgsql as $$
declare op pcp_operacoes%rowtype;o erp_ordens_fabricacao%rowtype;a pcp_apontamentos%rowtype;v_id bigint;boa numeric;refugo numeric;anterior numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into a from pcp_apontamentos where request_id=p_key::text;
 if a.id is not null then if a.operacao_id<>p_op or a.ciclo_payload<>p_payload or a.usuario<>p_ator then raise exception 'Chave de apontamento reutilizada com outros dados';end if;return a.id;end if;
 select * into strict op from pcp_operacoes where id=p_op for update;
 select * into strict o from erp_ordens_fabricacao where id=op.of_id and versao_producao_id is not null for update;
 boa=(p_payload->>'boa')::numeric;refugo=(p_payload->>'refugo')::numeric;
 if boa is null or refugo is null or boa<0 or refugo<0 or boa+refugo<=0 or boa<>round(boa,3) or refugo<>round(refugo,3) then raise exception 'Quantidade de apontamento inválida';end if;
 if refugo>0 and coalesce(trim(p_payload->>'motivo'),'')='' then raise exception 'Informe o motivo do refugo';end if;
 if o.status<>'LIBERADA' or op.status not in('LIBERADA','EM_ANDAMENTO') then raise exception 'Operação não está liberada';end if;
 if op.quantidade_produzida+op.quantidade_refugo+boa+refugo>op.quantidade_planejada then raise exception 'Quantidade supera o planejado';end if;
 if not (op.roteiro_snapshot->>'parcial')::boolean and op.quantidade_produzida+op.quantidade_refugo+boa+refugo<>op.quantidade_planejada then raise exception 'Operação não permite parcial';end if;
 if op.roteiro_snapshot->>'chave'='EXTERNA' then raise exception 'Operação externa exige remessa e retorno conferidos';end if;
 select quantidade_produzida into anterior from pcp_operacoes where of_id=o.id and sequencia<op.sequencia order by sequencia desc limit 1;
 if anterior is not null and op.quantidade_produzida+boa+op.quantidade_refugo+refugo>anterior then raise exception 'Quantidade indisponível na operação anterior';end if;
 if exists(select 1 from pcp_apontamentos ax join pcp_operacoes po on po.id=ax.operacao_id where po.of_id=o.id and po.sequencia<op.sequencia and ax.estoque_status='PENDENTE') then raise exception 'Operação anterior com movimentos pendentes';end if;
 insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,request_id,usuario,ciclo_payload,estoque_status) values(p_op,o.pedido,'OF-'||o.numero,op.processo,'CICLO',boa,p_key::text,p_ator,p_payload,'PENDENTE') returning id into v_id;
 perform set_config('erp.ciclo_write','on',true);
 update pcp_operacoes set quantidade_produzida=quantidade_produzida+boa,quantidade_refugo=quantidade_refugo+refugo,status='EM_ANDAMENTO',iniciado_em=coalesce(iniciado_em,now()),atualizado_em=now() where id=p_op;
 perform erp_ciclo_processar(v_id,p_ator);
 -- Parcial processado disponibiliza a próxima operação, sem concluir quantidades artificialmente.
 if exists(select 1 from pcp_apontamentos where id=v_id and estoque_status='PROCESSADO') then update pcp_operacoes set status='LIBERADA' where of_id=o.id and sequencia=(select min(sequencia) from pcp_operacoes where of_id=o.id and sequencia>op.sequencia) and status='PENDENTE';end if;
 perform erp_ciclo_auditar(p_ator,'APONTAR_OPERACAO','APONTAMENTO',v_id::text,p_payload);return v_id;
end$$;
create or replace function erp_ciclo_estornar(p_ap bigint,p_key uuid,p_ator text) returns bigint language plpgsql as $$
declare a pcp_apontamentos%rowtype;o erp_ordens_fabricacao%rowtype;op pcp_operacoes%rowtype;m record;v_id bigint;v_boa numeric;v_ref numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 select * into strict a from pcp_apontamentos where id=p_ap and tipo='CICLO' for update;
 select id into v_id from pcp_apontamentos where estorno_de=p_ap;if v_id is not null then return v_id;end if;
 if exists(select 1 from pcp_apontamentos where request_id=p_key::text) then raise exception 'Chave de estorno reutilizada';end if;
 select * into strict op from pcp_operacoes where id=a.operacao_id;
 select * into strict o from erp_ordens_fabricacao where id=op.of_id for update;
 if exists(select 1 from pcp_pallets where apontamento_id=p_ap and (qualidade_status='LIBERADO' or msac_status='LIBERADO' or status='LIBERADO')) then raise exception 'Pallet liberado: revogue a liberação antes do estorno';end if;
 v_boa=(a.ciclo_payload->>'boa')::numeric;v_ref=(a.ciclo_payload->>'refugo')::numeric;
 if exists(select 1 from pcp_operacoes where of_id=o.id and sequencia>op.sequencia and quantidade_produzida+quantidade_refugo>op.quantidade_produzida-v_boa) then raise exception 'Estorne primeiro as operações posteriores';end if;
 insert into pcp_apontamentos(operacao_id,pedido,of,processo,tipo,quantidade,request_id,usuario,ciclo_payload,estoque_status,estorno_de) values(op.id,o.pedido,a.of,a.processo,'CICLO_ESTORNO',-v_boa,p_key::text,p_ator,a.ciclo_payload,'PROCESSADO',p_ap) returning id into v_id;
 if exists(select 1 from pcp_apontamentos where operacao_id=op.id and tipo='CICLO' and id>p_ap and estoque_status<>'ESTORNADO') then raise exception 'Estorne primeiro o apontamento mais recente desta operação';end if;
 if a.estoque_status='PROCESSADO' then
  for m in select * from est_movimentos where apontamento_id=p_ap and tipo in('ENTRADA','SAIDA') order by id desc loop
   perform erp_ciclo_mov(case when m.tipo='ENTRADA' then 'SAIDA' else 'ENTRADA' end,m.produto_id,coalesce(m.local_destino_id,m.local_origem_id),m.quantidade_base,o.id,op.id,v_id,m.lote_id,'E:'||v_id||':'||m.id,p_ator,m.custo_total,m.id);
  end loop;
  for m in select * from est_movimentos where apontamento_id=p_ap and tipo='LIBERA_RESERVA' order by id loop
   perform erp_ciclo_mov('RESERVA',m.produto_id,m.local_origem_id,m.quantidade_base,o.id,op.id,v_id,null,'E:'||v_id||':R:'||m.id,p_ator,0,m.id);
  end loop;
 end if;
 update pcp_apontamentos set estoque_status='ESTORNADO' where id=p_ap;
 update pcp_pallets set status='BLOQUEADO',bloqueio_motivo='Apontamento de origem estornado',bloqueado_por=p_ator,bloqueado_em=now() where apontamento_id=p_ap;
 update erp_ordens_fabricacao set status='LIBERADA',concluido_em=null where id=o.id;
 perform set_config('erp.ciclo_write','on',true);
 update pcp_operacoes set quantidade_produzida=quantidade_produzida-v_boa,quantidade_refugo=quantidade_refugo-v_ref,status='EM_ANDAMENTO',finalizado_em=null where id=op.id;
 perform erp_ciclo_auditar(p_ator,'ESTORNAR_APONTAMENTO','APONTAMENTO',v_id::text,jsonb_build_object('estorno_de',p_ap));return v_id;
end$$;
create or replace function erp_ciclo_finalizar(p_op uuid,p_ator text) returns uuid language plpgsql as $$
declare op pcp_operacoes%rowtype;v_id uuid;m record;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));select * into strict op from pcp_operacoes where id=p_op;
 if op.of_id is null then raise exception 'Operação sem OF integrada';end if;
 if op.quantidade_produzida+op.quantidade_refugo<op.quantidade_planejada or exists(select 1 from pcp_apontamentos where operacao_id=p_op and estoque_status='PENDENTE') then raise exception 'Quantidade ou estoque pendente';end if;
 perform set_config('erp.ciclo_write','on',true);
 update pcp_operacoes set status='CONCLUIDA',finalizado_em=now(),percentual=100 where id=p_op;
 if not exists(select 1 from pcp_operacoes where of_id=op.of_id and status<>'CONCLUIDA') then
  for m in select produto_id,local_origem_id,sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' then -quantidade_base else 0 end) saldo from est_movimentos where of_id=op.of_id and tipo in('RESERVA','LIBERA_RESERVA') group by produto_id,local_origem_id having sum(case when tipo='RESERVA' then quantidade_base else -quantidade_base end)>0 loop
   perform erp_ciclo_mov('LIBERA_RESERVA',m.produto_id,m.local_origem_id,m.saldo,op.of_id,p_op,null,null,'F:'||op.of_id||':'||m.produto_id||':'||m.local_origem_id,p_ator);
  end loop;
  update erp_ordens_fabricacao set status='CONCLUIDA',concluido_em=now() where id=op.of_id;
 end if;
 perform erp_ciclo_auditar(p_ator,'FINALIZAR_OPERACAO','OPERACAO',p_op::text,'{}');return p_op;
end$$;
create or replace function erp_ciclo_snapshot_protegido() returns trigger language plpgsql as $$begin
 if old.versao_producao_id is not null and (new.snapshot is distinct from old.snapshot or new.versao_producao_id is distinct from old.versao_producao_id or new.quantidade<>old.quantidade or new.produto_estoque_id<>old.produto_estoque_id or new.estrutura_id<>old.estrutura_id or new.of_pai_id is distinct from old.of_pai_id or new.origem_raiz_id is distinct from old.origem_raiz_id or new.origem_produto_id is distinct from old.origem_produto_id or new.prazo<>old.prazo or new.pedido<>old.pedido or new.local_id is distinct from old.local_id or new.empresa_id is distinct from old.empresa_id or new.filial_id is distinct from old.filial_id) then raise exception 'Snapshot e parâmetros da OF são imutáveis';end if;return new;end$$;
drop trigger if exists erp_of_snapshot_protegido on erp_ordens_fabricacao;
create trigger erp_of_snapshot_protegido before update on erp_ordens_fabricacao for each row execute function erp_ciclo_snapshot_protegido();
create or replace function erp_ciclo_receber(p_emp uuid,p_fil uuid,p_prod uuid,p_local uuid,p_q numeric,p_custo numeric,p_codigo text,p_serie text,p_validade date,p_key uuid,p_ator text) returns bigint language plpgsql as $$
declare v_lote uuid;v_id bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:ciclo-industrial',0));
 if p_custo<0 or p_codigo='' then raise exception 'Informe lote e custo não negativo';end if;
 insert into est_lotes(empresa_id,filial_id,produto_id,codigo,serie,validade,criado_por) values(p_emp,p_fil,p_prod,p_codigo,nullif(p_serie,''),p_validade,p_ator) on conflict(produto_id,codigo) do nothing;
 select id into strict v_lote from est_lotes where empresa_id=p_emp and filial_id=p_fil and produto_id=p_prod and codigo=p_codigo and serie is not distinct from nullif(p_serie,'') and validade is not distinct from p_validade;
 select id into v_id from est_movimentos where request_id=p_key::text;
 if v_id is not null and not exists(select 1 from est_movimentos where id=v_id and custo_total=round(p_q*p_custo,6)) then raise exception 'Chave de recebimento reutilizada';end if;
 return erp_ciclo_mov('ENTRADA',p_prod,p_local,p_q,null,null,null,v_lote,p_key::text,p_ator,round(p_q*p_custo,6));
end$$;
create or replace function erp_ciclo_ledger_guard() returns trigger language plpgsql as $$begin
 if new.tipo in('SAIDA','TRANSFERENCIA','AJUSTE') and new.of_id is null and new.lote_id is null and exists(select 1 from est_saldos_lotes where produto_id=new.produto_id and saldo>0) then raise exception 'Produto com lote: utilize o movimento integrado com rastreabilidade';end if;return new;end$$;
drop trigger if exists erp_ledger_lote_guard on est_movimentos;
create trigger erp_ledger_lote_guard before insert on est_movimentos for each row execute function erp_ciclo_ledger_guard();
create or replace function erp_ciclo_apontamento_protegido() returns trigger language plpgsql as $$begin
 if old.tipo in('CICLO','CICLO_ESTORNO') then
  if tg_op='DELETE' then raise exception 'Apontamento integrado não pode ser apagado: gere estorno';end if;
  if (to_jsonb(new)-'estoque_status'-'estoque_erro') is distinct from (to_jsonb(old)-'estoque_status'-'estoque_erro') then raise exception 'Apontamento integrado é imutável: gere estorno';end if;
 end if;if tg_op='DELETE' then return old;end if;return new;end$$;
drop trigger if exists erp_ciclo_apont_imutavel on pcp_apontamentos;
create trigger erp_ciclo_apont_imutavel before update or delete on pcp_apontamentos for each row execute function erp_ciclo_apontamento_protegido();
create or replace function erp_ciclo_operacao_delete_guard() returns trigger language plpgsql as $$begin
 if old.of_id is not null then raise exception 'Operação de OF integrada não pode ser apagada';end if;return old;end$$;
drop trigger if exists erp_ciclo_operacao_preservada on pcp_operacoes;
create trigger erp_ciclo_operacao_preservada before delete on pcp_operacoes for each row execute function erp_ciclo_operacao_delete_guard();
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_10_ciclo_industrial.sql','bd592492fdba5cb375919cc7e60674641c20354c66abef552eb3f29fe765b394',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_10_ciclo_industrial.sql','bd592492fdba5cb375919cc7e60674641c20354c66abef552eb3f29fe765b394','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 12_identidades_operacionais
-- GERADO do arquivo canônico 2026-10-22_12_identidades_operacionais.sql; SHA256 6efdb01442e19fe1cb5284e2d495152b5db940f67d794890e3b372b7075cbf62
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-20_crm_comercial.sql, 2026-10-22_10_ciclo_industrial.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_12_identidades_operacionais.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_12_identidades_operacionais.sql' and checksum<>'6efdb01442e19fe1cb5284e2d495152b5db940f67d794890e3b372b7075cbf62') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Bootstrap do mesmo controle de entregas existente; sem entidade paralela.
create table if not exists pcp_controle_entregas(
  pedido varchar(80) primary key,
  cliente varchar(240) not null default '', representante varchar(120) not null default '',
  tipo_pedido varchar(100) not null default '', colecao varchar(150) not null default '',
  status_ferragens varchar(50) not null default '',uf varchar(2) not null default '',
  cidade varchar(150) not null default '',tipo_frete varchar(12) not null default '',
  origem_unidade varchar(35) not null default '',destino_unidade varchar(35) not null default '',
  pedido_sul varchar(50) not null default '',local_montagem varchar(100) not null default '',
  status_montagem varchar(40) not null default '',data_montagem date,
  previsao_saida date,previsao_informada date,volume_m3 numeric(16,3),peso_kg numeric(16,3),
  transportadora varchar(160) not null default '',nota_fiscal varchar(100) not null default '',
  data_saida date, previsao_entrega date,data_entrega date,
  status varchar(25) not null default 'PLANEJADO',observacao text not null default '',
  atualizado_por varchar(100) not null default '',atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
 );
alter table crm_clientes add column if not exists codigo varchar(60) not null default '';
alter table crm_representantes add column if not exists codigo varchar(60) not null default '';
create unique index if not exists crm_cliente_codigo on crm_clientes(codigo) where codigo<>'';
create unique index if not exists crm_representante_codigo on crm_representantes(codigo) where codigo<>'';
alter table pcp_controle_entregas add column if not exists crm_cliente_id uuid references crm_clientes(id);
alter table pcp_controle_entregas add column if not exists crm_representante_id uuid references crm_representantes(id);
-- Projeção gerada de consultaIdentidades em lib/clientes-operacionais.ts.
create or replace view pcp_clientes_operacionais as
select p.id produto_id,p.programacao_id,p.pedido,
 coalesce(vinculo.id,por_codigo.id) cliente_id,
 coalesce(nullif(to_jsonb(vinculo)->>'codigo',''),nullif(to_jsonb(por_codigo)->>'codigo',''),'') cliente_codigo,
 coalesce(nullif(vinculo.nome_fantasia,''),nullif(vinculo.razao_social,''),nullif(por_codigo.nome_fantasia,''),nullif(por_codigo.razao_social,''),nullif(ctl.dados->>'cliente',''),nullif(g.cliente,''),'Cliente não informado') cliente_nome,
 rep.id representante_id,coalesce(to_jsonb(rep)->>'codigo','') representante_codigo,
 coalesce(nullif(rep.nome,''),nullif(ctl.dados->>'representante',''),'Representante não informado') representante_nome
 from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id left join lateral(select to_jsonb(c) dados from pcp_controle_entregas c where c.pedido=p.pedido or (case when trim(c.pedido) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(c.pedido),'0'),''),'0') else upper(trim(c.pedido)) end=case when trim(p.pedido) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(p.pedido),'0'),''),'0') else upper(trim(p.pedido)) end and not exists(select 1 from pcp_controle_entregas ex where ex.pedido=p.pedido) and (select count(*) from pcp_controle_entregas cnt where case when trim(cnt.pedido) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(cnt.pedido),'0'),''),'0') else upper(trim(cnt.pedido)) end=case when trim(p.pedido) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(p.pedido),'0'),''),'0') else upper(trim(p.pedido)) end)=1) order by (c.pedido=p.pedido) desc limit 1) ctl on true left join crm_clientes vinculo on vinculo.id=coalesce(nullif(to_jsonb(p)->>'crm_cliente_id','')::uuid,nullif(ctl.dados->>'crm_cliente_id','')::uuid)
 left join lateral(select x.* from (select c.*,count(*) over() n from crm_clientes c where nullif(to_jsonb(c)->>'codigo','')=coalesce(nullif(ctl.dados->>'cliente',''),nullif(g.cliente,'')) or (nullif(c.documento,'') is not null and regexp_replace(c.documento,'[^[:alnum:]]','','g')=regexp_replace(coalesce(nullif(ctl.dados->>'cliente',''),g.cliente),'[^[:alnum:]]','','g'))) x where x.n=1) por_codigo on vinculo.id is null
 left join crm_representantes rep on rep.id=nullif(ctl.dados->>'crm_representante_id','')::uuid;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_12_identidades_operacionais.sql','6efdb01442e19fe1cb5284e2d495152b5db940f67d794890e3b372b7075cbf62',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_12_identidades_operacionais.sql','6efdb01442e19fe1cb5284e2d495152b5db940f67d794890e3b372b7075cbf62','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 13_controle_of
-- GERADO do arquivo canônico 2026-10-22_13_controle_of.sql; SHA256 723595cdb31798751d886ee91097c631065669babbec9b7d0a6216179912e797
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-22_10_ciclo_industrial.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_13_controle_of.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_13_controle_of.sql' and checksum<>'723595cdb31798751d886ee91097c631065669babbec9b7d0a6216179912e797') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_13_controle_of.sql','723595cdb31798751d886ee91097c631065669babbec9b7d0a6216179912e797',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_13_controle_of.sql','723595cdb31798751d886ee91097c631065669babbec9b7d0a6216179912e797','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 14_vendas_comissoes
-- GERADO do arquivo canônico 2026-10-23_14_vendas_comissoes.sql; SHA256 7996495c3b74be52764727a172da79bc2779328b38b5cd04d73833d00bf44565
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-22_12_identidades_operacionais.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-23_14_vendas_comissoes.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-23_14_vendas_comissoes.sql' and checksum<>'7996495c3b74be52764727a172da79bc2779328b38b5cd04d73833d00bf44565') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

alter table crm_clientes add column if not exists limite_credito numeric(16,2) not null default 0 check(limite_credito>=0);
alter table crm_clientes add column if not exists condicao_pagamento varchar(120) not null default '';

create table if not exists crm_pedidos_venda (
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 cliente_id uuid not null references crm_clientes(id) on delete restrict,
 representante_id uuid references crm_representantes(id) on delete restrict,
 pedido_cliente varchar(80) not null default '',
 pedido_pcp varchar(40) not null default '',
 proposta_id uuid references crm_propostas(id) on delete set null,
 condicao_pagamento varchar(120) not null default '',
 status varchar(20) not null default 'RASCUNHO' check(status in ('RASCUNHO','EM_APROVACAO','APROVADO','EM_PRODUCAO','PARCIAL','ATENDIDO','FATURADO','CANCELADO')),
 desconto_percentual numeric(7,4) not null default 0 check(desconto_percentual between 0 and 100),
 frete numeric(16,2) not null default 0 check(frete>=0),
 total_bruto numeric(16,2) not null default 0 check(total_bruto>=0),
 total numeric(16,2) not null default 0 check(total>=0),
 requer_aprovacao boolean not null default false,
 bloqueio_credito boolean not null default false,
 credito_excedente numeric(16,2) not null default 0 check(credito_excedente>=0),
 aprovado_por varchar(160), aprovado_em timestamptz,
 cancelado_motivo text not null default '',
 faturado_valor numeric(16,2) not null default 0 check(faturado_valor>=0),
 recebido_valor numeric(16,2) not null default 0 check(recebido_valor>=0),
 devolvido_valor numeric(16,2) not null default 0 check(devolvido_valor>=0),
 data_emissao date not null default current_date,
 data_entrega date,
 observacoes text not null default '',
 criado_por varchar(160) not null, atualizado_por varchar(160) not null,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 check(faturado_valor<=total),
 check(devolvido_valor<=faturado_valor)
);
create index if not exists ix_pv_cliente on crm_pedidos_venda(cliente_id,criado_em desc);
create index if not exists ix_pv_representante on crm_pedidos_venda(representante_id,criado_em desc);
create index if not exists ix_pv_status on crm_pedidos_venda(status,data_entrega);
create unique index if not exists ux_pv_pedido_pcp on crm_pedidos_venda(pedido_pcp) where pedido_pcp<>'' and status<>'CANCELADO';
create unique index if not exists ux_pv_pedido_cliente on crm_pedidos_venda(cliente_id,lower(pedido_cliente)) where pedido_cliente<>'' and status<>'CANCELADO';

create table if not exists crm_pedido_venda_itens (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references crm_pedidos_venda(id) on delete cascade,
 linha integer not null check(linha>0),
 item_codigo varchar(80) not null default '',
 familia varchar(80) not null default '',
 descricao varchar(300) not null,
 unidade varchar(12) not null default 'UN',
 quantidade numeric(16,4) not null check(quantidade>0),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 desconto_percentual numeric(7,4) not null default 0 check(desconto_percentual between 0 and 100),
 total numeric(16,2) not null check(total>=0),
 data_entrega date,
 unique(pedido_id,linha)
);
create index if not exists ix_pv_itens_pedido on crm_pedido_venda_itens(pedido_id);

create table if not exists crm_pedido_venda_historico (
 id bigserial primary key,
 pedido_id uuid not null references crm_pedidos_venda(id) on delete cascade,
 evento varchar(40) not null, de varchar(20), para varchar(20),
 usuario varchar(160) not null, detalhe jsonb not null default '{}'::jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists ix_pv_hist_pedido on crm_pedido_venda_historico(pedido_id,criado_em desc);

create table if not exists crm_comissao_regras (
 id uuid primary key default gen_random_uuid(),
 representante_id uuid not null references crm_representantes(id) on delete cascade,
 cliente_id uuid references crm_clientes(id) on delete cascade,
 item_codigo varchar(80) not null default '',
 familia varchar(80) not null default '',
 faixa_min numeric(16,2) check(faixa_min is null or faixa_min>=0),
 faixa_max numeric(16,2) check(faixa_max is null or faixa_max>=0),
 percentual numeric(7,4) not null check(percentual between 0 and 100),
 base varchar(10) not null default 'FATURADO' check(base in ('FATURADO','RECEBIDO')),
 vigencia_inicio date not null default current_date,
 vigencia_fim date,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vigencia_fim is null or vigencia_fim>=vigencia_inicio),
 check(faixa_max is null or faixa_min is null or faixa_max>=faixa_min)
);
create index if not exists ix_comissao_regras_rep on crm_comissao_regras(representante_id,ativo);

create table if not exists crm_comissoes (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references crm_pedidos_venda(id) on delete restrict,
 representante_id uuid not null references crm_representantes(id) on delete restrict,
 tipo varchar(10) not null default 'PROVISAO' check(tipo in ('PROVISAO','LIBERACAO','ESTORNO')),
 base varchar(10) not null check(base in ('FATURADO','RECEBIDO')),
 valor_base numeric(16,2) not null,
 valor numeric(16,2) not null,
 status varchar(10) not null default 'PREVISTA' check(status in ('PREVISTA','A_PAGAR','PAGA','ESTORNADA')),
 competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'),
 referencia_id uuid references crm_comissoes(id) on delete restrict,
 motivo text not null default '',
 pago_em timestamptz, pago_por varchar(160),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_comissoes_rep on crm_comissoes(representante_id,competencia,status);
create index if not exists ix_comissoes_pedido on crm_comissoes(pedido_id);
create unique index if not exists ux_comissao_provisao on crm_comissoes(pedido_id) where tipo='PROVISAO';

create or replace function crm_comissoes_imutavel() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Lançamento de comissão não pode ser apagado; use estorno';end if;
 if new.pedido_id is distinct from old.pedido_id or new.representante_id is distinct from old.representante_id
  or new.valor is distinct from old.valor or new.valor_base is distinct from old.valor_base
  or new.tipo is distinct from old.tipo or new.base is distinct from old.base or new.competencia is distinct from old.competencia then
  raise exception 'Lançamento de comissão é imutável; use estorno';
 end if;
 return new;
end$$;
drop trigger if exists crm_comissoes_imutavel_t on crm_comissoes;
create trigger crm_comissoes_imutavel_t before update or delete on crm_comissoes for each row execute function crm_comissoes_imutavel();
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-23_14_vendas_comissoes.sql','7996495c3b74be52764727a172da79bc2779328b38b5cd04d73833d00bf44565',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-23_14_vendas_comissoes.sql','7996495c3b74be52764727a172da79bc2779328b38b5cd04d73833d00bf44565','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 15_vendas_producao
-- GERADO do arquivo canônico 2026-10-23_15_vendas_producao.sql; SHA256 0723933be67d6e303c2413da2aacd6180fef7da2a01ccf96cbc2d8c192eadbdf
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-23_14_vendas_comissoes.sql, 2026-10-22_13_controle_of.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-23_15_vendas_producao.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-23_15_vendas_producao.sql' and checksum<>'0723933be67d6e303c2413da2aacd6180fef7da2a01ccf96cbc2d8c192eadbdf') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Somente leitura: funções e view. Nenhuma tabela existente é alterada.
create or replace function erp_norm_pedido(p text) returns text language sql immutable as $$
 select coalesce(nullif(ltrim(trim(coalesce(p,'')),'0'),''),'0')
$$;
create or replace function erp_norm_codigo(p text) returns text language sql immutable as $$
 select upper(regexp_replace(trim(coalesce(p,'')),'[[:space:]]+','','g'))
$$;

create or replace view erp_v_of_comercial as
select o.id of_id, o.numero of_numero, o.status of_status, o.pedido,
 pv.id pedido_venda_id, pv.numero pedido_venda_numero, pv.pedido_cliente,
 c.id cliente_id, c.razao_social cliente_nome, r.id representante_id, r.nome representante_nome
from erp_ordens_fabricacao o
left join crm_pedidos_venda pv on pv.pedido_pcp<>'' and pv.status<>'CANCELADO' and erp_norm_pedido(pv.pedido_pcp)=erp_norm_pedido(o.pedido)
left join crm_clientes c on c.id=pv.cliente_id
left join crm_representantes r on r.id=pv.representante_id;

-- Necessidade de produção de um pedido de venda: quanto falta produzir considerando OF em curso e saldo livre.
create or replace function erp_necessidade_pedido(p_pedido uuid)
returns table(linha int,item_codigo text,descricao text,produto_id uuid,quantidade numeric,em_of numeric,saldo_livre numeric,falta_producao numeric,situacao text)
language sql stable as $$
 with pv as (select id,pedido_pcp from crm_pedidos_venda where id=p_pedido),
 it as (select i.linha,i.item_codigo,i.descricao,i.quantidade,ep.id pid
        from crm_pedido_venda_itens i join pv on pv.id=i.pedido_id
        left join est_produtos ep on ep.codigo=erp_norm_codigo(i.item_codigo) and ep.ativo where i.pedido_id=p_pedido)
 select it.linha::int,it.item_codigo::text,it.descricao::text,it.pid,it.quantidade::numeric,
  coalesce(of.q,0)::numeric,coalesce(sl.livre,0)::numeric,
  greatest(0,it.quantidade-coalesce(of.q,0)-coalesce(sl.livre,0))::numeric,
  (case when it.pid is null then 'SEM_PRODUTO_ESTOQUE'
        when it.quantidade<=coalesce(of.q,0)+coalesce(sl.livre,0) then 'COBERTO' else 'PRODUZIR' end)::text
 from it
 left join lateral (select sum(o.quantidade) q from erp_ordens_fabricacao o, pv
   where o.produto_estoque_id=it.pid and o.status in ('PLANEJADA','LIBERADA') and pv.pedido_pcp<>'' and erp_norm_pedido(o.pedido)=erp_norm_pedido(pv.pedido_pcp)) of on true
 left join lateral (select sum(greatest(0,s.fisico-s.reservado-s.bloqueado)) livre from est_saldos s where s.produto_id=it.pid) sl on true
 order by it.linha
$$;

-- Disponibilidade dos componentes antes de criar a OF.
create or replace function erp_disponibilidade_estrutura(p_estrutura uuid,p_qtd numeric,p_local uuid)
returns table(componente_id uuid,codigo text,descricao text,classificacao text,necessidade numeric,livre numeric,falta numeric,situacao text)
language sql stable as $$
 select i.componente_id,p.codigo::text,p.descricao::text,p.classificacao::text,
  n.nec, coalesce(g.livre,0)::numeric, greatest(0,n.nec-coalesce(g.livre,0))::numeric,
  (case when n.nec<=coalesce(g.livre,0) then 'OK' when p.classificacao='SEMIACABADO' then 'GERA_OF_FILHA' else 'FALTA' end)::text
 from erp_estrutura_itens i
 join est_produtos p on p.id=i.componente_id
 join est_unidades u on u.codigo=p.unidade_base
 cross join lateral (select (case when u.fracionavel then ceil(p_qtd*i.quantidade*(1+i.perda_percentual/100)*1000)/1000
                                  else ceil(p_qtd*i.quantidade*(1+i.perda_percentual/100)) end)::numeric nec) n
 left join lateral (select greatest(0,s.fisico-s.reservado-s.bloqueado) livre from est_saldos s where s.produto_id=i.componente_id and s.local_id=p_local) g on true
 where i.estrutura_id=p_estrutura order by p.codigo
$$;

-- Onde-é-usado em árvore (versão aprovada mais recente de cada pai).
create or replace function erp_onde_usado(p_prod uuid)
returns table(nivel int,pai_id uuid,pai_codigo text,pai_descricao text,componente_id uuid,quantidade_por_pai numeric,quantidade_acumulada numeric,caminho text)
language sql stable as $$
 with recursive vig as (
  select distinct on (e.produto_id) e.id,e.produto_id from erp_estruturas e where e.status='APROVADA' order by e.produto_id,e.versao desc),
 t as (
  select 1 nivel,v.produto_id pai_id,i.componente_id,i.quantidade::numeric q1,i.quantidade::numeric qacum,array[v.produto_id,i.componente_id] vis
  from erp_estrutura_itens i join vig v on v.id=i.estrutura_id where i.componente_id=p_prod
  union all
  select t.nivel+1,v.produto_id,i.componente_id,i.quantidade::numeric,t.qacum*i.quantidade::numeric,t.vis||v.produto_id
  from t join erp_estrutura_itens i on i.componente_id=t.pai_id join vig v on v.id=i.estrutura_id
  where t.nivel<25 and not v.produto_id=any(t.vis))
 select t.nivel::int,t.pai_id,p.codigo::text,p.descricao::text,t.componente_id,t.q1,t.qacum,
  (select string_agg(x.codigo,' > ' order by o) from unnest(t.vis) with ordinality as a(id,o) join est_produtos x on x.id=a.id)::text
 from t join est_produtos p on p.id=t.pai_id order by t.nivel,p.codigo
$$;

-- Rastreabilidade para trás e para frente a partir de uma OF.
create or replace function erp_rastreio_of(p_of uuid)
returns table(sentido text,tipo text,referencia text,descricao text,quantidade numeric,detalhe jsonb)
language sql stable as $$
 with o as (select * from erp_ordens_fabricacao where id=p_of)
 select 'ORIGEM'::text,'MATERIAL_CONSUMIDO'::text,coalesce(l.codigo,'sem lote')::text,p.codigo::text,sum(m.quantidade_base-0)::numeric,
  jsonb_build_object('produto_id',m.produto_id,'lote_id',m.lote_id)
 from est_movimentos m join est_produtos p on p.id=m.produto_id left join est_lotes l on l.id=m.lote_id
 where m.of_id=p_of and m.tipo='SAIDA' and m.estorno_de is null
   and not exists(select 1 from est_movimentos e where e.estorno_de=m.id)
 group by m.produto_id,m.lote_id,l.codigo,p.codigo
 union all
 select 'ORIGEM','OF_PAI',f.numero::text,'OF '||f.numero,f.quantidade,jsonb_build_object('of_id',f.id,'status',f.status)
 from o join erp_ordens_fabricacao f on f.id=o.of_pai_id
 union all
 select 'DESTINO','ENTRADA_PRODUZIDA',coalesce(l.codigo,'sem lote'),p.codigo,sum(m.quantidade_base),jsonb_build_object('produto_id',m.produto_id,'lote_id',m.lote_id)
 from est_movimentos m join est_produtos p on p.id=m.produto_id left join est_lotes l on l.id=m.lote_id
 where m.of_id=p_of and m.tipo='ENTRADA' and m.estorno_de is null and not exists(select 1 from est_movimentos e where e.estorno_de=m.id)
 group by m.produto_id,m.lote_id,l.codigo,p.codigo
 union all
 select 'DESTINO','OF_FILHA',f.numero::text,'OF '||f.numero,f.quantidade,jsonb_build_object('of_id',f.id,'status',f.status)
 from erp_ordens_fabricacao f where f.of_pai_id=p_of
 union all
 select 'DESTINO','PALLET',pl.codigo::text,pl.tipo_produto::text,pl.quantidade,jsonb_build_object('pedido',pl.pedido)
 from o join pcp_pallets pl on erp_norm_pedido(pl.pedido)=erp_norm_pedido(o.pedido)
 union all
 select 'DESTINO','PEDIDO_VENDA',c.pedido_venda_numero::text,coalesce(c.cliente_nome,''),null::numeric,
  jsonb_build_object('pedido_venda_id',c.pedido_venda_id,'cliente',c.cliente_nome,'representante',c.representante_nome,'pedido_cliente',c.pedido_cliente)
 from erp_v_of_comercial c where c.of_id=p_of and c.pedido_venda_id is not null
$$;

-- Para frente a partir de um lote de matéria-prima: OFs que o consumiram e seus pedidos/clientes.
create or replace function erp_rastreio_lote(p_lote uuid)
returns table(of_id uuid,of_numero bigint,of_status text,produto text,quantidade_consumida numeric,pedido text,pedido_venda_numero bigint,cliente text,representante text)
language sql stable as $$
 select o.id,o.numero,o.status::text,pr.codigo::text,
  sum(case when m.tipo='SAIDA' then m.quantidade_base else 0 end)
   - coalesce((select sum(e.quantidade_base) from est_movimentos e where e.lote_id=p_lote and e.of_id=o.id and e.tipo='ENTRADA' and e.estorno_de is not null),0),
  o.pedido::text,max(c.pedido_venda_numero),max(c.cliente_nome)::text,max(c.representante_nome)::text
 from est_movimentos m join erp_ordens_fabricacao o on o.id=m.of_id join est_produtos pr on pr.id=o.produto_estoque_id
 left join erp_v_of_comercial c on c.of_id=o.id
 where m.lote_id=p_lote and m.tipo='SAIDA' and m.estorno_de is null
 group by o.id,o.numero,o.status,pr.codigo,o.pedido order by o.numero
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-23_15_vendas_producao.sql','0723933be67d6e303c2413da2aacd6180fef7da2a01ccf96cbc2d8c192eadbdf',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-23_15_vendas_producao.sql','0723933be67d6e303c2413da2aacd6180fef7da2a01ccf96cbc2d8c192eadbdf','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> migração 16_compras_terceiros
-- GERADO do arquivo canônico 2026-10-24_16_compras_terceiros.sql; SHA256 018d647f9f6f47a6a8fbc21d0aaeb4507a7474cf578209a79d83c8d5dae09b75
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-23_15_vendas_producao.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-24_16_compras_terceiros.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-24_16_compras_terceiros.sql' and checksum<>'018d647f9f6f47a6a8fbc21d0aaeb4507a7474cf578209a79d83c8d5dae09b75') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

alter table est_produtos add column if not exists estoque_seguranca numeric(16,3) not null default 0 check(estoque_seguranca>=0);
alter table est_produtos add column if not exists lead_time_dias integer not null default 0 check(lead_time_dias>=0);
alter table est_produtos add column if not exists lote_compra numeric(16,3) not null default 0 check(lote_compra>=0);

create table if not exists cmp_fornecedores(
 id uuid primary key default gen_random_uuid(),
 razao_social varchar(240) not null,
 documento varchar(40) not null default '',
 email varchar(240) not null default '', telefone varchar(50) not null default '',
 condicao_pagamento varchar(120) not null default '',
 prazo_medio_dias integer not null default 0 check(prazo_medio_dias>=0),
 terceirizador boolean not null default false,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_cmp_fornecedor_doc on cmp_fornecedores(regexp_replace(documento,'[^[:alnum:]]','','g')) where documento<>'';

create table if not exists cmp_alcadas(
 id serial primary key,
 valor_ate numeric(16,2) check(valor_ate is null or valor_ate>0),
 perfil_aprovador varchar(20) not null check(perfil_aprovador in ('PCP','GERENTE'))
);
create unique index if not exists ux_cmp_alcada_valor on cmp_alcadas((coalesce(valor_ate,-1)));
insert into cmp_alcadas(valor_ate,perfil_aprovador) select 5000,'PCP' where not exists(select 1 from cmp_alcadas where valor_ate=5000);
insert into cmp_alcadas(valor_ate,perfil_aprovador) select null,'GERENTE' where not exists(select 1 from cmp_alcadas where valor_ate is null);

create table if not exists cmp_solicitacoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 status varchar(12) not null default 'RASCUNHO' check(status in ('RASCUNHO','APROVADA','ATENDIDA','CANCELADA')),
 motivo varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 aprovado_por varchar(160), aprovado_em timestamptz
);
create table if not exists cmp_solicitacao_itens(
 solicitacao_id uuid not null references cmp_solicitacoes(id) on delete cascade,
 linha integer not null check(linha>0),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 necessidade_data date,
 primary key(solicitacao_id,linha)
);
create table if not exists cmp_cotacao_propostas(
 solicitacao_id uuid not null, linha integer not null,
 fornecedor_id uuid not null references cmp_fornecedores(id),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 prazo_dias integer not null default 0 check(prazo_dias>=0),
 escolhida boolean not null default false,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(solicitacao_id,linha,fornecedor_id),
 foreign key(solicitacao_id,linha) references cmp_solicitacao_itens(solicitacao_id,linha) on delete cascade
);
create unique index if not exists ux_cmp_cotacao_escolhida on cmp_cotacao_propostas(solicitacao_id,linha) where escolhida;

create table if not exists cmp_pedidos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 fornecedor_id uuid not null references cmp_fornecedores(id) on delete restrict,
 solicitacao_id uuid references cmp_solicitacoes(id) on delete set null,
 status varchar(14) not null default 'RASCUNHO' check(status in ('RASCUNHO','EM_APROVACAO','APROVADO','PARCIAL','RECEBIDO','CANCELADO')),
 total numeric(16,2) not null default 0 check(total>=0),
 aprovador_exigido varchar(20) not null default 'PCP',
 previsao date,
 observacoes text not null default '',
 aprovado_por varchar(160), aprovado_em timestamptz,
 cancelado_motivo text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists ix_cmp_pedidos_status on cmp_pedidos(status,previsao);
create table if not exists cmp_pedido_itens(
 pedido_id uuid not null references cmp_pedidos(id) on delete cascade,
 linha integer not null check(linha>0),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 quantidade_recebida numeric(16,3) not null default 0 check(quantidade_recebida>=0),
 primary key(pedido_id,linha)
);
create index if not exists ix_cmp_pedido_itens_prod on cmp_pedido_itens(produto_id);

create table if not exists cmp_recebimentos(
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references cmp_pedidos(id) on delete restrict,
 nota_numero varchar(40) not null default '',
 chave_nfe char(44),
 local_id uuid not null references est_locais(id),
 divergente boolean not null default false,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_cmp_recebimento_chave on cmp_recebimentos(chave_nfe) where chave_nfe is not null;
create table if not exists cmp_recebimento_itens(
 recebimento_id uuid not null references cmp_recebimentos(id) on delete cascade,
 linha integer not null,
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 preco_nf numeric(16,4) not null check(preco_nf>=0),
 divergencia text not null default '',
 movimento_id bigint references est_movimentos(id),
 primary key(recebimento_id,linha)
);

create table if not exists cmp_terceiros_movs(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(10) not null check(tipo in ('REMESSA','RETORNO')),
 fornecedor_id uuid not null references cmp_fornecedores(id) on delete restrict,
 produto_id uuid not null references est_produtos(id),
 produto_retorno_id uuid references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 custo_servico numeric(16,2) not null default 0 check(custo_servico>=0),
 local_id uuid not null references est_locais(id),
 nota_numero varchar(40) not null default '',
 of_id uuid references erp_ordens_fabricacao(id) on delete set null,
 movimento_id bigint references est_movimentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_cmp_terceiros on cmp_terceiros_movs(fornecedor_id,produto_id);

create or replace view cmp_saldo_terceiros as
select fornecedor_id,produto_id,
 coalesce(sum(case when tipo='REMESSA' then quantidade else 0 end),0)::numeric remetido,
 coalesce(sum(case when tipo='RETORNO' then quantidade else 0 end),0)::numeric retornado,
 (coalesce(sum(case when tipo='REMESSA' then quantidade else 0 end),0)-coalesce(sum(case when tipo='RETORNO' then quantidade else 0 end),0))::numeric saldo,
 coalesce(sum(custo_servico),0)::numeric custo_servico
from cmp_terceiros_movs group by fornecedor_id,produto_id;

-- Entrada de estoque centralizada para compras/terceiros (mesma regra do ledger: depósito ativo, sem inventário em contagem).
create or replace function cmp_mov_estoque(p_tipo text,p_prod uuid,p_local uuid,p_q numeric,p_doc text,p_motivo text,p_custo numeric,p_ator text) returns bigint language plpgsql as $$
declare u text;fr boolean;s est_saldos%rowtype;v_id bigint;
begin
 if p_tipo not in ('ENTRADA','SAIDA') then raise exception 'Tipo inválido';end if;
 select p.unidade_base,ub.fracionavel into strict u,fr from est_produtos p join est_unidades ub on ub.codigo=p.unidade_base where p.id=p_prod and p.ativo;
 if not fr and p_q<>trunc(p_q) then raise exception 'Produto não fracionável';end if;
 if not exists(select 1 from est_locais where id=p_local and ativo) then raise exception 'Depósito inválido';end if;
 if exists(select 1 from est_inventarios where status='EM_CONTAGEM' and (tipo='GERAL' or local_id=p_local)) then raise exception 'Depósito com inventário em contagem';end if;
 insert into est_saldos(produto_id,local_id) values(p_prod,p_local) on conflict do nothing;
 select * into strict s from est_saldos where produto_id=p_prod and local_id=p_local for update;
 if p_tipo='SAIDA' and s.fisico-s.reservado-s.bloqueado<p_q then raise exception 'SALDO_INSUFICIENTE: remessa';end if;
 update est_saldos set fisico=fisico+case when p_tipo='ENTRADA' then p_q else -p_q end,atualizado_em=now() where produto_id=p_prod and local_id=p_local;
 insert into est_movimentos(tipo,produto_id,local_origem_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,documento,motivo,usuario,custo_total)
 values(p_tipo,p_prod,case when p_tipo='SAIDA' then p_local end,case when p_tipo='ENTRADA' then p_local end,p_q,p_q,u,coalesce(p_doc,''),coalesce(p_motivo,''),p_ator,greatest(0,coalesce(p_custo,0))) returning id into v_id;
 return v_id;
end$$;

-- Recebimento com conferência: quantidade e preço contra o pedido; tolerância de +5% de quantidade.
create or replace function cmp_receber(p_pedido uuid,p_nota text,p_chave text,p_local uuid,p_itens jsonb,p_ator text) returns uuid language plpgsql as $$
declare pd cmp_pedidos%rowtype;it record;pi cmp_pedido_itens%rowtype;rid uuid;v_mov bigint;div boolean=false;d text;n int=0;falta int;
begin
 perform pg_advisory_xact_lock(hashtextextended('cmp:receber:'||p_pedido::text,0));
 select * into strict pd from cmp_pedidos where id=p_pedido for update;
 if pd.status not in ('APROVADO','PARCIAL') then raise exception 'Pedido de compra não está liberado para recebimento (%)',pd.status;end if;
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'Informe os itens recebidos';end if;
 if nullif(p_chave,'') is not null and p_chave !~ '^[0-9]{44}$' then raise exception 'Chave da NF-e inválida';end if;
 insert into cmp_recebimentos(pedido_id,nota_numero,chave_nfe,local_id,criado_por) values(p_pedido,coalesce(p_nota,''),nullif(p_chave,''),p_local,p_ator) returning id into rid;
 for it in select (x->>'linha')::int linha,(x->>'quantidade')::numeric q,(x->>'precoNf')::numeric preco from jsonb_array_elements(p_itens) x order by 1 loop
  if it.q is null or it.q<=0 then raise exception 'Quantidade recebida inválida';end if;
  select * into pi from cmp_pedido_itens where pedido_id=p_pedido and linha=it.linha for update;
  if not found then raise exception 'Linha % não existe no pedido',it.linha;end if;
  if pi.quantidade_recebida+it.q>pi.quantidade*1.05 then raise exception 'Linha %: recebimento excede o pedido além da tolerância de 5%%',it.linha;end if;
  d='';
  if it.preco is distinct from pi.preco_unitario then d=d||'preço NF '||coalesce(it.preco::text,'?')||' ≠ pedido '||pi.preco_unitario;end if;
  if pi.quantidade_recebida+it.q>pi.quantidade then d=d||case when d<>'' then '; ' else '' end||'quantidade acima do pedido';end if;
  if d<>'' then div=true;end if;
  v_mov=cmp_mov_estoque('ENTRADA',pi.produto_id,p_local,it.q,'NF '||coalesce(p_nota,''),'COMPRA PC '||pd.numero,it.q*coalesce(it.preco,pi.preco_unitario),p_ator);
  insert into cmp_recebimento_itens values(rid,it.linha,pi.produto_id,it.q,coalesce(it.preco,pi.preco_unitario),d,v_mov);
  update cmp_pedido_itens set quantidade_recebida=quantidade_recebida+it.q where pedido_id=p_pedido and linha=it.linha;
  n=n+1;
 end loop;
 update cmp_recebimentos set divergente=div where id=rid;
 select count(*) into falta from cmp_pedido_itens where pedido_id=p_pedido and quantidade_recebida<quantidade;
 update cmp_pedidos set status=case when falta=0 then 'RECEBIDO' else 'PARCIAL' end,atualizado_em=now() where id=p_pedido;
 return rid;
end$$;

-- Remessa/retorno de beneficiamento em terceiros.
create or replace function cmp_terceiro_mov(p_tipo text,p_forn uuid,p_prod uuid,p_ret uuid,p_q numeric,p_custo numeric,p_local uuid,p_nota text,p_of uuid,p_ator text) returns uuid language plpgsql as $$
declare v_new uuid;v_mov bigint;saldo numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('cmp:terceiros:'||p_forn::text,0));
 if not exists(select 1 from cmp_fornecedores where id=p_forn and ativo) then raise exception 'Fornecedor inativo ou inexistente';end if;
 if p_q<=0 then raise exception 'Quantidade inválida';end if;
 if p_tipo='REMESSA' then
  v_mov=cmp_mov_estoque('SAIDA',p_prod,p_local,p_q,'REM '||coalesce(p_nota,''),'REMESSA TERCEIRO',0,p_ator);
 elsif p_tipo='RETORNO' then
  select coalesce(sum(case when tipo='REMESSA' then quantidade else -quantidade end),0) into saldo from cmp_terceiros_movs where fornecedor_id=p_forn and produto_id=p_prod;
  if p_q>saldo then raise exception 'Retorno maior que o saldo em poder do terceiro (%)',saldo;end if;
  v_mov=cmp_mov_estoque('ENTRADA',coalesce(p_ret,p_prod),p_local,p_q,'RET '||coalesce(p_nota,''),'RETORNO TERCEIRO',coalesce(p_custo,0),p_ator);
 else raise exception 'Tipo inválido';end if;
 insert into cmp_terceiros_movs(tipo,fornecedor_id,produto_id,produto_retorno_id,quantidade,custo_servico,local_id,nota_numero,of_id,movimento_id,criado_por)
 values(p_tipo,p_forn,p_prod,case when p_tipo='RETORNO' then nullif(p_ret,p_prod) end,p_q,case when p_tipo='RETORNO' then coalesce(p_custo,0) else 0 end,p_local,coalesce(p_nota,''),p_of,v_mov,p_ator) returning cmp_terceiros_movs.id into v_new;
 return v_new;
end$$;

-- Curva ABC (valor consumido) e XYZ (variabilidade mensal) dos últimos p_dias dias.
create or replace function cmp_curva_abc_xyz(p_dias integer default 180)
returns table(produto_id uuid,codigo text,descricao text,consumo_valor numeric,consumo_qtd numeric,percentual_acum numeric,classe_abc text,coef_variacao numeric,classe_xyz text)
language sql stable as $$
 with base as (
  select m.produto_id,date_trunc('month',m.criado_em) mes,sum(m.quantidade_base) q,sum(m.custo_total) v
  from est_movimentos m where m.tipo='SAIDA' and m.estorno_de is null and m.criado_em>=now()-make_interval(days=>greatest(1,p_dias))
  group by 1,2),
 tot as (select produto_id,sum(v) valor,sum(q) qtd,avg(q) media,coalesce(stddev_pop(q),0) desvio from base group by 1),
 rk as (select t.*,sum(valor) over (order by valor desc,produto_id) acum,sum(valor) over () soma from tot t)
 select r.produto_id,p.codigo::text,p.descricao::text,r.valor::numeric,r.qtd::numeric,
  case when r.soma>0 then round(100*r.acum/r.soma,2) else 100 end::numeric,
  (case when r.soma<=0 then 'C' when 100*(r.acum-r.valor)/r.soma<80 then 'A' when 100*(r.acum-r.valor)/r.soma<95 then 'B' else 'C' end)::text,
  case when r.media>0 then round(r.desvio/r.media,3) else 0 end::numeric,
  (case when r.media<=0 then 'Z' when r.desvio/r.media<0.5 then 'X' when r.desvio/r.media<1 then 'Y' else 'Z' end)::text
 from rk r join est_produtos p on p.id=r.produto_id order by r.valor desc
$$;

-- Sugestão de compra: projeção = disponível + em compra − necessidade restante das OFs abertas; alvo = mínimo + segurança.
create or replace function cmp_sugestao_compra()
returns table(produto_id uuid,codigo text,descricao text,disponivel numeric,em_compra numeric,necessidade_of numeric,projecao numeric,alvo numeric,sugerido numeric,lead_time_dias int,custo_medio numeric)
language sql stable as $$
 with disp as (select s.produto_id,sum(s.fisico-s.bloqueado) livre from est_saldos s group by 1),
 comp as (select i.produto_id,sum(i.quantidade-least(i.quantidade,i.quantidade_recebida)) q from cmp_pedido_itens i join cmp_pedidos p on p.id=i.pedido_id where p.status in ('EM_APROVACAO','APROVADO','PARCIAL') group by 1),
 nec as (
  select m.produto_id,sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id where o.status in ('PLANEJADA','LIBERADA') group by 1),
 cm as (select produto_id,sum(custo_total)/nullif(sum(quantidade_base),0) c from est_movimentos where tipo='ENTRADA' and estorno_de is null and custo_total>0 group by 1)
 select p.id,p.codigo::text,p.descricao::text,coalesce(d.livre,0)::numeric,coalesce(c.q,0)::numeric,coalesce(n.q,0)::numeric,
  (coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0))::numeric,(p.estoque_minimo+p.estoque_seguranca)::numeric,
  (case when p.lote_compra>0 then ceil(greatest(0,p.estoque_minimo+p.estoque_seguranca-(coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0)))/p.lote_compra)*p.lote_compra
        else greatest(0,p.estoque_minimo+p.estoque_seguranca-(coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0))) end)::numeric,
  p.lead_time_dias,coalesce(cm.c,0)::numeric
 from est_produtos p left join disp d on d.produto_id=p.id left join comp c on c.produto_id=p.id left join nec n on n.produto_id=p.id left join cm on cm.produto_id=p.id
 where p.ativo and p.classificacao in ('INSUMO','NAO_CLASSIFICADO')
   and (coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0)) < (p.estoque_minimo+p.estoque_seguranca)
order by p.codigo
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-24_16_compras_terceiros.sql','018d647f9f6f47a6a8fbc21d0aaeb4507a7474cf578209a79d83c8d5dae09b75',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-24_16_compras_terceiros.sql','018d647f9f6f47a6a8fbc21d0aaeb4507a7474cf578209a79d83c8d5dae09b75','APLICAR',current_user,'APLICADA');
COMMIT;
