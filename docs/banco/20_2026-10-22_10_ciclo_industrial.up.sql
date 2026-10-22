-- GERADO do arquivo canônico 2026-10-22_10_ciclo_industrial.sql; SHA256 bd592492fdba5cb375919cc7e60674641c20354c66abef552eb3f29fe765b394
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_06_engenharia_of.sql, 2026-10-22_09_historico_seguro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_10_ciclo_industrial.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
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
