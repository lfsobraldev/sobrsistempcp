-- PARTE 1 de 2 — migrações 17 a 26 (cole no Sul e depois no Nordeste; pode rodar de novo)
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

-- >>>>>>>>>> 27_2026-10-25_17_qualidade_inspecao.up.sql
-- GERADO do arquivo canônico 2026-10-25_17_qualidade_inspecao.sql; SHA256 8df2d4bb2fd6597978d471ad31a52501731f6e8cb7e9243793ae1ec9685fb99e
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-24_16_compras_terceiros.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-25_17_qualidade_inspecao.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-25_17_qualidade_inspecao.sql' and checksum<>'8df2d4bb2fd6597978d471ad31a52501731f6e8cb7e9243793ae1ec9685fb99e') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists qld_instrumentos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(60) not null unique,
 descricao varchar(240) not null default '',
 tipo varchar(60) not null default '',
 calibrado_em date,
 calibracao_validade date not null,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create table if not exists qld_planos(
 id uuid primary key default gen_random_uuid(),
 produto_id uuid not null references est_produtos(id),
 tipo varchar(12) not null check(tipo in ('RECEBIMENTO','PROCESSO','FINAL')),
 processo varchar(80) not null default '',
 amostragem varchar(10) not null default 'TOTAL' check(amostragem in ('TOTAL','FIXA','PERCENTUAL')),
 amostragem_valor numeric(10,2) not null default 0 check(amostragem_valor>=0),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_qld_plano_ativo on qld_planos(produto_id,tipo,processo) where ativo;
create table if not exists qld_plano_caracteristicas(
 plano_id uuid not null references qld_planos(id) on delete cascade,
 linha integer not null check(linha>0),
 nome varchar(120) not null,
 unidade varchar(20) not null default '',
 nominal numeric(16,4),
 tol_min numeric(16,4) not null,
 tol_max numeric(16,4) not null,
 tipo_instrumento varchar(60) not null default '',
 obrigatoria boolean not null default true,
 primary key(plano_id,linha),
 check(tol_max>=tol_min)
);

create table if not exists qld_lotes_inspecao(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 plano_id uuid not null references qld_planos(id),
 produto_id uuid not null references est_produtos(id),
 tipo varchar(12) not null,
 referencia_tipo varchar(20) not null default 'MANUAL' check(referencia_tipo in ('MANUAL','RECEBIMENTO','OF','PALLET')),
 referencia varchar(80) not null default '',
 lote_estoque_id uuid references est_lotes(id) on delete set null,
 local_id uuid references est_locais(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 amostra integer not null check(amostra>0),
 qtd_bloqueada numeric(16,3) not null default 0 check(qtd_bloqueada>=0),
 status varchar(12) not null default 'ABERTO' check(status in ('ABERTO','QUARENTENA','APROVADO','REPROVADO','SUCATEADO')),
 decisao_motivo text not null default '',
 decisao_por varchar(160), decisao_em timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_qld_lotes_status on qld_lotes_inspecao(status,criado_em desc);
create table if not exists qld_medicoes(
 id bigserial primary key,
 lote_inspecao_id uuid not null references qld_lotes_inspecao(id) on delete cascade,
 linha integer not null,
 valor numeric(16,4) not null,
 conforme boolean not null,
 instrumento_id uuid not null references qld_instrumentos(id),
 medido_por varchar(160) not null, medido_em timestamptz not null default now()
);
create index if not exists ix_qld_medicoes_lote on qld_medicoes(lote_inspecao_id,linha);
create or replace function qld_medicao_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Medição é registro de qualidade e não pode ser alterada nem apagada';end$$;
drop trigger if exists qld_medicao_imutavel_t on qld_medicoes;
create trigger qld_medicao_imutavel_t before update or delete on qld_medicoes for each row execute function qld_medicao_imutavel();

create table if not exists qld_nao_conformidades(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 origem varchar(20) not null default 'INTERNA' check(origem in ('INTERNA','FORNECEDOR','CLIENTE')),
 lote_inspecao_id uuid references qld_lotes_inspecao(id) on delete set null,
 produto_id uuid references est_produtos(id),
 descricao text not null,
 status varchar(12) not null default 'ABERTA' check(status in ('ABERTA','EM_ANALISE','EM_ACAO','ENCERRADA')),
 causa_raiz text not null default '',
 porques jsonb not null default '[]'::jsonb check(jsonb_typeof(porques)='array' and jsonb_array_length(porques)<=5),
 responsavel varchar(160) not null default '',
 prazo date,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 encerrado_por varchar(160), encerrado_em timestamptz
);
create table if not exists qld_acoes(
 nc_id uuid not null references qld_nao_conformidades(id) on delete cascade,
 linha integer not null check(linha>0),
 tipo varchar(12) not null check(tipo in ('CONTENCAO','CORRETIVA','PREVENTIVA')),
 descricao text not null,
 responsavel varchar(160) not null default '',
 prazo date,
 concluida_em timestamptz,
 primary key(nc_id,linha)
);

-- Abre lote de inspeção pelo plano ativo; amostra calculada pela regra do plano.
create or replace function qld_abrir_lote(p_plano uuid,p_qtd numeric,p_ref_tipo text,p_ref text,p_lote_estoque uuid,p_local uuid,p_ator text) returns uuid language plpgsql as $$
declare pl qld_planos%rowtype;am int;v_id uuid;
begin
 select * into strict pl from qld_planos where id=p_plano and ativo;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 if not exists(select 1 from qld_plano_caracteristicas where plano_id=p_plano) then raise exception 'Plano sem características';end if;
 am=case pl.amostragem when 'TOTAL' then ceil(p_qtd) when 'FIXA' then least(ceil(p_qtd),greatest(1,ceil(pl.amostragem_valor))) else least(ceil(p_qtd),greatest(1,ceil(p_qtd*pl.amostragem_valor/100))) end;
 insert into qld_lotes_inspecao(plano_id,produto_id,tipo,referencia_tipo,referencia,lote_estoque_id,local_id,quantidade,amostra,criado_por)
 values(p_plano,pl.produto_id,pl.tipo,coalesce(p_ref_tipo,'MANUAL'),coalesce(p_ref,''),p_lote_estoque,p_local,p_qtd,am,p_ator) returning qld_lotes_inspecao.id into v_id;
 return v_id;
end$$;

-- Medição: instrumento vencido/inativo não mede; fora da tolerância coloca o lote em quarentena e bloqueia o saldo.
create or replace function qld_medir(p_lote uuid,p_linha int,p_valor numeric,p_instr uuid,p_ator text) returns boolean language plpgsql as $$
declare l qld_lotes_inspecao%rowtype;c qld_plano_caracteristicas%rowtype;i qld_instrumentos%rowtype;ok boolean;livre numeric;bloq numeric;feitas int;
begin
 perform pg_advisory_xact_lock(hashtextextended('qld:'||p_lote::text,0));
 select * into strict l from qld_lotes_inspecao where id=p_lote for update;
 if l.status in ('APROVADO','REPROVADO','SUCATEADO') then raise exception 'Lote já decidido (%)',l.status;end if;
 select * into strict c from qld_plano_caracteristicas where plano_id=l.plano_id and linha=p_linha;
 select * into strict i from qld_instrumentos where id=p_instr;
 if not i.ativo then raise exception 'Instrumento inativo';end if;
 if i.calibracao_validade<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Instrumento % com calibração vencida em %',i.codigo,i.calibracao_validade;end if;
 if c.tipo_instrumento<>'' and lower(i.tipo)<>lower(c.tipo_instrumento) then raise exception 'Característica exige instrumento do tipo %',c.tipo_instrumento;end if;
 select count(*) into feitas from qld_medicoes where lote_inspecao_id=p_lote and linha=p_linha;
 if feitas>=l.amostra then raise exception 'Amostra completa para esta característica (%)',l.amostra;end if;
 ok=p_valor between c.tol_min and c.tol_max;
 insert into qld_medicoes(lote_inspecao_id,linha,valor,conforme,instrumento_id,medido_por) values(p_lote,p_linha,p_valor,ok,p_instr,p_ator);
 if not ok and l.status='ABERTO' then
  bloq=0;
  if l.local_id is not null then
   select greatest(0,fisico-reservado-bloqueado) into livre from est_saldos where produto_id=l.produto_id and local_id=l.local_id for update;
   bloq=least(l.quantidade,coalesce(livre,0));
   if bloq>0 then update est_saldos set bloqueado=bloqueado+bloq,atualizado_em=now() where produto_id=l.produto_id and local_id=l.local_id;end if;
  end if;
  update qld_lotes_inspecao set status='QUARENTENA',qtd_bloqueada=bloq where id=p_lote;
 end if;
 return ok;
end$$;

-- Decisão de uso: APROVAR exige todas as características obrigatórias medidas na amostra e conformes (ou liberação justificada).
create or replace function qld_decidir(p_lote uuid,p_decisao text,p_motivo text,p_ator text) returns text language plpgsql as $$
declare l qld_lotes_inspecao%rowtype;falta int;nc int;novo text;
begin
 perform pg_advisory_xact_lock(hashtextextended('qld:'||p_lote::text,0));
 select * into strict l from qld_lotes_inspecao where id=p_lote for update;
 if l.status in ('APROVADO','REPROVADO','SUCATEADO') then raise exception 'Lote já decidido (%)',l.status;end if;
 if p_decisao not in ('APROVAR','REPROVAR','SUCATEAR','LIBERAR_COM_DESVIO') then raise exception 'Decisão inválida';end if;
 if p_decisao in ('REPROVAR','SUCATEAR','LIBERAR_COM_DESVIO') and length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo da decisão';end if;
 select count(*) into falta from qld_plano_caracteristicas c where c.plano_id=l.plano_id and c.obrigatoria and (select count(*) from qld_medicoes m where m.lote_inspecao_id=p_lote and m.linha=c.linha)<l.amostra;
 select count(*) into nc from qld_medicoes where lote_inspecao_id=p_lote and not conforme;
 if p_decisao='APROVAR' then
  if falta>0 then raise exception 'Faltam medições obrigatórias (% característica(s))',falta;end if;
  if nc>0 then raise exception 'Lote tem % medição(ões) fora da tolerância; reprove ou libere com desvio',nc;end if;
 end if;
 novo=case p_decisao when 'APROVAR' then 'APROVADO' when 'LIBERAR_COM_DESVIO' then 'APROVADO' when 'REPROVAR' then 'REPROVADO' else 'SUCATEADO' end;
 if l.qtd_bloqueada>0 and l.local_id is not null then
  update est_saldos set bloqueado=greatest(0,bloqueado-l.qtd_bloqueada),atualizado_em=now() where produto_id=l.produto_id and local_id=l.local_id;
 end if;
 update qld_lotes_inspecao set status=novo,qtd_bloqueada=0,decisao_motivo=coalesce(p_motivo,''),decisao_por=p_ator,decisao_em=now() where id=p_lote;
 return novo;
end$$;

-- NC só encerra com causa raiz e ao menos uma ação, todas concluídas.
create or replace function qld_encerrar_nc(p_nc uuid,p_ator text) returns void language plpgsql as $$
declare n qld_nao_conformidades%rowtype;pend int;tot int;
begin
 select * into strict n from qld_nao_conformidades where id=p_nc for update;
 if n.status='ENCERRADA' then raise exception 'NC já encerrada';end if;
 if length(trim(n.causa_raiz))<5 then raise exception 'Registre a causa raiz antes de encerrar';end if;
 select count(*),count(*) filter (where concluida_em is null) into tot,pend from qld_acoes where nc_id=p_nc;
 if tot=0 then raise exception 'Registre ao menos uma ação (corretiva/preventiva)';end if;
 if pend>0 then raise exception 'Há % ação(ões) pendente(s)',pend;end if;
 update qld_nao_conformidades set status='ENCERRADA',encerrado_por=p_ator,encerrado_em=now() where id=p_nc;
end$$;

-- PPM interno por mês: peças reprovadas/sucateadas por milhão inspecionado (lotes decididos).
create or replace function qld_ppm(p_meses int default 6)
returns table(mes text,inspecionado numeric,rejeitado numeric,ppm numeric,lotes int,lotes_reprovados int)
language sql stable as $$
 select to_char(date_trunc('month',decisao_em),'YYYY-MM')::text,sum(quantidade)::numeric,
  coalesce(sum(quantidade) filter (where status in ('REPROVADO','SUCATEADO')),0)::numeric,
  case when sum(quantidade)>0 then round(coalesce(sum(quantidade) filter (where status in ('REPROVADO','SUCATEADO')),0)/sum(quantidade)*1000000)::numeric else 0 end,
  count(*)::int,(count(*) filter (where status in ('REPROVADO','SUCATEADO')))::int
 from qld_lotes_inspecao where decisao_em>=date_trunc('month',now())-make_interval(months=>greatest(1,p_meses)-1)
 group by 1 order by 1
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-25_17_qualidade_inspecao.sql','8df2d4bb2fd6597978d471ad31a52501731f6e8cb7e9243793ae1ec9685fb99e',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-25_17_qualidade_inspecao.sql','8df2d4bb2fd6597978d471ad31a52501731f6e8cb7e9243793ae1ec9685fb99e','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 28_2026-10-26_18_mrp_aps.up.sql
-- GERADO do arquivo canônico 2026-10-26_18_mrp_aps.sql; SHA256 ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-25_17_qualidade_inspecao.sql, 2026-10-22_09_historico_seguro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-26_18_mrp_aps.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-26_18_mrp_aps.sql' and checksum<>'ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists erp_of_agenda(
 of_id uuid primary key references erp_ordens_fabricacao(id) on delete cascade,
 inicio_fixo date not null,
 motivo varchar(300) not null default '',
 atualizado_por varchar(160) not null,
 atualizado_em timestamptz not null default now()
);

-- Operações abertas das OFs integradas: base da carga por centro e do Gantt (ciclo em minutos por peça).
create or replace view erp_v_ops_abertas as
select o.id of_id,o.numero of_numero,o.prazo,o.status of_status,p.codigo produto,
 op.id operacao_id,op.sequencia,op.processo,
 nullif(op.roteiro_snapshot->>'centro_id','')::uuid centro_id,
 greatest(0,op.quantidade_planejada-coalesce(op.quantidade_produzida,0))::numeric restante,
 case when coalesce(op.quantidade_produzida,0)>0 then 0 else coalesce((op.roteiro_snapshot->>'setup')::numeric,0) end::numeric setup_min,
 coalesce((op.roteiro_snapshot->>'ciclo')::numeric,0)::numeric ciclo_min,
 (case when coalesce(op.quantidade_produzida,0)>0 then 0 else coalesce((op.roteiro_snapshot->>'setup')::numeric,0) end
  + greatest(0,op.quantidade_planejada-coalesce(op.quantidade_produzida,0))*coalesce((op.roteiro_snapshot->>'ciclo')::numeric,0))::numeric minutos
from erp_ordens_fabricacao o
join est_produtos p on p.id=o.produto_estoque_id
join pcp_operacoes op on op.of_id=o.id
where o.status in ('PLANEJADA','LIBERADA') and op.status<>'CONCLUIDA';

-- MRP de necessidade líquida: bruta (OFs abertas) − saldo livre − compras abertas − OFs em produção do próprio item.
create or replace function erp_mrp_liquido()
returns table(produto_id uuid,codigo text,descricao text,classificacao text,necessidade_bruta numeric,saldo_livre numeric,em_compra numeric,em_producao numeric,necessidade_liquida numeric,acao text,prazo_mais_cedo date)
language sql stable as $$
 with bruta as (
  select m.produto_id,
   sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q,
   min(o.prazo) prazo
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id where o.status in ('PLANEJADA','LIBERADA') group by 1),
 saldo as (select produto_id,sum(fisico-bloqueado) livre from est_saldos group by 1),
 comp as (select i.produto_id,sum(i.quantidade-least(i.quantidade,i.quantidade_recebida)) q from cmp_pedido_itens i join cmp_pedidos p on p.id=i.pedido_id where p.status in ('EM_APROVACAO','APROVADO','PARCIAL') group by 1),
 prod as (
  select o.produto_estoque_id produto_id,
   sum(greatest(0,o.quantidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=o.id and x.produto_id=o.produto_estoque_id and x.tipo='ENTRADA' and x.estorno_de is null),0))) q
  from erp_ordens_fabricacao o where o.status in ('PLANEJADA','LIBERADA') and o.of_pai_id is not null group by 1)
 select p.id,p.codigo::text,p.descricao::text,p.classificacao::text,b.q::numeric,coalesce(s.livre,0)::numeric,coalesce(c.q,0)::numeric,coalesce(pr.q,0)::numeric,
  greatest(0,b.q-coalesce(s.livre,0)-coalesce(c.q,0)-coalesce(pr.q,0))::numeric,
  (case when b.q-coalesce(s.livre,0)-coalesce(c.q,0)-coalesce(pr.q,0)<=0 then 'OK' when p.classificacao in ('SEMIACABADO','ACABADO') then 'PRODUZIR' else 'COMPRAR' end)::text,
  b.prazo
 from bruta b join est_produtos p on p.id=b.produto_id left join saldo s on s.produto_id=b.produto_id left join comp c on c.produto_id=b.produto_id left join prod pr on pr.produto_id=b.produto_id
 order by 10 desc,b.prazo,p.codigo
$$;

-- Aprovar sugestão de OF: cria linha de programação "MRP" e gera a OF integrada (continua PLANEJADA até o CONFIRMAR).
create or replace function erp_mrp_gerar_of(p_emp uuid,p_fil uuid,p_prod uuid,p_qtd numeric,p_prazo date,p_local uuid,p_ator text) returns uuid language plpgsql as $$
declare cod text;des text;prog uuid;orig uuid;v_of uuid;
begin
 select codigo,descricao into strict cod,des from est_produtos where id=p_prod and ativo;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 select id into prog from pcp_programacoes where origem='MRP' and status='ATIVA' and data_programacao=(now() at time zone 'America/Sao_Paulo')::date and not coalesce(arquivada,false) limit 1;
 if prog is null then
  insert into pcp_programacoes(pedido,cliente,origem,data_programacao,turno,status) values('MRP','MRP','MRP',(now() at time zone 'America/Sao_Paulo')::date,'A','ATIVA') returning id into prog;
 end if;
 insert into pcp_produtos(programacao_id,pedido,produto,descricao,quantidade,of)
 values(prog,'MRP-'||to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD'),cod,coalesce(nullif(des,''),cod),p_qtd,'MRP') returning id into orig;
 v_of=erp_ciclo_gerar(p_emp,p_fil,p_prod,p_qtd,p_prazo,p_local,'PENDENTE',true,orig,orig,null,p_ator);
 perform erp_ciclo_auditar(p_ator,'MRP_GERAR_OF','ORDEM_FABRICACAO',v_of::text,jsonb_build_object('produto',cod,'quantidade',p_qtd));
 return v_of;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-26_18_mrp_aps.sql','ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-26_18_mrp_aps.sql','ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 29_2026-10-27_19_expedicao_logistica.up.sql
-- GERADO do arquivo canônico 2026-10-27_19_expedicao_logistica.sql; SHA256 10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-26_18_mrp_aps.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-27_19_expedicao_logistica.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-27_19_expedicao_logistica.sql' and checksum<>'10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists exp_transportadoras(
 id uuid primary key default gen_random_uuid(),
 nome varchar(200) not null, documento varchar(40) not null default '',
 contato varchar(160) not null default '', ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_remessas(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 pedido_venda_id uuid not null references crm_pedidos_venda(id) on delete restrict,
 cliente_id uuid not null references crm_clientes(id),
 transportadora_id uuid references exp_transportadoras(id),
 local_id uuid not null references est_locais(id),
 status varchar(10) not null default 'ABERTA' check(status in ('ABERTA','SEPARANDO','FECHADA','ENTREGUE','CANCELADA')),
 frete numeric(16,2) not null default 0 check(frete>=0),
 previsao_entrega date,
 fechada_em timestamptz, entregue_em timestamptz,
 nota_numero varchar(40) not null default '',
 observacoes text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_exp_remessas_pedido on exp_remessas(pedido_venda_id,status);
create table if not exists exp_remessa_itens(
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 linha integer not null check(linha>0),
 pedido_linha integer not null,
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 movimento_id bigint references est_movimentos(id),
 primary key(remessa_id,linha)
);
create table if not exists exp_remessa_pallets(
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 pallet_id uuid not null references pcp_pallets(id),
 lido_por varchar(160) not null, lido_em timestamptz not null default now(),
 primary key(remessa_id,pallet_id)
);
create unique index if not exists ux_exp_pallet_unico on exp_remessa_pallets(pallet_id);
create table if not exists exp_ocorrencias(
 id bigserial primary key,
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 tipo varchar(20) not null default 'OUTRO' check(tipo in ('ATRASO','AVARIA','FALTA','RECUSA','OUTRO','ENTREGA')),
 descricao text not null, origem varchar(10) not null default 'INTERNA' check(origem in ('INTERNA','CLIENTE')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_devolucoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 remessa_id uuid not null references exp_remessas(id),
 pedido_venda_id uuid not null references crm_pedidos_venda(id),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 destino varchar(10) not null check(destino in ('ESTOQUE','QUARENTENA')),
 valor numeric(16,2) not null default 0 check(valor>=0),
 valor_aplicado numeric(16,2) not null default 0 check(valor_aplicado>=0),
 motivo text not null, local_id uuid not null references est_locais(id),
 movimento_id bigint references est_movimentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_eventos_faturamento(
 id uuid primary key default gen_random_uuid(),
 remessa_id uuid not null unique references exp_remessas(id),
 status varchar(10) not null default 'PRONTO' check(status in ('PRONTO','ENVIADO','CANCELADO')),
 payload jsonb not null,
 criado_em timestamptz not null default now()
);
create table if not exists exp_portal_tokens(
 id uuid primary key default gen_random_uuid(),
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 token_hash char(64) not null unique,
 expira_em timestamptz not null,
 revogado_em timestamptz, usado_em timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

-- ATP: disponível agora + produção planejada até a data (OFs abertas do item).
create or replace function exp_atp(p_prod uuid,p_qtd numeric,p_data date)
returns table(livre_agora numeric,producao_ate_data numeric,atp numeric,atende boolean)
language sql stable as $$
 with l as (select coalesce(sum(greatest(0,fisico-reservado-bloqueado)),0) v from est_saldos where produto_id=p_prod),
 pr as (select coalesce(sum(greatest(0,o.quantidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=o.id and x.produto_id=o.produto_estoque_id and x.tipo='ENTRADA' and x.estorno_de is null),0))),0) v
        from erp_ordens_fabricacao o where o.produto_estoque_id=p_prod and o.status in ('PLANEJADA','LIBERADA') and o.prazo<=p_data)
 select l.v::numeric,pr.v::numeric,(l.v+pr.v)::numeric,(l.v+pr.v)>=p_qtd from l,pr
$$;

-- Custo médio unitário do depósito (mesma fórmula do ciclo industrial: entradas - saídas / físico).
create or replace function exp_custo_medio(p_prod uuid,p_local uuid) returns numeric language sql stable as $$
 select greatest(0,coalesce(sum(case when m.tipo='ENTRADA' then m.custo_total when m.tipo='SAIDA' then -m.custo_total else 0 end),0))
  /nullif((select fisico from est_saldos where produto_id=p_prod and local_id=p_local),0)
 from est_movimentos m where m.produto_id=p_prod and (m.local_destino_id=p_local or m.local_origem_id=p_local)
$$;

-- Reserva de estoque para o pedido de venda (chave legada: est_movimentos.pedido = 'PV-<n>').
create or replace function exp_reservar(p_pedido uuid,p_prod uuid,p_local uuid,p_qtd numeric,p_ator text) returns bigint language plpgsql as $$
declare pv crm_pedidos_venda%rowtype;s est_saldos%rowtype;u text;v_id bigint;
begin
 select * into strict pv from crm_pedidos_venda where id=p_pedido;
 if pv.status not in ('APROVADO','EM_PRODUCAO','PARCIAL') then raise exception 'Pedido não está liberado para reserva (%)',pv.status;end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 select unidade_base into strict u from est_produtos where id=p_prod and ativo;
 insert into est_saldos(produto_id,local_id) values(p_prod,p_local) on conflict do nothing;
 select * into strict s from est_saldos where produto_id=p_prod and local_id=p_local for update;
 if s.fisico-s.reservado-s.bloqueado<p_qtd then raise exception 'SALDO_INSUFICIENTE: reserva (livre %)',s.fisico-s.reservado-s.bloqueado;end if;
 update est_saldos set reservado=reservado+p_qtd,atualizado_em=now() where produto_id=p_prod and local_id=p_local;
 insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,pedido,motivo,usuario)
 values('RESERVA',p_prod,p_local,p_qtd,p_qtd,u,'PV-'||pv.numero,'RESERVA PEDIDO DE VENDA',p_ator) returning id into v_id;
 return v_id;
end$$;

-- Leitura de pallet (QR) na remessa: só pallet liberado e do mesmo pedido.
create or replace function exp_ler_pallet(p_remessa uuid,p_codigo text,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;pl pcp_pallets%rowtype;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('ABERTA','SEPARANDO') then raise exception 'Remessa % não aceita leitura',r.status;end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id;
 select * into pl from pcp_pallets where codigo=trim(p_codigo);
 if not found then raise exception 'Pallet % não encontrado',trim(p_codigo);end if;
 if pl.status<>'LIBERADO' then raise exception 'Pallet % não liberado pela Qualidade/MSAC (status %)',pl.codigo,pl.status;end if;
 if pv.pedido_pcp<>'' and erp_norm_pedido(pl.pedido)<>erp_norm_pedido(pv.pedido_pcp) then raise exception 'Pallet % pertence a outro pedido (%)',pl.codigo,pl.pedido;end if;
 if exists(select 1 from exp_remessa_pallets x where x.pallet_id=pl.id) then raise exception 'Pallet % já foi lido em uma remessa',pl.codigo;end if;
 insert into exp_remessa_pallets(remessa_id,pallet_id,lido_por) values(p_remessa,pl.id,p_ator);
 update exp_remessas set status='SEPARANDO' where id=p_remessa and status='ABERTA';
 return pl.id;
end$$;

-- Fecha a carga: todos os pallets do pedido lidos e liberados; baixa estoque (e reserva); gera evento de faturamento.
create or replace function exp_fechar_remessa(p_remessa uuid,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;it record;pl record;s est_saldos%rowtype;u text;res numeric;v_mov bigint;
 enviado numeric;pedido_qtd numeric;v_custo numeric;tudo boolean=true;ev uuid;falta text;payload jsonb;novo text;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('ABERTA','SEPARANDO') then raise exception 'Remessa % não pode ser fechada',r.status;end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id for update;
 if not exists(select 1 from exp_remessa_itens where remessa_id=p_remessa) then raise exception 'Remessa sem itens';end if;
 if not exists(select 1 from exp_remessa_pallets where remessa_id=p_remessa) then raise exception 'Nenhum pallet lido na remessa';end if;
 -- pallets do mesmo pedido ainda não expedidos precisam estar lidos nesta carga
 select string_agg(pl2.codigo||' ('||pl2.status||')',', ') into falta from pcp_pallets pl2
  where pv.pedido_pcp<>'' and erp_norm_pedido(pl2.pedido)=erp_norm_pedido(pv.pedido_pcp)
    and not exists(select 1 from exp_remessa_pallets x where x.pallet_id=pl2.id);
 if falta is not null then raise exception 'Pallets do pedido não lidos/liberados na carga: %',falta;end if;
 if exists(select 1 from exp_remessa_pallets x join pcp_pallets p on p.id=x.pallet_id where x.remessa_id=p_remessa and p.status<>'LIBERADO') then raise exception 'Há pallet na carga que deixou de estar liberado';end if;
 for it in select * from exp_remessa_itens where remessa_id=p_remessa order by linha loop
  select unidade_base into strict u from est_produtos where id=it.produto_id;
  select * into strict s from est_saldos where produto_id=it.produto_id and local_id=r.local_id for update;
  select greatest(0,coalesce(sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' or (tipo='SAIDA' and baixa_reserva) then -quantidade_base else 0 end),0)) into res
   from est_movimentos where pedido='PV-'||pv.numero and produto_id=it.produto_id and local_origem_id=r.local_id;
  if s.fisico-s.bloqueado-(s.reservado-least(res,it.quantidade))<it.quantidade then raise exception 'SALDO_INSUFICIENTE: item % da remessa',it.linha;end if;
  v_custo=round(coalesce(exp_custo_medio(it.produto_id,r.local_id),0)*it.quantidade,6);
  update est_saldos set fisico=fisico-it.quantidade,reservado=reservado-least(res,it.quantidade),atualizado_em=now() where produto_id=it.produto_id and local_id=r.local_id;
  insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,baixa_reserva,documento,pedido,motivo,usuario,custo_total)
  values('SAIDA',it.produto_id,r.local_id,it.quantidade,it.quantidade,u,least(res,it.quantidade)>0,'REMESSA '||r.numero,'PV-'||pv.numero,'EXPEDICAO',p_ator,v_custo) returning id into v_mov;
  update exp_remessa_itens set movimento_id=v_mov where remessa_id=p_remessa and linha=it.linha;
 end loop;
 update exp_remessas set status='FECHADA',fechada_em=now() where id=p_remessa;
 -- status do pedido conforme quantidade expedida acumulada
 for it in select i.linha,i.quantidade from crm_pedido_venda_itens i where i.pedido_id=pv.id loop
  select coalesce(sum(ri.quantidade),0) into enviado from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id where rr.pedido_venda_id=pv.id and rr.status in ('FECHADA','ENTREGUE') and ri.pedido_linha=it.linha;
  if enviado<it.quantidade then tudo=false;end if;
 end loop;
 novo=case when tudo then 'ATENDIDO' else 'PARCIAL' end;
 if pv.status in ('APROVADO','EM_PRODUCAO','PARCIAL') and pv.status<>novo and (novo='ATENDIDO' or pv.status<>'PARCIAL') then
  update crm_pedidos_venda set status=novo,atualizado_por=p_ator,atualizado_em=now() where id=pv.id;
  insert into crm_pedido_venda_historico(pedido_id,evento,de,para,usuario) values(pv.id,'EXPEDIDO',pv.status,novo,p_ator);
 end if;
 select jsonb_build_object('remessa',r.numero,'pedido_venda',pv.numero,'pedido_cliente',pv.pedido_cliente,'cliente_id',pv.cliente_id,'frete',r.frete,
   'itens',(select jsonb_agg(jsonb_build_object('produto',p.codigo,'descricao',p.descricao,'quantidade',ri.quantidade,'preco_unitario',round(pi.total/nullif(pi.quantidade,0),4),'valor',round(pi.total/nullif(pi.quantidade,0)*ri.quantidade,2)) order by ri.linha)
     from exp_remessa_itens ri join est_produtos p on p.id=ri.produto_id left join crm_pedido_venda_itens pi on pi.pedido_id=pv.id and pi.linha=ri.pedido_linha where ri.remessa_id=p_remessa),
   'pallets',(select jsonb_agg(p.codigo order by p.codigo) from exp_remessa_pallets x join pcp_pallets p on p.id=x.pallet_id where x.remessa_id=p_remessa)) into payload;
 insert into exp_eventos_faturamento(remessa_id,payload) values(p_remessa,payload) returning id into ev;
 return ev;
end$$;

create or replace function exp_entregar(p_remessa uuid,p_nota text,p_ator text) returns void language plpgsql as $$
begin
 update exp_remessas set status='ENTREGUE',entregue_em=now(),nota_numero=coalesce(nullif(p_nota,''),nota_numero) where id=p_remessa and status='FECHADA';
 if not found then raise exception 'Somente remessa fechada pode ser marcada como entregue';end if;
 insert into exp_ocorrencias(remessa_id,tipo,descricao,criado_por) values(p_remessa,'ENTREGA','Entrega confirmada',p_ator);
end$$;

-- Devolução: volta ao estoque (ou quarentena), reduz o faturado líquido e estorna a comissão proporcional.
create or replace function exp_devolver(p_remessa uuid,p_prod uuid,p_qtd numeric,p_destino text,p_motivo text,p_local uuid,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;enviado numeric;devolvido numeric;preco numeric;v_valor numeric;aplicar numeric;nova_dev numeric;
 lib numeric;v_cu numeric;ja_est numeric;devido numeric;est numeric;prov uuid;rep uuid;bas text;v_mov bigint;did uuid;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('FECHADA','ENTREGUE') then raise exception 'Devolução só de remessa expedida';end if;
 if p_destino not in ('ESTOQUE','QUARENTENA') then raise exception 'Destino inválido';end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo da devolução';end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id for update;
 select coalesce(sum(quantidade),0) into enviado from exp_remessa_itens where remessa_id=p_remessa and produto_id=p_prod;
 select coalesce(sum(quantidade),0) into devolvido from exp_devolucoes where remessa_id=p_remessa and produto_id=p_prod;
 if enviado=0 then raise exception 'Produto não consta na remessa';end if;
 if devolvido+p_qtd>enviado then raise exception 'Devolução maior que o expedido (já devolvido %, expedido %)',devolvido,enviado;end if;
 select coalesce(sum(pi.total/nullif(pi.quantidade,0)*ri.quantidade)/nullif(sum(ri.quantidade),0),0) into preco
  from exp_remessa_itens ri join crm_pedido_venda_itens pi on pi.pedido_id=pv.id and pi.linha=ri.pedido_linha where ri.remessa_id=p_remessa and ri.produto_id=p_prod;
 v_valor=round(preco*p_qtd,2);
 select coalesce(sum(m.custo_total)/nullif(sum(m.quantidade_base),0),0) into v_cu from exp_remessa_itens ri join est_movimentos m on m.id=ri.movimento_id where ri.remessa_id=p_remessa and ri.produto_id=p_prod;
 v_mov=cmp_mov_estoque('ENTRADA',p_prod,p_local,p_qtd,'DEV REMESSA '||r.numero,'DEVOLUCAO CLIENTE',round(v_cu*p_qtd,6),p_ator);
 if p_destino='QUARENTENA' then update est_saldos set bloqueado=bloqueado+p_qtd where produto_id=p_prod and local_id=p_local;end if;
 aplicar=least(v_valor,greatest(0,pv.faturado_valor-pv.devolvido_valor));
 nova_dev=pv.devolvido_valor+aplicar;
 if aplicar>0 then
  update crm_pedidos_venda set devolvido_valor=nova_dev,atualizado_por=p_ator,atualizado_em=now() where id=pv.id;
  select id,representante_id,valor into prov,rep,devido from crm_comissoes where pedido_id=pv.id and tipo='PROVISAO' and status<>'ESTORNADA' limit 1;
  if prov is not null and pv.faturado_valor>0 then
   select coalesce(sum(valor),0) into lib from crm_comissoes where pedido_id=pv.id and tipo='LIBERACAO';
   select coalesce(-sum(valor),0) into ja_est from crm_comissoes where pedido_id=pv.id and tipo='ESTORNO';
   est=round(lib*nova_dev/pv.faturado_valor,2)-ja_est;
   if est>0 then
    select base into bas from crm_comissoes where id=prov;
    insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,motivo,criado_por)
    values(pv.id,rep,'ESTORNO',bas,aplicar,-est,'A_PAGAR',to_char(now(),'YYYY-MM'),prov,'Devolução remessa '||r.numero,p_ator);
   end if;
  end if;
  insert into crm_pedido_venda_historico(pedido_id,evento,usuario,detalhe) values(pv.id,'DEVOLVER',p_ator,jsonb_build_object('valor',aplicar,'origem','expedicao','remessa',r.numero));
 end if;
 insert into exp_devolucoes(remessa_id,pedido_venda_id,produto_id,quantidade,destino,valor,valor_aplicado,motivo,local_id,movimento_id,criado_por)
 values(p_remessa,pv.id,p_prod,p_qtd,p_destino,v_valor,aplicar,p_motivo,p_local,v_mov,p_ator) returning id into did;
 return did;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-27_19_expedicao_logistica.sql','10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-27_19_expedicao_logistica.sql','10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 30_2026-10-28_20_custos_industriais.up.sql
-- GERADO do arquivo canônico 2026-10-28_20_custos_industriais.sql; SHA256 0dc76fdda50306b11bf89f1875239295283c6ceeab09b75b0eee875462554cca
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-27_19_expedicao_logistica.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-28_20_custos_industriais.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-28_20_custos_industriais.sql' and checksum<>'0dc76fdda50306b11bf89f1875239295283c6ceeab09b75b0eee875462554cca') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists cst_taxas(
 id uuid primary key default gen_random_uuid(),
 centro_id uuid not null references pcp_capacidades_maquina(id) on delete cascade,
 custo_hora_mo numeric(14,4) not null default 0 check(custo_hora_mo>=0),
 custo_hora_maq numeric(14,4) not null default 0 check(custo_hora_maq>=0),
 gg_percentual numeric(8,4) not null default 0 check(gg_percentual between 0 and 1000),
 vigencia_inicio date not null default current_date,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(centro_id,vigencia_inicio)
);
create table if not exists cst_precos_padrao(
 produto_id uuid not null references est_produtos(id) on delete cascade,
 vigencia_inicio date not null default current_date,
 custo_unitario numeric(16,6) not null check(custo_unitario>=0),
 origem varchar(120) not null default 'MANUAL',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(produto_id,vigencia_inicio)
);
create table if not exists cst_padrao(
 id uuid primary key default gen_random_uuid(),
 produto_id uuid not null references est_produtos(id),
 data_ref date not null, lote numeric(16,3) not null default 1,
 material numeric(16,6) not null, mao_obra numeric(16,6) not null, maquina numeric(16,6) not null, gastos_gerais numeric(16,6) not null, total numeric(16,6) not null,
 detalhe jsonb not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_cst_padrao_prod on cst_padrao(produto_id,criado_em desc);
create table if not exists cst_horas_of(
 of_id uuid not null references erp_ordens_fabricacao(id) on delete cascade,
 operacao_id uuid not null references pcp_operacoes(id) on delete cascade,
 minutos numeric(12,2) not null check(minutos>=0),
 informado_por varchar(160) not null, informado_em timestamptz not null default now(),
 primary key(of_id,operacao_id)
);
create table if not exists cst_of_resultados(
 of_id uuid primary key references erp_ordens_fabricacao(id) on delete cascade,
 analise jsonb not null, calculado_em timestamptz not null default now(), calculado_por varchar(160) not null
);
create or replace function cst_padrao_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Custo padrão calculado é imutável; calcule uma nova versão';end$$;
drop trigger if exists cst_padrao_imutavel_t on cst_padrao;
create trigger cst_padrao_imutavel_t before update or delete on cst_padrao for each row execute function cst_padrao_imutavel();

create or replace function cst_preco(p_prod uuid,p_data date) returns numeric language sql stable as $$
 select custo_unitario from cst_precos_padrao where produto_id=p_prod and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;
create or replace function cst_taxa(p_centro uuid,p_data date) returns table(mo numeric,maq numeric,gg numeric) language sql stable as $$
 select custo_hora_mo,custo_hora_maq,gg_percentual from cst_taxas where centro_id=p_centro and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;

-- Custo padrão unitário da versão de produção vigente (BOM + roteiro): material + mão de obra + máquina + gastos gerais.
create or replace function cst_calc(p_prod uuid,p_data date,p_nivel int default 0,p_lote numeric default 1) returns jsonb language plpgsql stable as $$
declare v erp_versoes_producao%rowtype;it record;op jsonb;t record;mat numeric:=0;mo numeric:=0;maq numeric:=0;gg numeric:=0;preco numeric;sub jsonb;comps jsonb:='[]'::jsonb;ops jsonb:='[]'::jsonb;falt jsonb:='[]'::jsonb;
 min_un numeric;v_mo numeric;v_maq numeric;v_gg numeric;v_ops jsonb;
begin
 if p_nivel>8 then raise exception 'Estrutura com nível excessivo ou ciclo';end if;
 if p_lote<=0 then raise exception 'Lote inválido';end if;
 select * into v from erp_versoes_producao where produto_id=p_prod and inicio<=p_data and (fim is null or fim>=p_data) and minimo<=p_lote and (maximo is null or maximo>=p_lote) order by inicio desc limit 1;
 if not found then return null;end if;
 for it in select i.componente_id,i.quantidade,i.perda_percentual,pr.codigo,pr.classificacao from erp_estrutura_itens i join est_produtos pr on pr.id=i.componente_id where i.estrutura_id=v.estrutura_id order by pr.codigo loop
  sub=null;preco=null;
  if it.classificacao='SEMIACABADO' then sub=cst_calc(it.componente_id,p_data,p_nivel+1,greatest(1,p_lote*it.quantidade));preco=(sub->>'total')::numeric;end if;
  if preco is null then preco=cst_preco(it.componente_id,p_data);end if;
  if preco is null then falt=falt||to_jsonb(it.codigo);preco=0;end if;
  mat=mat+it.quantidade*(1+it.perda_percentual/100)*preco;
  comps=comps||jsonb_build_object('codigo',it.codigo,'quantidade',it.quantidade,'perda_percentual',it.perda_percentual,'preco',round(preco,6),'origem',case when sub is not null then 'SEMIACABADO' else 'PRECO_PADRAO' end);
 end loop;
 select operacoes into v_ops from erp_roteiros where id=v.roteiro_id;
 for op in select value from jsonb_array_elements(coalesce(v_ops,'[]'::jsonb)) loop
  min_un=coalesce((op->>'setup')::numeric,0)/p_lote+coalesce((op->>'ciclo')::numeric,0);
  select * into t from cst_taxa(nullif(op->>'centro_id','')::uuid,p_data);
  v_mo=min_un/60*coalesce(t.mo,0);v_maq=min_un/60*coalesce(t.maq,0);v_gg=(v_mo+v_maq)*coalesce(t.gg,0)/100;
  mo=mo+v_mo;maq=maq+v_maq;gg=gg+v_gg;
  if t.mo is null then falt=falt||to_jsonb('TAXA:'||coalesce(op->>'processo','?'));end if;
  ops=ops||jsonb_build_object('processo',op->>'processo','minutos_unitarios',round(min_un,6),'mao_obra',round(v_mo,6),'maquina',round(v_maq,6),'gastos_gerais',round(v_gg,6));
 end loop;
 return jsonb_build_object('produto_id',p_prod,'lote',p_lote,'material',round(mat,6),'mao_obra',round(mo,6),'maquina',round(maq,6),'gastos_gerais',round(gg,6),'total',round(mat+mo+maq+gg,6),
  'componentes',comps,'operacoes',ops,'pendencias',falt);
end$$;

create or replace function cst_calcular_padrao(p_prod uuid,p_data date,p_lote numeric,p_ator text) returns uuid language plpgsql as $$
declare c jsonb;v_id uuid;
begin
 c=cst_calc(p_prod,p_data,0,p_lote);
 if c is null then raise exception 'Produto sem versão de produção vigente (BOM + roteiro aprovados)';end if;
 insert into cst_padrao(produto_id,data_ref,lote,material,mao_obra,maquina,gastos_gerais,total,detalhe,criado_por)
 values(p_prod,p_data,p_lote,(c->>'material')::numeric,(c->>'mao_obra')::numeric,(c->>'maquina')::numeric,(c->>'gastos_gerais')::numeric,(c->>'total')::numeric,c,p_ator) returning id into v_id;
 return v_id;
end$$;

-- Padrão × real de uma OF, com variação de preço, quantidade (refugo × outros) e eficiência. Reconcilia: real - padrão = soma das variações.
create or replace function cst_of_analise(p_of uuid) returns jsonb language plpgsql stable as $$
declare o erp_ordens_fabricacao%rowtype;v_data date;v_boas numeric;v_refugo numeric;comp jsonb;op record;t record;
 v_comp uuid;v_q numeric;v_perda numeric;v_stdq numeric;v_realq numeric;v_realc numeric;v_price numeric;v_ref_units numeric;v_vp numeric;v_vq numeric;v_cref numeric;v_cout numeric;
 v_boa_k numeric;v_std_min numeric;v_real_min numeric;v_est boolean;v_std_c numeric;v_real_c numeric;v_efic numeric;v_cod text;
 mats jsonb:='[]'::jsonb;ops jsonb:='[]'::jsonb;sem jsonb:='[]'::jsonb;est_any boolean:=false;
 t_pad numeric:=0;t_real numeric:=0;t_preco numeric:=0;t_ref numeric:=0;t_out numeric:=0;t_efic numeric:=0;
begin
 select * into strict o from erp_ordens_fabricacao where id=p_of;
 if o.snapshot is null then raise exception 'OF sem snapshot do ciclo industrial: custo não disponível';end if;
 v_data=o.criado_em::date;
 select coalesce(sum(case when tipo='ENTRADA' and estorno_de is null then quantidade_base when tipo='SAIDA' and estorno_de is not null then -quantidade_base else 0 end),0) into v_boas from est_movimentos where of_id=o.id and produto_id=o.produto_estoque_id;
 select coalesce(sum((a.ciclo_payload->>'refugo')::numeric),0) into v_refugo from pcp_apontamentos a join pcp_operacoes po on po.id=a.operacao_id where po.of_id=o.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO';
 for comp in select value from jsonb_array_elements(coalesce(o.snapshot->'componentes','[]'::jsonb)) loop
  v_comp=(comp->>'componente_id')::uuid;v_q=(comp->>'quantidade')::numeric;v_perda=coalesce((comp->>'perda_percentual')::numeric,0);
  select codigo into v_cod from est_produtos where id=v_comp;
  v_stdq=v_boas*v_q*(1+v_perda/100);
  select coalesce(sum(case when tipo='SAIDA' and estorno_de is null then quantidade_base when tipo='ENTRADA' and estorno_de is not null then -quantidade_base else 0 end),0),
         coalesce(sum(case when tipo='SAIDA' and estorno_de is null then custo_total when tipo='ENTRADA' and estorno_de is not null then -custo_total else 0 end),0)
   into v_realq,v_realc from est_movimentos where of_id=o.id and produto_id=v_comp;
  v_price=cst_preco(v_comp,v_data);
  if v_price is null then sem=sem||to_jsonb(v_cod);v_price=case when v_realq>0 then v_realc/v_realq else 0 end;end if;
  select coalesce(sum(greatest(0,x.cons-v_boas)),0) into v_ref_units from (
   select coalesce((select sum((a.ciclo_payload->>'boa')::numeric+case when coalesce((a.ciclo_payload->>'consumirRefugo')::boolean,true) then (a.ciclo_payload->>'refugo')::numeric else 0 end) from pcp_apontamentos a where a.operacao_id=po.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO'),0) cons
   from pcp_operacoes po where po.of_id=o.id and exists(select 1 from jsonb_array_elements(coalesce(po.roteiro_snapshot->'componentes','[]'::jsonb)) z where (z->>'produto_id')::uuid=v_comp)) x;
  v_vp=v_realc-v_realq*v_price;v_vq=(v_realq-v_stdq)*v_price;
  if v_vq>0 then v_cref=least(v_vq,v_ref_units*v_q*(1+v_perda/100)*v_price);else v_cref=0;end if;
  v_cout=v_vq-v_cref;
  t_pad=t_pad+v_stdq*v_price;t_real=t_real+v_realc;t_preco=t_preco+v_vp;t_ref=t_ref+v_cref;t_out=t_out+v_cout;
  mats=mats||jsonb_build_object('codigo',v_cod,'qtd_padrao',round(v_stdq,3),'qtd_real',round(v_realq,3),'preco_padrao',round(v_price,6),'custo_padrao',round(v_stdq*v_price,2),'custo_real',round(v_realc,2),'var_preco',round(v_vp,2),'var_quantidade',round(v_vq,2),'causa_refugo',round(v_cref,2),'causa_outros',round(v_cout,2));
 end loop;
 for op in select po.id,po.processo,po.sequencia,po.roteiro_snapshot rs from pcp_operacoes po where po.of_id=o.id order by po.sequencia loop
  select coalesce(sum((a.ciclo_payload->>'boa')::numeric),0) into v_boa_k from pcp_apontamentos a where a.operacao_id=op.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO';
  continue when v_boa_k=0 and not exists(select 1 from cst_horas_of h where h.of_id=o.id and h.operacao_id=op.id);
  v_std_min=coalesce((op.rs->>'setup')::numeric,0)+v_boa_k*coalesce((op.rs->>'ciclo')::numeric,0);
  select minutos into v_real_min from cst_horas_of where of_id=o.id and operacao_id=op.id;
  v_est=v_real_min is null;if v_est then v_real_min=v_std_min;est_any=true;end if;
  select * into t from cst_taxa(nullif(op.rs->>'centro_id','')::uuid,v_data);
  v_std_c=v_std_min/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100);
  v_real_c=v_real_min/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100);
  v_efic=v_real_c-v_std_c;
  t_pad=t_pad+v_std_c;t_real=t_real+v_real_c;t_efic=t_efic+v_efic;
  if t.mo is null then sem=sem||to_jsonb('TAXA:'||op.processo);end if;
  ops=ops||jsonb_build_object('processo',op.processo,'sequencia',op.sequencia,'min_padrao',round(v_std_min,2),'min_real',round(v_real_min,2),'estimado',v_est,'custo_padrao',round(v_std_c,2),'custo_real',round(v_real_c,2),'var_eficiencia',round(v_efic,2));
 end loop;
 return jsonb_build_object('of',o.numero,'status',o.status,'boas',v_boas,'refugo',v_refugo,'material',mats,'operacoes',ops,'estimado',est_any,'pendencias',sem,
  'totais',jsonb_build_object('padrao',round(t_pad,2),'real',round(t_real,2),'variacao',round(t_real-t_pad,2),
    'padrao_unitario',case when v_boas>0 then round(t_pad/v_boas,4) end,'real_unitario',case when v_boas>0 then round(t_real/v_boas,4) end,
    'causas',jsonb_build_object('PRECO',round(t_preco,2),'REFUGO',round(t_ref,2),'PERDA_OUTROS',round(t_out,2),'EFICIENCIA',round(t_efic,2))));
end$$;

create or replace function cst_of_registrar(p_of uuid,p_ator text) returns jsonb language plpgsql as $$
declare a jsonb;
begin
 a=cst_of_analise(p_of);
 insert into cst_of_resultados(of_id,analise,calculado_por) values(p_of,a,p_ator)
 on conflict(of_id) do update set analise=excluded.analise,calculado_em=now(),calculado_por=excluded.calculado_por;
 return a;
end$$;

-- Valorização de estoque pelo razão de movimentos (entradas - saídas) × físico atual.
create or replace view cst_v_valorizacao as
select p.id produto_id,p.codigo,p.descricao,p.classificacao,coalesce(s.fisico,0) fisico,
 case when coalesce(s.fisico,0)>0 then greatest(0,coalesce(m.liq,0)) else 0 end valor,
 case when coalesce(s.fisico,0)>0 then greatest(0,coalesce(m.liq,0))/s.fisico end custo_medio,
 coalesce(cst_preco(p.id,current_date),(select pd.total/nullif(pd.lote,0) from cst_padrao pd where pd.produto_id=p.id order by pd.criado_em desc limit 1)) custo_padrao,
 (coalesce(s.fisico,0)>0 and coalesce(m.liq,0)<=0) sem_custo
from est_produtos p
left join (select produto_id,sum(fisico) fisico from est_saldos group by produto_id) s on s.produto_id=p.id
left join (select produto_id,sum(case when tipo='ENTRADA' then custo_total when tipo='SAIDA' then -custo_total else 0 end) liq from est_movimentos group by produto_id) m on m.produto_id=p.id
where p.ativo and (coalesce(s.fisico,0)>0 or m.liq is not null);

-- Margem real por pedido: receita líquida - custo expedido líquido de devoluções - comissão realizada.
create or replace view cst_v_margem_pedidos as
select p.id pedido_id,p.numero,p.cliente_id,c.razao_social cliente,p.representante_id,r.nome representante,p.data_emissao,
 (p.faturado_valor-p.devolvido_valor) receita,
 coalesce((select sum(m.custo_total) from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id join est_movimentos m on m.id=ri.movimento_id where rr.pedido_venda_id=p.id),0)
 -coalesce((select sum(m.custo_total) from exp_devolucoes d join est_movimentos m on m.id=d.movimento_id where d.pedido_venda_id=p.id),0) custo,
 coalesce((select sum(cm.valor) from crm_comissoes cm where cm.pedido_id=p.id and cm.tipo in('LIBERACAO','ESTORNO')),0) comissao
from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id left join crm_representantes r on r.id=p.representante_id
where p.faturado_valor>0;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-28_20_custos_industriais.sql','0dc76fdda50306b11bf89f1875239295283c6ceeab09b75b0eee875462554cca',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-28_20_custos_industriais.sql','0dc76fdda50306b11bf89f1875239295283c6ceeab09b75b0eee875462554cca','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 31_2026-10-29_21_fiscal.up.sql
-- GERADO do arquivo canônico 2026-10-29_21_fiscal.sql; SHA256 43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-28_20_custos_industriais.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-29_21_fiscal.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-29_21_fiscal.sql' and checksum<>'43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

alter table crm_clientes add column if not exists uf char(2);
alter table crm_clientes add column if not exists ie varchar(30) not null default '';
alter table crm_clientes add column if not exists regime_tributario varchar(10);
alter table crm_clientes add column if not exists contribuinte_icms boolean not null default true;

create table if not exists fis_emitente(
 singleton boolean primary key default true check(singleton),
 razao_social varchar(240) not null, cnpj varchar(14) not null check(cnpj ~ '^[0-9]{14}$'), ie varchar(30) not null default '',
 uf char(2) not null, regime varchar(10) not null check(regime in('SIMPLES','PRESUMIDO','REAL')),
 atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now()
);
create table if not exists fis_cfop(
 codigo char(4) primary key check(codigo ~ '^[0-9]{4}$'), descricao varchar(240) not null, sentido varchar(7) not null check(sentido in('ENTRADA','SAIDA'))
);
create table if not exists fis_produto_fiscal(
 produto_id uuid primary key references est_produtos(id) on delete cascade,
 ncm char(8) not null check(ncm ~ '^[0-9]{8}$'), cest char(7) check(cest is null or cest ~ '^[0-9]{7}$'),
 origem smallint not null default 0 check(origem between 0 and 8), unidade_trib varchar(6) not null default 'UN',
 classe_ibs_cbs varchar(10) not null default '',
 atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now()
);
create table if not exists fis_parametros(
 chave varchar(60) not null, vigencia_inicio date not null, valor text not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(chave,vigencia_inicio)
);
create table if not exists fis_regras(
 id uuid primary key default gen_random_uuid(),
 descricao varchar(200) not null default '',
 operacao varchar(30) not null check(operacao in('VENDA','COMPRA','DEVOLUCAO_VENDA','DEVOLUCAO_COMPRA','REMESSA','OUTRA')),
 uf_origem char(2), uf_destino char(2), ncm_prefixo varchar(8) not null default '' check(ncm_prefixo ~ '^[0-9]{0,8}$'),
 regime varchar(10) check(regime is null or regime in('SIMPLES','PRESUMIDO','REAL')),
 cfop char(4) not null references fis_cfop(codigo),
 tributos jsonb not null default '[]'::jsonb check(jsonb_typeof(tributos)='array'),
 ibs_cst varchar(10) not null default '', ibs_classe varchar(10) not null default '',
 ibs_aliquota numeric(8,4) not null default 0 check(ibs_aliquota between 0 and 100),
 cbs_aliquota numeric(8,4) not null default 0 check(cbs_aliquota between 0 and 100),
 vigencia_inicio date not null, vigencia_fim date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vigencia_fim is null or vigencia_fim>=vigencia_inicio)
);
create index if not exists ix_fis_regras_op on fis_regras(operacao,vigencia_inicio desc) where ativo;
create table if not exists fis_provedores(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null, adaptador varchar(40) not null check(adaptador in('SIMULADO','MANUAL','EXTERNO')),
 ambiente varchar(12) not null default 'HOMOLOGACAO' check(ambiente in('HOMOLOGACAO','PRODUCAO')),
 segredo_ref varchar(80) not null default '', ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(adaptador<>'SIMULADO' or ambiente='HOMOLOGACAO')
);
create table if not exists fis_documentos(
 id uuid primary key default gen_random_uuid(),
 tipo varchar(5) not null default 'NFE' check(tipo in('NFE','NFSE','CTE','MDFE')),
 evento_id uuid unique references exp_eventos_faturamento(id),
 status varchar(10) not null default 'PENDENCIA' check(status in('PENDENCIA','PRONTO','ENVIADO','AUTORIZADO','REJEITADO','CANCELADO')),
 payload jsonb not null, pendencias jsonb not null default '[]'::jsonb, tributos jsonb not null default '{}'::jsonb,
 total numeric(16,2) not null default 0 check(total>=0),
 provedor_id uuid references fis_provedores(id),
 chave char(44) check(chave is null or chave ~ '^[0-9]{44}$'), numero varchar(20), protocolo varchar(60), erro text,
 autorizado_em timestamptz, cancelado_motivo text,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_fis_doc_chave on fis_documentos(chave) where chave is not null;
create table if not exists fis_creditos(
 id uuid primary key default gen_random_uuid(),
 competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'), tributo varchar(10) not null, valor numeric(16,2) not null check(valor>=0),
 origem varchar(120) not null default '', documento varchar(80) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create or replace function fis_param(p_chave text,p_data date) returns text language sql stable as $$
 select valor from fis_parametros where chave=p_chave and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;

-- Regra mais específica e vigente (NCM > UF destino > UF origem > regime); empate pela vigência mais recente.
create or replace function fis_regra(p_op text,p_uf_o text,p_uf_d text,p_ncm text,p_regime text,p_data date) returns uuid language sql stable as $$
 select id from fis_regras
 where ativo and operacao=p_op and vigencia_inicio<=p_data and (vigencia_fim is null or vigencia_fim>=p_data)
  and (uf_origem is null or uf_origem=p_uf_o) and (uf_destino is null or uf_destino=p_uf_d)
  and (ncm_prefixo='' or p_ncm like ncm_prefixo||'%') and (regime is null or regime=p_regime)
 order by length(ncm_prefixo)*10+(uf_destino is not null)::int*4+(uf_origem is not null)::int*2+(regime is not null)::int desc,vigencia_inicio desc limit 1
$$;

-- Cálculo parametrizado (estimativa e grupo IBS/CBS): nenhuma alíquota fica no código.
create or replace function fis_calcular_item(p_regra uuid,p_valor numeric,p_data date) returns jsonb language plpgsql stable as $$
declare r fis_regras%rowtype;t jsonb;trib jsonb:='[]'::jsonb;base numeric;ibs jsonb:=null;
begin
 select * into strict r from fis_regras where id=p_regra;
 for t in select value from jsonb_array_elements(r.tributos) loop
  base=round(p_valor*(1-coalesce((t->>'reducao_base')::numeric,0)/100),2);
  trib=trib||jsonb_build_object('tributo',t->>'tributo','cst',t->>'cst','base',base,'aliquota',coalesce((t->>'aliquota')::numeric,0),'valor',round(base*coalesce((t->>'aliquota')::numeric,0)/100,2));
 end loop;
 if coalesce(fis_param('IBS_CBS_INFORMAR',p_data),'false')='true' then
  ibs=jsonb_build_object('cst',r.ibs_cst,'classe',r.ibs_classe,'base',p_valor,'p_ibs',r.ibs_aliquota,'v_ibs',round(p_valor*r.ibs_aliquota/100,2),'p_cbs',r.cbs_aliquota,'v_cbs',round(p_valor*r.cbs_aliquota/100,2));
 end if;
 return jsonb_build_object('cfop',r.cfop,'regra_id',r.id,'tributos',trib,'ibs_cbs',ibs);
end$$;

-- Monta o documento a partir do evento de faturamento da expedição; falta de dado vira pendência, nunca valor inventado.
create or replace function fis_montar_nfe(p_evento uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare ev exp_eventos_faturamento%rowtype;em fis_emitente%rowtype;cl crm_clientes%rowtype;it jsonb;pf fis_produto_fiscal%rowtype;reg uuid;calc jsonb;itens jsonb:='[]'::jsonb;pend jsonb:='[]'::jsonb;
 tot jsonb:='{}'::jsonb;t jsonb;total numeric:=0;v_cod text;v_id uuid;v_st text;v_old fis_documentos%rowtype;v_acum numeric;
begin
 select * into strict ev from exp_eventos_faturamento where id=p_evento;
 select * into v_old from fis_documentos where evento_id=p_evento;
 if found and v_old.status not in('PENDENCIA','PRONTO') then raise exception 'Documento já enviado/autorizado: não pode ser remontado';end if;
 select * into em from fis_emitente;
 if not found then pend=pend||to_jsonb('EMITENTE: cadastre o emitente fiscal'::text);end if;
 select * into cl from crm_clientes where id=(ev.payload->>'cliente_id')::uuid;
 if cl.uf is null then pend=pend||to_jsonb('CLIENTE: informe a UF'::text);end if;
 if length(regexp_replace(coalesce(cl.documento,''),'[^0-9]','','g')) not in(11,14) then pend=pend||to_jsonb('CLIENTE: CPF/CNPJ inválido'::text);end if;
 if cl.regime_tributario is null then pend=pend||to_jsonb('CLIENTE: informe o regime tributário'::text);end if;
 for it in select value from jsonb_array_elements(coalesce(ev.payload->'itens','[]'::jsonb)) loop
  v_cod=it->>'produto';
  select f.* into pf from fis_produto_fiscal f join est_produtos p on p.id=f.produto_id where p.codigo=v_cod;
  if not found then pend=pend||to_jsonb('PRODUTO '||v_cod||': sem NCM/cadastro fiscal');continue;end if;
  reg=fis_regra('VENDA',em.uf,cl.uf,pf.ncm,coalesce(cl.regime_tributario,em.regime),p_data);
  if reg is null then pend=pend||to_jsonb('PRODUTO '||v_cod||': nenhuma regra de tributação vigente');continue;end if;
  calc=fis_calcular_item(reg,(it->>'valor')::numeric,p_data);
  itens=itens||(jsonb_build_object('produto',v_cod,'descricao',it->>'descricao','ncm',pf.ncm,'cest',pf.cest,'origem',pf.origem,'unidade',pf.unidade_trib,'quantidade',(it->>'quantidade')::numeric,'valor_unitario',(it->>'preco_unitario')::numeric,'valor',(it->>'valor')::numeric)||calc);
  total=total+(it->>'valor')::numeric;
  for t in select value from jsonb_array_elements(calc->'tributos') loop
   v_acum=coalesce((tot->>(t->>'tributo'))::numeric,0)+(t->>'valor')::numeric;tot=tot||jsonb_build_object(t->>'tributo',v_acum);
  end loop;
  if calc->'ibs_cbs' is not null and calc->'ibs_cbs'<>'null'::jsonb then
   tot=tot||jsonb_build_object('IBS',coalesce((tot->>'IBS')::numeric,0)+(calc->'ibs_cbs'->>'v_ibs')::numeric,'CBS',coalesce((tot->>'CBS')::numeric,0)+(calc->'ibs_cbs'->>'v_cbs')::numeric);
  end if;
 end loop;
 if jsonb_array_length(itens)=0 and jsonb_array_length(pend)=0 then pend=pend||to_jsonb('Evento sem itens'::text);end if;
 v_st=case when jsonb_array_length(pend)=0 then 'PRONTO' else 'PENDENCIA' end;
 insert into fis_documentos(tipo,evento_id,status,payload,pendencias,tributos,total,criado_por)
 values('NFE',p_evento,v_st,jsonb_build_object('emitente',to_jsonb(em),'destinatario',jsonb_build_object('id',cl.id,'razao_social',cl.razao_social,'documento',cl.documento,'ie',cl.ie,'uf',cl.uf,'regime',cl.regime_tributario),
   'remessa',ev.payload->'remessa','pedido_cliente',ev.payload->>'pedido_cliente','frete',ev.payload->'frete','itens',itens,'data_ref',p_data),pend,tot,total,p_ator)
 on conflict(evento_id) do update set status=excluded.status,payload=excluded.payload,pendencias=excluded.pendencias,tributos=excluded.tributos,total=excluded.total,atualizado_em=now()
 returning id into v_id;
 return v_id;
end$$;

-- Máquina de estados do documento; retorno do provedor é a única fonte de chave/protocolo.
create or replace function fis_mudar_status(p_doc uuid,p_novo text,p_chave text,p_numero text,p_protocolo text,p_erro text,p_provedor uuid,p_ator text) returns void language plpgsql as $$
declare d fis_documentos%rowtype;ok boolean;
begin
 select * into strict d from fis_documentos where id=p_doc for update;
 ok=(d.status='PRONTO' and p_novo='ENVIADO') or (d.status='ENVIADO' and p_novo in('AUTORIZADO','REJEITADO')) or (d.status='REJEITADO' and p_novo='PRONTO') or (d.status='AUTORIZADO' and p_novo='CANCELADO');
 if not ok then raise exception 'Transição inválida do documento: % -> %',d.status,p_novo;end if;
 if p_novo='AUTORIZADO' and (p_chave is null or p_chave !~ '^[0-9]{44}$' or coalesce(p_protocolo,'')='') then raise exception 'Autorização exige chave de 44 dígitos e protocolo';end if;
 if p_novo='CANCELADO' and length(trim(coalesce(p_erro,'')))<15 then raise exception 'Cancelamento exige justificativa de ao menos 15 caracteres';end if;
 update fis_documentos set status=p_novo,chave=coalesce(p_chave,chave),numero=coalesce(p_numero,numero),protocolo=coalesce(p_protocolo,protocolo),
  erro=case when p_novo='CANCELADO' then erro else p_erro end,cancelado_motivo=case when p_novo='CANCELADO' then p_erro else cancelado_motivo end,
  provedor_id=coalesce(p_provedor,provedor_id),autorizado_em=case when p_novo='AUTORIZADO' then now() else autorizado_em end,atualizado_em=now() where id=p_doc;
 if p_novo='AUTORIZADO' then update exp_eventos_faturamento set status='ENVIADO' where id=d.evento_id;
 elsif p_novo='CANCELADO' then update exp_eventos_faturamento set status='CANCELADO' where id=d.evento_id;end if;
end$$;

-- Apuração simplificada por competência: débitos de documentos autorizados (menos cancelados) × créditos lançados.
create or replace function fis_apurar(p_comp text) returns table(tributo text,debito numeric,credito numeric,saldo numeric) language sql stable as $$
 with d as (select e.key tributo,sum(e.value::numeric) v from fis_documentos f,jsonb_each_text(f.tributos) e
   where f.status='AUTORIZADO' and to_char(f.autorizado_em at time zone 'America/Sao_Paulo','YYYY-MM')=p_comp group by e.key),
 c as (select tributo,sum(valor) v from fis_creditos where competencia=p_comp group by tributo)
 select coalesce(d.tributo,c.tributo),coalesce(d.v,0),coalesce(c.v,0),coalesce(d.v,0)-coalesce(c.v,0) from d full join c on c.tributo=d.tributo order by 1
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-29_21_fiscal.sql','43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-29_21_fiscal.sql','43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 32_2026-10-30_22_financeiro_contabil.up.sql
-- GERADO do arquivo canônico 2026-10-30_22_financeiro_contabil.sql; SHA256 964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-29_21_fiscal.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-30_22_financeiro_contabil.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-30_22_financeiro_contabil.sql' and checksum<>'964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists fin_contas_bancarias(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null, banco varchar(60) not null default '', agencia varchar(20) not null default '', conta varchar(30) not null default '',
 pix_chave varchar(140) not null default '', pix_cidade varchar(15) not null default '', pix_nome varchar(25) not null default '',
 saldo_inicial numeric(16,2) not null default 0, saldo_inicial_data date not null default current_date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists fin_centros_custo(
 id uuid primary key default gen_random_uuid(), codigo varchar(30) not null unique, nome varchar(120) not null, ativo boolean not null default true
);
create table if not exists ctb_contas(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(160) not null,
 tipo varchar(10) not null check(tipo in('ATIVO','PASSIVO','PL','RECEITA','CUSTO','DESPESA')),
 analitica boolean not null default true, ativo boolean not null default true
);
create table if not exists ctb_regras_lancamento(
 evento varchar(40) primary key,
 conta_debito_id uuid not null references ctb_contas(id), conta_credito_id uuid not null references ctb_contas(id),
 ativo boolean not null default true, check(conta_debito_id<>conta_credito_id)
);
create table if not exists ctb_lancamentos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 data date not null, competencia char(7) not null, historico varchar(300) not null,
 evento varchar(40), origem_id uuid, estorno_de uuid references ctb_lancamentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_ctb_evento_origem on ctb_lancamentos(evento,origem_id) where evento is not null and origem_id is not null;
create unique index if not exists ux_ctb_estorno on ctb_lancamentos(estorno_de) where estorno_de is not null;
create table if not exists ctb_partidas(
 id bigserial primary key,
 lancamento_id uuid not null references ctb_lancamentos(id),
 conta_id uuid not null references ctb_contas(id),
 debito numeric(16,2) not null default 0 check(debito>=0), credito numeric(16,2) not null default 0 check(credito>=0),
 centro_custo_id uuid references fin_centros_custo(id),
 check((debito>0) <> (credito>0))
);
create index if not exists ix_ctb_partidas_conta on ctb_partidas(conta_id,lancamento_id);
create table if not exists ctb_pendencias(
 id bigserial primary key, evento varchar(40) not null, origem_id uuid not null, data date not null, valor numeric(16,2) not null,
 historico varchar(300) not null, centro_custo_id uuid, criado_em timestamptz not null default now(), unique(evento,origem_id)
);
create or replace function ctb_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Lançamento contábil é imutável; use estorno';end$$;
drop trigger if exists ctb_lanc_imutavel_t on ctb_lancamentos;
create trigger ctb_lanc_imutavel_t before update or delete on ctb_lancamentos for each row execute function ctb_imutavel();
drop trigger if exists ctb_part_imutavel_t on ctb_partidas;
create trigger ctb_part_imutavel_t before update or delete on ctb_partidas for each row execute function ctb_imutavel();

create table if not exists fin_titulos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(7) not null check(tipo in('RECEBER','PAGAR')),
 origem varchar(20) not null check(origem in('PEDIDO_VENDA','COMISSAO','COMPRA','MANUAL')),
 origem_id uuid, ref varchar(80) not null default '', parcela integer not null default 1 check(parcela>0),
 parceiro varchar(240) not null default '', parceiro_id uuid, descricao varchar(300) not null default '',
 vencimento date not null, valor numeric(16,2) not null check(valor>0), valor_baixado numeric(16,2) not null default 0 check(valor_baixado>=0),
 status varchar(10) not null default 'ABERTO' check(status in('ABERTO','PARCIAL','LIQUIDADO','CANCELADO')),
 centro_custo_id uuid references fin_centros_custo(id), competencia char(7) not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 check(valor_baixado<=valor)
);
create unique index if not exists ux_fin_titulo_origem on fin_titulos(origem,origem_id,ref,parcela) where origem_id is not null;
create index if not exists ix_fin_titulos_venc on fin_titulos(tipo,status,vencimento);
create table if not exists fin_extratos(
 id uuid primary key default gen_random_uuid(),
 conta_id uuid not null references fin_contas_bancarias(id), data date not null, descricao varchar(300) not null default '',
 valor numeric(16,2) not null check(valor<>0), fitid varchar(120) not null, baixa_id uuid,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), unique(conta_id,fitid)
);
create table if not exists fin_baixas(
 id uuid primary key default gen_random_uuid(),
 titulo_id uuid not null references fin_titulos(id), conta_id uuid not null references fin_contas_bancarias(id),
 data date not null, valor numeric(16,2) not null check(valor>0), estorno_de uuid references fin_baixas(id),
 extrato_id uuid references fin_extratos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_fin_baixa_estorno on fin_baixas(estorno_de) where estorno_de is not null;
create table if not exists fin_orcamento(
 centro_custo_id uuid not null references fin_centros_custo(id), conta_id uuid not null references ctb_contas(id), competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'),
 valor_orcado numeric(16,2) not null check(valor_orcado>=0), primary key(centro_custo_id,conta_id,competencia)
);

-- ---------------------------------------------------------------- Contabilidade
create or replace function ctb_lancar(p_data date,p_hist text,p_evento text,p_origem uuid,p_partidas jsonb,p_ator text,p_estorno uuid default null) returns uuid language plpgsql as $$
declare v_id uuid;pa jsonb;d numeric:=0;c numeric:=0;n int:=0;
begin
 if p_evento is not null and p_origem is not null then select id into v_id from ctb_lancamentos where evento=p_evento and origem_id=p_origem;if found then return v_id;end if;end if;
 for pa in select value from jsonb_array_elements(p_partidas) loop
  n=n+1;d=d+coalesce((pa->>'debito')::numeric,0);c=c+coalesce((pa->>'credito')::numeric,0);
  if not exists(select 1 from ctb_contas where id=(pa->>'conta_id')::uuid and analitica and ativo) then raise exception 'Conta contábil inválida, inativa ou sintética';end if;
 end loop;
 if n<2 then raise exception 'Lançamento exige ao menos duas partidas';end if;
 if round(d,2)<>round(c,2) or d<=0 then raise exception 'Lançamento desbalanceado: débitos % x créditos %',d,c;end if;
 insert into ctb_lancamentos(data,competencia,historico,evento,origem_id,estorno_de,criado_por) values(p_data,to_char(p_data,'YYYY-MM'),left(p_hist,300),p_evento,p_origem,p_estorno,p_ator) returning id into v_id;
 insert into ctb_partidas(lancamento_id,conta_id,debito,credito,centro_custo_id)
 select v_id,(x.value->>'conta_id')::uuid,coalesce((x.value->>'debito')::numeric,0),coalesce((x.value->>'credito')::numeric,0),nullif(x.value->>'centro_custo_id','')::uuid from jsonb_array_elements(p_partidas) x;
 return v_id;
end$$;

-- Lançamento automático por regra; sem regra, registra pendência (não bloqueia a operação) para reprocessar.
create or replace function ctb_postar_evento(p_evento text,p_origem uuid,p_data date,p_valor numeric,p_hist text,p_centro uuid,p_ator text) returns uuid language plpgsql as $$
declare r ctb_regras_lancamento%rowtype;
begin
 if p_valor is null or p_valor<=0 then return null;end if;
 select * into r from ctb_regras_lancamento where evento=p_evento and ativo;
 if not found then
  insert into ctb_pendencias(evento,origem_id,data,valor,historico,centro_custo_id) values(p_evento,p_origem,p_data,p_valor,left(p_hist,300),p_centro) on conflict do nothing;return null;
 end if;
 return ctb_lancar(p_data,p_hist,p_evento,p_origem,jsonb_build_array(jsonb_build_object('conta_id',r.conta_debito_id,'debito',p_valor,'centro_custo_id',p_centro),jsonb_build_object('conta_id',r.conta_credito_id,'credito',p_valor,'centro_custo_id',p_centro)),p_ator);
end$$;

create or replace function ctb_reprocessar(p_ator text) returns integer language plpgsql as $$
declare p record;n int:=0;v uuid;
begin
 for p in select * from ctb_pendencias order by id loop
  if exists(select 1 from ctb_regras_lancamento where evento=p.evento and ativo) then
   v=ctb_postar_evento(p.evento,p.origem_id,p.data,p.valor,p.historico,p.centro_custo_id,p_ator);
   if v is not null then delete from ctb_pendencias where id=p.id;n=n+1;end if;
  end if;
 end loop;
 return n;
end$$;

create or replace function ctb_estornar(p_lanc uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare l ctb_lancamentos%rowtype;
begin
 select * into strict l from ctb_lancamentos where id=p_lanc;
 if l.estorno_de is not null then raise exception 'Estorno não pode ser estornado';end if;
 if exists(select 1 from ctb_lancamentos where estorno_de=p_lanc) then raise exception 'Lançamento já estornado';end if;
 return ctb_lancar(p_data,'ESTORNO: '||l.historico,null,null,(select jsonb_agg(jsonb_build_object('conta_id',conta_id,'debito',credito,'credito',debito,'centro_custo_id',centro_custo_id)) from ctb_partidas where lancamento_id=p_lanc),p_ator,p_lanc);
end$$;

-- Plano de contas padrão (industrial simplificado) e regras de lançamento automático; idempotente.
create or replace function ctb_semear_plano(p_ator text) returns integer language plpgsql as $$
declare n int:=0;c record;
begin
 for c in select * from (values
  ('1','ATIVO','ATIVO',false),('1.1.01','Caixa e bancos','ATIVO',true),('1.1.02','Clientes a receber','ATIVO',true),('1.1.03','Estoques','ATIVO',true),('1.1.04','Recebíveis diversos','ATIVO',true),
  ('2','PASSIVO','PASSIVO',false),('2.1.01','Fornecedores','PASSIVO',true),('2.1.02','Comissões a pagar','PASSIVO',true),('2.1.03','Contas a pagar diversas','PASSIVO',true),
  ('2.9.01','Capital e reservas','PL',true),
  ('3','RECEITAS','RECEITA',false),('3.1.01','Receita de vendas','RECEITA',true),('3.1.02','Devoluções e abatimentos de vendas','RECEITA',true),
  ('4.1.01','Custo das mercadorias vendidas','CUSTO',true),
  ('5.1.01','Despesa com comissões','DESPESA',true),('5.1.02','Despesas administrativas','DESPESA',true),('5.1.03','Despesas comerciais','DESPESA',true)
 ) v(codigo,nome,tipo,analitica) loop
  insert into ctb_contas(codigo,nome,tipo,analitica) values(c.codigo,c.nome,c.tipo,c.analitica) on conflict(codigo) do nothing;
  if found then n=n+1;end if;
 end loop;
 insert into ctb_regras_lancamento(evento,conta_debito_id,conta_credito_id)
 select r.evento,(select id from ctb_contas where codigo=r.d),(select id from ctb_contas where codigo=r.c)
 from (values
  ('TITULO_RECEBER_PEDIDO_VENDA','1.1.02','3.1.01'),('BAIXA_RECEBER','1.1.01','1.1.02'),('DEVOLUCAO_VENDA','3.1.02','1.1.02'),
  ('TITULO_PAGAR_COMPRA','1.1.03','2.1.01'),('BAIXA_PAGAR','2.1.01','1.1.01'),
  ('TITULO_PAGAR_COMISSAO','5.1.01','2.1.02'),('ESTORNO_COMISSAO','2.1.02','5.1.01'),('TITULO_RECEBER_COMISSAO','1.1.04','2.1.02'),
  ('TITULO_PAGAR_PEDIDO_VENDA','1.1.02','2.1.03'),
  ('TITULO_PAGAR_MANUAL','5.1.02','2.1.01'),('TITULO_RECEBER_MANUAL','1.1.04','3.1.01'),
  ('CMV_VENDA','4.1.01','1.1.03'),('CMV_DEVOLUCAO','1.1.03','4.1.01')
 ) r(evento,d,c) on conflict(evento) do nothing;
 return n;
end$$;

-- ---------------------------------------------------------------- Financeiro
create or replace function fin_criar_titulo(p_tipo text,p_origem text,p_origem_id uuid,p_ref text,p_parcela int,p_parceiro text,p_parceiro_id uuid,p_desc text,p_venc date,p_valor numeric,p_centro uuid,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
 if p_valor<=0 then return null;end if;
 insert into fin_titulos(tipo,origem,origem_id,ref,parcela,parceiro,parceiro_id,descricao,vencimento,valor,centro_custo_id,competencia,criado_por)
 values(p_tipo,p_origem,p_origem_id,coalesce(p_ref,''),p_parcela,left(coalesce(p_parceiro,''),240),p_parceiro_id,left(coalesce(p_desc,''),300),p_venc,p_valor,p_centro,to_char(current_date,'YYYY-MM'),p_ator)
 on conflict do nothing returning id into v_id;
 if v_id is not null then perform ctb_postar_evento('TITULO_'||p_tipo||'_'||p_origem,v_id,current_date,p_valor,p_desc,p_centro,p_ator);end if;
 return v_id;
end$$;

create or replace function fin_baixar(p_titulo uuid,p_conta uuid,p_data date,p_valor numeric,p_extrato uuid,p_ator text) returns uuid language plpgsql as $$
declare t fin_titulos%rowtype;v_id uuid;novo numeric;
begin
 select * into strict t from fin_titulos where id=p_titulo for update;
 if t.status not in('ABERTO','PARCIAL') then raise exception 'Título % não aceita baixa',t.status;end if;
 if p_valor<=0 then raise exception 'Valor da baixa inválido';end if;
 if p_valor>t.valor-t.valor_baixado then raise exception 'Baixa maior que o saldo do título (saldo %)',t.valor-t.valor_baixado;end if;
 if not exists(select 1 from fin_contas_bancarias where id=p_conta and ativo) then raise exception 'Conta bancária inválida';end if;
 novo=t.valor_baixado+p_valor;
 update fin_titulos set valor_baixado=novo,status=case when novo=valor then 'LIQUIDADO' else 'PARCIAL' end,atualizado_em=now() where id=p_titulo;
 insert into fin_baixas(titulo_id,conta_id,data,valor,extrato_id,criado_por) values(p_titulo,p_conta,p_data,p_valor,p_extrato,p_ator) returning id into v_id;
 if p_extrato is not null then update fin_extratos set baixa_id=v_id where id=p_extrato and baixa_id is null;end if;
 perform ctb_postar_evento('BAIXA_'||t.tipo,v_id,p_data,p_valor,'Baixa título '||t.numero||' '||t.parceiro,t.centro_custo_id,p_ator);
 return v_id;
end$$;

create or replace function fin_estornar_baixa(p_baixa uuid,p_ator text) returns uuid language plpgsql as $$
declare b fin_baixas%rowtype;t fin_titulos%rowtype;v_id uuid;l uuid;novo numeric;
begin
 select * into strict b from fin_baixas where id=p_baixa;
 if b.estorno_de is not null then raise exception 'Estorno não pode ser estornado';end if;
 if exists(select 1 from fin_baixas where estorno_de=p_baixa) then raise exception 'Baixa já estornada';end if;
 select * into strict t from fin_titulos where id=b.titulo_id for update;
 novo=t.valor_baixado-b.valor;
 update fin_titulos set valor_baixado=novo,status=case when novo=0 then 'ABERTO' else 'PARCIAL' end,atualizado_em=now() where id=t.id;
 insert into fin_baixas(titulo_id,conta_id,data,valor,estorno_de,criado_por) values(b.titulo_id,b.conta_id,current_date,b.valor,p_baixa,p_ator) returning id into v_id;
 update fin_extratos set baixa_id=null where baixa_id=p_baixa;
 select id into l from ctb_lancamentos where evento='BAIXA_'||t.tipo and origem_id=p_baixa;
 if l is not null then perform ctb_estornar(l,current_date,p_ator);end if;
 return v_id;
end$$;

create or replace function fin_cancelar_titulo(p_titulo uuid,p_ator text) returns void language plpgsql as $$
declare t fin_titulos%rowtype;l uuid;
begin
 select * into strict t from fin_titulos where id=p_titulo for update;
 if t.valor_baixado>0 then raise exception 'Título com baixa: estorne as baixas antes de cancelar';end if;
 if t.status='CANCELADO' then return;end if;
 update fin_titulos set status='CANCELADO',atualizado_em=now() where id=p_titulo;
 select id into l from ctb_lancamentos where evento='TITULO_'||t.tipo||'_'||t.origem and origem_id=p_titulo;
 if l is not null and not exists(select 1 from ctb_lancamentos where estorno_de=l) then perform ctb_estornar(l,current_date,p_ator);end if;
 delete from ctb_pendencias where origem_id=p_titulo;
end$$;

-- Reduz títulos em aberto da origem (mais distantes primeiro); devolve o valor que não coube (já pago).
create or replace function fin_abater(p_tipo text,p_origem text,p_origem_id uuid,p_valor numeric) returns numeric language plpgsql as $$
declare t record;resto numeric:=p_valor;red numeric;
begin
 for t in select * from fin_titulos where tipo=p_tipo and origem=p_origem and origem_id=p_origem_id and status in('ABERTO','PARCIAL') order by vencimento desc,parcela desc for update loop
  exit when resto<=0;
  red=least(resto,t.valor-t.valor_baixado);
  if red>=t.valor-t.valor_baixado and t.valor_baixado=0 then update fin_titulos set status='CANCELADO',atualizado_em=now() where id=t.id;
  else update fin_titulos set valor=valor-red,status=case when valor-red=valor_baixado then 'LIQUIDADO' else status end,atualizado_em=now() where id=t.id;end if;
  resto=resto-red;
 end loop;
 return resto;
end$$;

create or replace function fin_gerar_receber(p_pedido uuid,p_valor numeric,p_ref text,p_ator text) returns integer language plpgsql as $$
declare pv crm_pedidos_venda%rowtype;cl crm_clientes%rowtype;cond text;prazos int[];n int;i int;parc numeric;acum numeric:=0;v numeric;criados int:=0;v_id uuid;
begin
 select * into strict pv from crm_pedidos_venda where id=p_pedido;
 select * into strict cl from crm_clientes where id=pv.cliente_id;
 cond=coalesce(nullif(pv.condicao_pagamento,''),cl.condicao_pagamento,'');
 select coalesce(array_agg(m[1]::int order by o),array[]::int[]) into prazos from regexp_matches(cond,'\d+','g') with ordinality as r(m,o);
 if coalesce(array_length(prazos,1),0)=0 then prazos=array[0];end if;
 n=array_length(prazos,1);parc=round(p_valor/n,2);
 for i in 1..n loop
  v=case when i=n then p_valor-acum else parc end;acum=acum+v;
  v_id=fin_criar_titulo('RECEBER','PEDIDO_VENDA',p_pedido,p_ref,i,cl.razao_social,cl.id,'Pedido de venda '||pv.numero||' parcela '||i||'/'||n,current_date+prazos[i],v,null,p_ator);
  if v_id is not null then criados=criados+1;end if;
 end loop;
 return criados;
end$$;

create or replace function fin_trg_pedido_venda() returns trigger language plpgsql as $$
declare delta numeric;resto numeric;cl crm_clientes%rowtype;
begin
 if new.faturado_valor>old.faturado_valor then perform fin_gerar_receber(new.id,new.faturado_valor-old.faturado_valor,'FAT:'||new.faturado_valor,new.atualizado_por);end if;
 if new.devolvido_valor>old.devolvido_valor then
  delta=new.devolvido_valor-old.devolvido_valor;
  perform ctb_postar_evento('DEVOLUCAO_VENDA',md5(new.id::text||':DEV:'||new.devolvido_valor)::uuid,current_date,delta,'Devolução pedido '||new.numero,null,new.atualizado_por);
  resto=fin_abater('RECEBER','PEDIDO_VENDA',new.id,delta);
  if resto>0 then
   select * into cl from crm_clientes where id=new.cliente_id;
   perform fin_criar_titulo('PAGAR','PEDIDO_VENDA',new.id,'DEV:'||new.devolvido_valor,1,cl.razao_social,cl.id,'Reembolso de devolução pedido '||new.numero,current_date,resto,null,new.atualizado_por);
  end if;
 end if;
 return new;
end$$;
drop trigger if exists fin_pedido_venda_t on crm_pedidos_venda;
create trigger fin_pedido_venda_t after update of faturado_valor,devolvido_valor on crm_pedidos_venda for each row execute function fin_trg_pedido_venda();

create or replace function fin_trg_comissao() returns trigger language plpgsql as $$
declare rep crm_representantes%rowtype;resto numeric;venc date;v numeric;
begin
 select * into rep from crm_representantes where id=new.representante_id;
 if new.tipo='LIBERACAO' and new.status='A_PAGAR' and new.valor>0 then
  venc=(to_date(new.competencia||'-01','YYYY-MM-DD')+interval '1 month' + interval '9 days')::date;
  perform fin_criar_titulo('PAGAR','COMISSAO',new.pedido_id,'COM:'||new.id,1,rep.nome,rep.id,'Comissão pedido (competência '||new.competencia||')',venc,new.valor,null,new.criado_por);
 elsif new.tipo='ESTORNO' and new.valor<0 then
  v=-new.valor;
  perform ctb_postar_evento('ESTORNO_COMISSAO',new.id,current_date,v,'Estorno de comissão',null,new.criado_por);
  resto=fin_abater('PAGAR','COMISSAO',new.pedido_id,v);
  if resto>0 then perform fin_criar_titulo('RECEBER','COMISSAO',new.pedido_id,'EST:'||new.id,1,rep.nome,rep.id,'Estorno de comissão já paga',current_date+30,resto,null,new.criado_por);end if;
 end if;
 return new;
end$$;
drop trigger if exists fin_comissao_ins_t on crm_comissoes;
create trigger fin_comissao_ins_t after insert on crm_comissoes for each row execute function fin_trg_comissao();
drop trigger if exists fin_comissao_upd_t on crm_comissoes;
create trigger fin_comissao_upd_t after update of status on crm_comissoes for each row when (new.status='A_PAGAR' and old.status is distinct from 'A_PAGAR') execute function fin_trg_comissao();

create or replace function fin_trg_compra() returns trigger language plpgsql as $$
declare f cmp_fornecedores%rowtype;pc cmp_pedidos%rowtype;delta numeric;
begin
 if new.quantidade_recebida<=old.quantidade_recebida then return new;end if;
 select * into strict pc from cmp_pedidos where id=new.pedido_id;
 select * into strict f from cmp_fornecedores where id=pc.fornecedor_id;
 delta=round((new.quantidade_recebida-old.quantidade_recebida)*new.preco_unitario,2);
 perform fin_criar_titulo('PAGAR','COMPRA',new.pedido_id,'REC:'||new.linha||':'||new.quantidade_recebida,1,f.razao_social,f.id,'Compra '||pc.numero||' linha '||new.linha,current_date+f.prazo_medio_dias,delta,null,coalesce(pc.criado_por,'sistema'));
 return new;
end$$;
drop trigger if exists fin_compra_t on cmp_pedido_itens;
create trigger fin_compra_t after update of quantidade_recebida on cmp_pedido_itens for each row execute function fin_trg_compra();

create or replace function fin_trg_cmv() returns trigger language plpgsql as $$
declare v numeric;
begin
 if tg_table_name='exp_remessas' then
  select coalesce(sum(m.custo_total),0) into v from exp_remessa_itens ri join est_movimentos m on m.id=ri.movimento_id where ri.remessa_id=new.id;
  perform ctb_postar_evento('CMV_VENDA',new.id,current_date,v,'CMV remessa '||new.numero,null,new.criado_por);
 else
  select coalesce(custo_total,0) into v from est_movimentos where id=new.movimento_id;
  perform ctb_postar_evento('CMV_DEVOLUCAO',new.id,current_date,v,'Devolução de CMV #'||new.numero,null,new.criado_por);
 end if;
 return new;
end$$;
drop trigger if exists fin_cmv_remessa_t on exp_remessas;
create trigger fin_cmv_remessa_t after update of status on exp_remessas for each row when (new.status='FECHADA' and old.status is distinct from 'FECHADA') execute function fin_trg_cmv();
drop trigger if exists fin_cmv_dev_t on exp_devolucoes;
create trigger fin_cmv_dev_t after insert on exp_devolucoes for each row execute function fin_trg_cmv();

create or replace function fin_conciliar(p_extrato uuid,p_titulo uuid,p_ator text) returns uuid language plpgsql as $$
declare e fin_extratos%rowtype;t fin_titulos%rowtype;
begin
 select * into strict e from fin_extratos where id=p_extrato for update;
 select * into strict t from fin_titulos where id=p_titulo;
 if e.baixa_id is not null then raise exception 'Linha do extrato já conciliada';end if;
 if (e.valor>0 and t.tipo<>'RECEBER') or (e.valor<0 and t.tipo<>'PAGAR') then raise exception 'Sentido do extrato não confere com o tipo do título';end if;
 return fin_baixar(p_titulo,e.conta_id,e.data,abs(e.valor),p_extrato,p_ator);
end$$;

-- ---------------------------------------------------------------- Relatórios
create or replace function fin_saldo_caixa(p_data date) returns numeric language sql stable as $$
 select coalesce((select sum(saldo_inicial) from fin_contas_bancarias where ativo and saldo_inicial_data<=p_data),0)
  +coalesce((select sum(case when (t.tipo='RECEBER')<>(b.estorno_de is not null) then b.valor else -b.valor end)
    from fin_baixas b join fin_titulos t on t.id=b.titulo_id join fin_contas_bancarias c on c.id=b.conta_id where b.data<=p_data and b.data>=c.saldo_inicial_data),0)
$$;
create or replace function fin_fluxo(p_ini date,p_dias int) returns table(dia date,entradas numeric,saidas numeric,saldo_dia numeric,saldo_acum numeric) language sql stable as $$
 with dias as (select generate_series(p_ini,p_ini+(p_dias-1),interval '1 day')::date dia),
 m as (select greatest(vencimento,p_ini) dia,sum(case when tipo='RECEBER' then valor-valor_baixado else 0 end) e,sum(case when tipo='PAGAR' then valor-valor_baixado else 0 end) s
       from fin_titulos where status in('ABERTO','PARCIAL') and vencimento<=p_ini+(p_dias-1) group by 1)
 select d.dia,coalesce(m.e,0),coalesce(m.s,0),coalesce(m.e,0)-coalesce(m.s,0),
  fin_saldo_caixa(p_ini)+sum(coalesce(m.e,0)-coalesce(m.s,0)) over (order by d.dia)
 from dias d left join m on m.dia=d.dia order by d.dia
$$;
create or replace function ctb_balancete(p_ini date,p_fim date) returns table(codigo text,nome text,tipo text,saldo_anterior numeric,debitos numeric,creditos numeric,saldo_final numeric) language sql stable as $$
 select c.codigo::text,c.nome::text,c.tipo::text,
  coalesce(sum(case when l.data<p_ini then p.debito-p.credito end),0),
  coalesce(sum(case when l.data between p_ini and p_fim then p.debito end),0),
  coalesce(sum(case when l.data between p_ini and p_fim then p.credito end),0),
  coalesce(sum(case when l.data<=p_fim then p.debito-p.credito end),0)
 from ctb_contas c left join ctb_partidas p on p.conta_id=c.id left join ctb_lancamentos l on l.id=p.lancamento_id
 where c.analitica group by c.codigo,c.nome,c.tipo order by c.codigo
$$;
create or replace function ctb_dre(p_ini date,p_fim date) returns jsonb language sql stable as $$
 with x as (select c.codigo,c.nome,c.tipo,
   case when c.tipo='RECEITA' then coalesce(sum(p.credito-p.debito),0) else coalesce(sum(p.debito-p.credito),0) end valor
  from ctb_contas c join ctb_partidas p on p.conta_id=c.id join ctb_lancamentos l on l.id=p.lancamento_id
  where c.tipo in('RECEITA','CUSTO','DESPESA') and l.data between p_ini and p_fim group by c.codigo,c.nome,c.tipo)
 select jsonb_build_object('contas',coalesce((select jsonb_agg(to_jsonb(x) order by x.codigo) from x),'[]'::jsonb),
  'receita',coalesce((select sum(valor) from x where tipo='RECEITA'),0),'custo',coalesce((select sum(valor) from x where tipo='CUSTO'),0),'despesa',coalesce((select sum(valor) from x where tipo='DESPESA'),0),
  'resultado',coalesce((select sum(valor) from x where tipo='RECEITA'),0)-coalesce((select sum(valor) from x where tipo in('CUSTO','DESPESA')),0))
$$;
create or replace function ctb_razao(p_conta uuid,p_ini date,p_fim date) returns table(data date,numero bigint,historico text,debito numeric,credito numeric,saldo numeric) language sql stable as $$
 select l.data,l.numero,l.historico::text,p.debito,p.credito,
  coalesce((select sum(p2.debito-p2.credito) from ctb_partidas p2 join ctb_lancamentos l2 on l2.id=p2.lancamento_id where p2.conta_id=p_conta and l2.data<p_ini),0)
  +sum(p.debito-p.credito) over (order by l.data,l.numero,p.id)
 from ctb_partidas p join ctb_lancamentos l on l.id=p.lancamento_id where p.conta_id=p_conta and l.data between p_ini and p_fim order by l.data,l.numero,p.id
$$;
create or replace function ctb_orcado_realizado(p_ini text,p_fim text) returns table(centro text,conta text,orcado numeric,realizado numeric,variacao numeric) language sql stable as $$
 with o as (select centro_custo_id,conta_id,sum(valor_orcado) v from fin_orcamento where competencia between p_ini and p_fim group by 1,2),
 r as (select p.centro_custo_id,p.conta_id,sum(p.debito-p.credito) v from ctb_partidas p join ctb_lancamentos l on l.id=p.lancamento_id join ctb_contas c on c.id=p.conta_id
       where c.tipo in('CUSTO','DESPESA') and p.centro_custo_id is not null and l.competencia between p_ini and p_fim group by 1,2)
 select cc.codigo::text,(ct.codigo||' '||ct.nome)::text,coalesce(o.v,0),coalesce(r.v,0),coalesce(r.v,0)-coalesce(o.v,0)
 from o full join r on r.centro_custo_id=o.centro_custo_id and r.conta_id=o.conta_id
 join fin_centros_custo cc on cc.id=coalesce(o.centro_custo_id,r.centro_custo_id) join ctb_contas ct on ct.id=coalesce(o.conta_id,r.conta_id) order by 1,2
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-30_22_financeiro_contabil.sql','964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-30_22_financeiro_contabil.sql','964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 33_2026-10-31_23_manutencao_documentos.up.sql
-- GERADO do arquivo canônico 2026-10-31_23_manutencao_documentos.sql; SHA256 89c1af7ff48562b99ada6ee34925df0583f5688abc8273773291cdef89b6c5a8
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-30_22_financeiro_contabil.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-31_23_manutencao_documentos.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-10-31_23_manutencao_documentos.sql' and checksum<>'89c1af7ff48562b99ada6ee34925df0583f5688abc8273773291cdef89b6c5a8') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Manutenção
create table if not exists mnt_ativos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(40) not null unique, nome varchar(160) not null, processo varchar(80) not null default '',
 centro_id uuid references pcp_capacidades_maquina(id) on delete set null,
 criticidade varchar(5) not null default 'MEDIA' check(criticidade in('BAIXA','MEDIA','ALTA')),
 ativo boolean not null default true, criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_mnt_ativo_centro on mnt_ativos(centro_id) where centro_id is not null;
create table if not exists mnt_planos(
 id uuid primary key default gen_random_uuid(),
 ativo_id uuid not null references mnt_ativos(id) on delete cascade, descricao varchar(300) not null,
 periodicidade_dias integer not null check(periodicidade_dias>0), ultima_execucao date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists mnt_ordens(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 ativo_id uuid not null references mnt_ativos(id),
 tipo varchar(10) not null check(tipo in('PREVENTIVA','CORRETIVA')),
 origem varchar(6) not null check(origem in('ANDON','PLANO','MANUAL')),
 andon_id uuid unique references pcp_andon(id) on delete set null,
 plano_id uuid references mnt_planos(id) on delete set null,
 status varchar(11) not null default 'ABERTA' check(status in('ABERTA','EM_EXECUCAO','CONCLUIDA','CANCELADA')),
 prioridade varchar(7) not null default 'MEDIA' check(prioridade in('MEDIA','ALTA','CRITICA')),
 descricao text not null default '', causa text not null default '', solucao text not null default '', responsavel varchar(160) not null default '',
 aberta_em timestamptz not null default now(), iniciada_em timestamptz, concluida_em timestamptz,
 criado_por varchar(160) not null, check(concluida_em is null or concluida_em>=aberta_em)
);
create unique index if not exists ux_mnt_plano_aberto on mnt_ordens(plano_id) where plano_id is not null and status in('ABERTA','EM_EXECUCAO');
create index if not exists ix_mnt_ordens_ativo on mnt_ordens(ativo_id,status);
create table if not exists mnt_paradas(
 id uuid primary key default gen_random_uuid(),
 ativo_id uuid not null references mnt_ativos(id), andon_id uuid unique references pcp_andon(id) on delete set null, ordem_id uuid references mnt_ordens(id),
 inicio timestamptz not null default now(), fim timestamptz, motivo varchar(120) not null default '',
 check(fim is null or fim>=inicio)
);
create table if not exists mnt_pecas(
 id bigserial primary key, ordem_id uuid not null references mnt_ordens(id), produto_id uuid not null references est_produtos(id),
 local_id uuid not null references est_locais(id), quantidade numeric(16,3) not null check(quantidade>0), movimento_id bigint references est_movimentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create or replace function mnt_ativo_da_andon(p_operacao uuid,p_processo text) returns uuid language plpgsql stable as $$
declare v_centro uuid;v_id uuid;n int;
begin
 if p_operacao is not null then
  select nullif(roteiro_snapshot->>'centro_id','')::uuid into v_centro from pcp_operacoes where id=p_operacao;
  if v_centro is not null then select id into v_id from mnt_ativos where centro_id=v_centro and ativo;if v_id is not null then return v_id;end if;end if;
 end if;
 select count(*) into n from mnt_ativos where ativo and processo<>'' and upper(processo)=upper(coalesce(p_processo,''));
 if n=1 then select id into v_id from mnt_ativos where ativo and upper(processo)=upper(p_processo);return v_id;end if;
 return null;
end$$;

-- Andon de máquina parada/manutenção abre (ou reaproveita) a ordem corretiva e registra a parada.
create or replace function mnt_trg_andon() returns trigger language plpgsql as $$
declare v_ativo uuid;v_ordem uuid;
begin
 v_ativo=mnt_ativo_da_andon(new.operacao_id,new.processo);
 if v_ativo is null then return new;end if;
 select id into v_ordem from mnt_ordens where ativo_id=v_ativo and tipo='CORRETIVA' and status in('ABERTA','EM_EXECUCAO') order by aberta_em limit 1;
 if v_ordem is null then
  insert into mnt_ordens(ativo_id,tipo,origem,andon_id,prioridade,descricao,criado_por)
  values(v_ativo,'CORRETIVA','ANDON',new.id,case when new.prioridade in('ALTA','CRITICA') then new.prioridade else 'MEDIA' end,left(new.motivo||coalesce(': '||nullif(new.observacao,''),''),1000),coalesce(nullif(new.usuario_abertura,''),'andon')) returning id into v_ordem;
 end if;
 insert into mnt_paradas(ativo_id,andon_id,ordem_id,inicio,motivo) values(v_ativo,new.id,v_ordem,new.criado_em,new.motivo) on conflict(andon_id) do nothing;
 return new;
end$$;
drop trigger if exists mnt_andon_t on pcp_andon;
create trigger mnt_andon_t after insert on pcp_andon for each row when (new.motivo in('Máquina parada','Manutenção')) execute function mnt_trg_andon();
create or replace function mnt_trg_andon_fim() returns trigger language plpgsql as $$
begin
 update mnt_paradas set fim=greatest(inicio,coalesce(new.resolvido_em,now())) where andon_id=new.id and fim is null;
 return new;
end$$;
drop trigger if exists mnt_andon_fim_t on pcp_andon;
create trigger mnt_andon_fim_t after update of status on pcp_andon for each row when (new.status='RESOLVIDO' and old.status is distinct from 'RESOLVIDO') execute function mnt_trg_andon_fim();

create or replace function mnt_iniciar(p_ordem uuid,p_ator text) returns void language plpgsql as $$
begin
 update mnt_ordens set status='EM_EXECUCAO',iniciada_em=now(),responsavel=case when responsavel='' then p_ator else responsavel end where id=p_ordem and status='ABERTA';
 if not found then raise exception 'Somente ordem aberta pode ser iniciada';end if;
end$$;
create or replace function mnt_concluir(p_ordem uuid,p_causa text,p_solucao text,p_ator text) returns void language plpgsql as $$
declare o mnt_ordens%rowtype;
begin
 select * into strict o from mnt_ordens where id=p_ordem for update;
 if o.status not in('ABERTA','EM_EXECUCAO') then raise exception 'Ordem % não pode ser concluída',o.status;end if;
 if o.tipo='CORRETIVA' and (length(trim(coalesce(p_solucao,'')))<5 or length(trim(coalesce(p_causa,'')))<3) then raise exception 'Informe causa e solução da corretiva';end if;
 update mnt_ordens set status='CONCLUIDA',concluida_em=now(),causa=coalesce(p_causa,''),solucao=coalesce(p_solucao,''),iniciada_em=coalesce(iniciada_em,now()),responsavel=case when responsavel='' then p_ator else responsavel end where id=p_ordem;
 update mnt_paradas set fim=now() where ordem_id=p_ordem and fim is null;
 if o.plano_id is not null then update mnt_planos set ultima_execucao=current_date where id=o.plano_id;end if;
end$$;
create or replace function mnt_cancelar(p_ordem uuid,p_ator text) returns void language plpgsql as $$
begin
 update mnt_ordens set status='CANCELADA' where id=p_ordem and status in('ABERTA','EM_EXECUCAO');
 if not found then raise exception 'Somente ordem em aberto pode ser cancelada';end if;
end$$;
create or replace function mnt_consumir_peca(p_ordem uuid,p_prod uuid,p_local uuid,p_qtd numeric,p_ator text) returns bigint language plpgsql as $$
declare o mnt_ordens%rowtype;v_mov bigint;
begin
 select * into strict o from mnt_ordens where id=p_ordem for update;
 if o.status not in('ABERTA','EM_EXECUCAO') then raise exception 'Ordem % não aceita peças',o.status;end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 v_mov=cmp_mov_estoque('SAIDA',p_prod,p_local,p_qtd,'OM '||o.numero,'MANUTENCAO',round(coalesce(exp_custo_medio(p_prod,p_local),0)*p_qtd,6),p_ator);
 insert into mnt_pecas(ordem_id,produto_id,local_id,quantidade,movimento_id,criado_por) values(p_ordem,p_prod,p_local,p_qtd,v_mov,p_ator);
 return v_mov;
end$$;
create or replace function mnt_gerar_preventivas(p_data date,p_ator text) returns integer language plpgsql as $$
declare p record;n int:=0;v uuid;
begin
 for p in select pl.*,a.codigo from mnt_planos pl join mnt_ativos a on a.id=pl.ativo_id where pl.ativo and a.ativo and coalesce(pl.ultima_execucao,pl.criado_em::date)+pl.periodicidade_dias<=p_data
   and not exists(select 1 from mnt_ordens o where o.plano_id=pl.id and o.status in('ABERTA','EM_EXECUCAO')) loop
  insert into mnt_ordens(ativo_id,tipo,origem,plano_id,descricao,criado_por) values(p.ativo_id,'PREVENTIVA','PLANO',p.id,p.descricao,p_ator) on conflict do nothing returning id into v;
  if v is not null then n=n+1;end if;
 end loop;
 return n;
end$$;
-- MTBF/MTTR sobre tempo de calendário (não desconta turnos/feriados); falhas = ordens corretivas abertas no período.
create or replace function mnt_indicadores(p_ini timestamptz,p_fim timestamptz) returns table(ativo text,falhas bigint,downtime_h numeric,mttr_h numeric,mtbf_h numeric) language sql stable as $$
 select a.codigo::text,
  (select count(*) from mnt_ordens o where o.ativo_id=a.id and o.tipo='CORRETIVA' and o.status<>'CANCELADA' and o.aberta_em>=p_ini and o.aberta_em<p_fim),
  coalesce((select sum(extract(epoch from least(coalesce(pa.fim,p_fim),p_fim)-greatest(pa.inicio,p_ini))/3600) from mnt_paradas pa where pa.ativo_id=a.id and pa.inicio<p_fim and coalesce(pa.fim,p_fim)>p_ini),0)::numeric,
  (select avg(extract(epoch from o.concluida_em-o.aberta_em)/3600) from mnt_ordens o where o.ativo_id=a.id and o.tipo='CORRETIVA' and o.status='CONCLUIDA' and o.aberta_em>=p_ini and o.aberta_em<p_fim)::numeric,
  case when (select count(*) from mnt_ordens o where o.ativo_id=a.id and o.tipo='CORRETIVA' and o.status<>'CANCELADA' and o.aberta_em>=p_ini and o.aberta_em<p_fim)>0
   then ((extract(epoch from p_fim-p_ini)/3600)-coalesce((select sum(extract(epoch from least(coalesce(pa.fim,p_fim),p_fim)-greatest(pa.inicio,p_ini))/3600) from mnt_paradas pa where pa.ativo_id=a.id and pa.inicio<p_fim and coalesce(pa.fim,p_fim)>p_ini),0))
    /(select count(*) from mnt_ordens o where o.ativo_id=a.id and o.tipo='CORRETIVA' and o.status<>'CANCELADA' and o.aberta_em>=p_ini and o.aberta_em<p_fim) end::numeric
 from mnt_ativos a where a.ativo order by a.codigo
$$;

-- ---------------------------------------------------------------- Documentos controlados
create table if not exists doc_documentos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(40) not null unique, titulo varchar(240) not null,
 tipo varchar(12) not null default 'INSTRUCAO' check(tipo in('PROCEDIMENTO','INSTRUCAO','DESENHO','OUTRO')),
 ativo boolean not null default true, criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists doc_versoes(
 id uuid primary key default gen_random_uuid(),
 documento_id uuid not null references doc_documentos(id) on delete cascade, versao integer not null check(versao>0),
 status varchar(12) not null default 'RASCUNHO' check(status in('RASCUNHO','EM_APROVACAO','APROVADA','OBSOLETA')),
 conteudo text not null default '', anexo_url varchar(500) not null default '', resumo_alteracao text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 enviado_por varchar(160), enviado_em timestamptz, aprovado_por varchar(160), aprovado_em timestamptz, vigencia_inicio date,
 unique(documento_id,versao)
);
create unique index if not exists ux_doc_aprovada on doc_versoes(documento_id) where status='APROVADA';
create table if not exists doc_vinculos(
 id uuid primary key default gen_random_uuid(),
 documento_id uuid not null references doc_documentos(id) on delete cascade,
 processo varchar(80) not null default '', produto_codigo varchar(60) not null default '',
 check(processo<>'' or produto_codigo<>''), unique(documento_id,processo,produto_codigo)
);
create table if not exists doc_leituras(
 versao_id uuid not null references doc_versoes(id) on delete cascade, usuario varchar(160) not null, em timestamptz not null default now(), primary key(versao_id,usuario)
);
create or replace function doc_versao_protegida() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then if old.status<>'RASCUNHO' then raise exception 'Versão emitida não pode ser apagada';end if;return old;end if;
 if old.status in('APROVADA','OBSOLETA') and (new.conteudo is distinct from old.conteudo or new.anexo_url is distinct from old.anexo_url or new.versao is distinct from old.versao or new.documento_id is distinct from old.documento_id) then
  raise exception 'Versão aprovada é imutável: crie uma nova versão';end if;
 if old.status='EM_APROVACAO' and (new.conteudo is distinct from old.conteudo or new.anexo_url is distinct from old.anexo_url) then raise exception 'Versão em aprovação não pode ser editada';end if;
 if new.status is distinct from old.status and not ((old.status='RASCUNHO' and new.status='EM_APROVACAO') or (old.status='EM_APROVACAO' and new.status in('RASCUNHO','APROVADA')) or (old.status='APROVADA' and new.status='OBSOLETA')) then
  raise exception 'Transição inválida: % -> %',old.status,new.status;end if;
 return new;
end$$;
drop trigger if exists doc_versao_protegida_t on doc_versoes;
create trigger doc_versao_protegida_t before update or delete on doc_versoes for each row execute function doc_versao_protegida();

create or replace function doc_nova_versao(p_doc uuid,p_conteudo text,p_anexo text,p_resumo text,p_ator text) returns uuid language plpgsql as $$
declare v_num int;v_id uuid;ult doc_versoes%rowtype;
begin
 if exists(select 1 from doc_versoes where documento_id=p_doc and status in('RASCUNHO','EM_APROVACAO')) then raise exception 'Já existe versão em elaboração/aprovação';end if;
 select * into ult from doc_versoes where documento_id=p_doc order by versao desc limit 1;
 v_num=coalesce(ult.versao,0)+1;
 insert into doc_versoes(documento_id,versao,conteudo,anexo_url,resumo_alteracao,criado_por)
 values(p_doc,v_num,coalesce(p_conteudo,ult.conteudo,''),coalesce(p_anexo,ult.anexo_url,''),coalesce(p_resumo,''),p_ator) returning id into v_id;
 return v_id;
end$$;
create or replace function doc_enviar(p_versao uuid,p_ator text) returns void language plpgsql as $$
begin
 update doc_versoes set status='EM_APROVACAO',enviado_por=p_ator,enviado_em=now() where id=p_versao and status='RASCUNHO' and (length(trim(conteudo))>0 or anexo_url<>'');
 if not found then raise exception 'Somente rascunho com conteúdo ou anexo pode ser enviado';end if;
end$$;
create or replace function doc_aprovar(p_versao uuid,p_ator text,p_gerente boolean) returns void language plpgsql as $$
declare v doc_versoes%rowtype;
begin
 select * into strict v from doc_versoes where id=p_versao for update;
 if v.status<>'EM_APROVACAO' then raise exception 'Versão não está em aprovação';end if;
 if v.criado_por=p_ator and not p_gerente then raise exception 'Quem elaborou a versão não pode aprová-la';end if;
 update doc_versoes set status='OBSOLETA' where documento_id=v.documento_id and status='APROVADA';
 update doc_versoes set status='APROVADA',aprovado_por=p_ator,aprovado_em=now(),vigencia_inicio=current_date where id=p_versao;
end$$;
create or replace function doc_reprovar(p_versao uuid,p_ator text) returns void language plpgsql as $$
begin
 update doc_versoes set status='RASCUNHO' where id=p_versao and status='EM_APROVACAO';
 if not found then raise exception 'Versão não está em aprovação';end if;
end$$;
-- Documentos aprovados vinculados ao setor da operação ou ao produto dela.
create or replace function doc_da_operacao(p_operacao uuid) returns table(documento_id uuid,codigo text,titulo text,tipo text,versao_id uuid,versao int,conteudo text,anexo_url text,vigencia_inicio date) language sql stable as $$
 select d.id,d.codigo::text,d.titulo::text,d.tipo::text,v.id,v.versao,v.conteudo,v.anexo_url::text,v.vigencia_inicio
 from pcp_operacoes o join pcp_produtos pr on pr.id=o.produto_id
 join doc_vinculos l on (l.processo<>'' and upper(l.processo)=upper(o.processo) and (l.produto_codigo='' or l.produto_codigo=pr.produto)) or (l.processo='' and l.produto_codigo=pr.produto)
 join doc_documentos d on d.id=l.documento_id and d.ativo join doc_versoes v on v.documento_id=d.id and v.status='APROVADA'
 where o.id=p_operacao group by d.id,d.codigo,d.titulo,d.tipo,v.id,v.versao,v.conteudo,v.anexo_url,v.vigencia_inicio order by d.tipo,d.codigo
$$;

-- ---------------------------------------------------------------- Qualificação por posto
create table if not exists qlf_config(singleton boolean primary key default true check(singleton), ativa boolean not null default false, atualizado_por varchar(160) not null default '', atualizado_em timestamptz not null default now());
insert into qlf_config(singleton) values(true) on conflict do nothing;
create table if not exists qlf_requisitos(processo varchar(80) primary key, criado_por varchar(160) not null, criado_em timestamptz not null default now());
create table if not exists qlf_qualificacoes(
 id uuid primary key default gen_random_uuid(),
 usuario varchar(160) not null, processo varchar(80) not null, nivel varchar(9) not null check(nivel in('APRENDIZ','OPERADOR','INSTRUTOR')),
 validade date, treinamento_versao_id uuid references doc_versoes(id),
 concedido_por varchar(160) not null, concedido_em timestamptz not null default now(), revogado_em timestamptz, revogado_por varchar(160)
);
create unique index if not exists ux_qlf_ativa on qlf_qualificacoes(lower(usuario),upper(processo)) where revogado_em is null;
create or replace function qlf_pode_apontar(p_usuario text,p_processo text,p_data date) returns text language plpgsql stable as $$
declare q qlf_qualificacoes%rowtype;
begin
 if not coalesce((select ativa from qlf_config),false) then return null;end if;
 if coalesce(p_usuario,'')='' or coalesce(p_processo,'')='' then return null;end if;
 if not exists(select 1 from qlf_requisitos where upper(processo)=upper(p_processo)) then return null;end if;
 select * into q from qlf_qualificacoes where lower(usuario)=lower(p_usuario) and upper(processo)=upper(p_processo) and revogado_em is null;
 if not found then return 'sem qualificação para '||p_processo;end if;
 if q.nivel='APRENDIZ' then return 'qualificação de aprendiz não permite apontar em '||p_processo;end if;
 if q.validade is not null and q.validade<p_data then return 'qualificação vencida em '||to_char(q.validade,'DD/MM/YYYY');end if;
 return null;
end$$;
create or replace function qlf_trg_apontamento() returns trigger language plpgsql as $$
declare r text;
begin
 if new.estorno_de is not null then return new;end if;
 r=qlf_pode_apontar(new.usuario,new.processo,coalesce(new.data_producao,current_date));
 if r is not null then raise exception 'QUALIFICACAO: % (%)',r,new.usuario;end if;
 return new;
end$$;
drop trigger if exists qlf_apontamento_t on pcp_apontamentos;
create trigger qlf_apontamento_t before insert on pcp_apontamentos for each row execute function qlf_trg_apontamento();
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-31_23_manutencao_documentos.sql','89c1af7ff48562b99ada6ee34925df0583f5688abc8273773291cdef89b6c5a8',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-31_23_manutencao_documentos.sql','89c1af7ff48562b99ada6ee34925df0583f5688abc8273773291cdef89b6c5a8','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 34_2026-11-01_24_indicadores_integracoes.up.sql
-- GERADO do arquivo canônico 2026-11-01_24_indicadores_integracoes.sql; SHA256 4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-31_23_manutencao_documentos.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-01_24_indicadores_integracoes.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-01_24_indicadores_integracoes.sql' and checksum<>'4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Alertas proativos
create table if not exists sys_alertas(
 id uuid primary key default gen_random_uuid(),
 tipo varchar(20) not null check(tipo in ('OF_ATRASADA','RUPTURA','CALIBRACAO','CREDITO')),
 chave varchar(120) not null,
 severidade varchar(8) not null default 'MEDIA' check(severidade in ('BAIXA','MEDIA','ALTA')),
 mensagem text not null,
 link varchar(120) not null default '',
 criado_em timestamptz not null default now(),
 resolvido_em timestamptz
);
create unique index if not exists ux_sys_alertas_aberto on sys_alertas(tipo,chave) where resolvido_em is null;
create index if not exists ix_sys_alertas_aberto on sys_alertas(severidade,criado_em desc) where resolvido_em is null;

create or replace function sys_alertas_candidatos(p_hoje date) returns table(tipo text,chave text,severidade text,mensagem text,link text) language sql stable as $$
 select 'OF_ATRASADA','OF'||o.numero, case when p_hoje-o.prazo>7 then 'ALTA' else 'MEDIA' end,
  'OF '||o.numero||' atrasada '||(p_hoje-o.prazo)||' dia(s) (prazo '||to_char(o.prazo,'DD/MM/YYYY')||')','/ordens-fabricacao'
  from erp_ordens_fabricacao o where o.status in ('PLANEJADA','LIBERADA') and o.prazo<p_hoje
 union all
 select 'RUPTURA','P'||p.codigo,case when coalesce(s.disp,0)<=0 then 'ALTA' else 'MEDIA' end,
  'Estoque de '||p.codigo||' abaixo do mínimo ('||coalesce(s.disp,0)||' < '||p.estoque_minimo||')','/estoque'
  from est_produtos p left join lateral(select sum(fisico-reservado-bloqueado) disp from est_saldos where produto_id=p.id) s on true
  where p.ativo and p.estoque_minimo>0 and coalesce(s.disp,0)<p.estoque_minimo
 union all
 select 'CALIBRACAO','I'||i.codigo,case when i.calibracao_validade<p_hoje then 'ALTA' else 'MEDIA' end,
  case when i.calibracao_validade<p_hoje then 'Calibração VENCIDA: ' else 'Calibração vence em '||(i.calibracao_validade-p_hoje)||' dia(s): ' end||i.codigo,'/qualidade-inspecao'
  from qld_instrumentos i where i.ativo and i.calibracao_validade<=p_hoje+15
 union all
 select 'CREDITO','PV'||v.numero,'ALTA','Pedido de venda '||v.numero||' bloqueado por crédito (excedente R$ '||v.credito_excedente||')','/vendas'
  from crm_pedidos_venda v where v.bloqueio_credito and v.status='EM_APROVACAO'
$$;

create or replace function sys_emitir_evento(p_evento text,p_payload jsonb) returns integer language plpgsql as $$
declare v_n integer;
begin
 insert into sys_webhook_fila(webhook_id,evento,payload)
  select w.id,p_evento,p_payload from sys_webhooks w where w.ativo and p_evento=any(w.eventos);
 get diagnostics v_n=row_count;return v_n;
end$$;

create or replace function sys_gerar_alertas(p_hoje date) returns integer language plpgsql as $$
declare v_novos integer:=0;r record;
begin
 for r in select c.* from sys_alertas_candidatos(p_hoje) c
  where not exists(select 1 from sys_alertas a where a.tipo=c.tipo and a.chave=c.chave and a.resolvido_em is null)
 loop
  insert into sys_alertas(tipo,chave,severidade,mensagem,link) values(r.tipo,r.chave,r.severidade,r.mensagem,r.link);
  perform sys_emitir_evento('alerta.criado',jsonb_build_object('tipo',r.tipo,'chave',r.chave,'severidade',r.severidade,'mensagem',r.mensagem));
  v_novos:=v_novos+1;
 end loop;
 update sys_alertas a set resolvido_em=now() where a.resolvido_em is null
  and not exists(select 1 from sys_alertas_candidatos(p_hoje) c where c.tipo=a.tipo and c.chave=a.chave);
 return v_novos;
end$$;

-- ---------------------------------------------------------------- Tokens de API e webhooks
create table if not exists sys_tokens_api(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null,
 token_hash char(64) not null unique,
 prefixo varchar(10) not null,
 escopos text[] not null default array['leitura']::text[] check(escopos<@array['leitura','indicadores','alertas']::text[]),
 ativo boolean not null default true,
 expira_em timestamptz,
 ultimo_uso timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 revogado_por varchar(160), revogado_em timestamptz
);

create table if not exists sys_webhooks(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null,
 url varchar(500) not null check(url ~ '^https://'),
 segredo varchar(80) not null,
 eventos text[] not null check(array_length(eventos,1)>0 and eventos<@array['alerta.criado','pedido.status','remessa.entregue']::text[]),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create table if not exists sys_webhook_fila(
 id bigserial primary key,
 webhook_id uuid not null references sys_webhooks(id) on delete cascade,
 evento varchar(40) not null,
 payload jsonb not null,
 status varchar(10) not null default 'PENDENTE' check(status in ('PENDENTE','ENVIADO','FALHA')),
 tentativas integer not null default 0,
 proxima_em timestamptz not null default now(),
 ultimo_erro text not null default '',
 criado_em timestamptz not null default now(),
 enviado_em timestamptz
);
create index if not exists ix_sys_webhook_fila on sys_webhook_fila(status,proxima_em);

create or replace function sys_trg_evento_pedido() returns trigger language plpgsql as $$
begin
 if new.status is distinct from old.status then
  perform sys_emitir_evento('pedido.status',jsonb_build_object('numero',new.numero,'de',old.status,'para',new.status,'total',new.total));
 end if;
 return new;
end$$;
drop trigger if exists sys_trg_evento_pedido_t on crm_pedidos_venda;
create trigger sys_trg_evento_pedido_t after update of status on crm_pedidos_venda for each row execute function sys_trg_evento_pedido();

create or replace function sys_trg_evento_remessa() returns trigger language plpgsql as $$
begin
 if new.status='ENTREGUE' and old.status is distinct from 'ENTREGUE' then
  perform sys_emitir_evento('remessa.entregue',jsonb_build_object('numero',new.numero,'pedido_venda_id',new.pedido_venda_id,'entregue_em',new.entregue_em));
 end if;
 return new;
end$$;
drop trigger if exists sys_trg_evento_remessa_t on exp_remessas;
create trigger sys_trg_evento_remessa_t after update of status on exp_remessas for each row execute function sys_trg_evento_remessa();

-- ---------------------------------------------------------------- Painel de indicadores (somente leitura)
create or replace function ind_painel(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare
 v_otif jsonb;v_lead jsonb;v_giro jsonb;v_ppm jsonb;v_oee jsonb;v_com jsonb;v_cart jsonb;
 v_dias integer:=greatest(1,p_fim-p_ini+1);
 v_hoje date:=p_fim;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 -- OTIF: pedidos com entrega prevista no período; no prazo = última entrega <= data prevista; completo = entregue >= pedido
 with ped as(
  select v.id,v.data_entrega,
   (select coalesce(sum(quantidade),0) from crm_pedido_venda_itens i where i.pedido_id=v.id) qtd,
   (select coalesce(sum(ri.quantidade),0) from exp_remessa_itens ri join exp_remessas r on r.id=ri.remessa_id where r.pedido_venda_id=v.id and r.status='ENTREGUE') ent,
   (select max(r.entregue_em)::date from exp_remessas r where r.pedido_venda_id=v.id and r.status='ENTREGUE') ult
  from crm_pedidos_venda v where v.data_entrega between p_ini and p_fim and v.status not in ('RASCUNHO','EM_APROVACAO','CANCELADO')),
 f as(select *,(ult is not null and ult<=data_entrega) ot,(qtd>0 and ent>=qtd) inf from ped)
 select jsonb_build_object('pedidos',count(*),'noPrazo',count(*) filter(where ot),'completos',count(*) filter(where inf),
  'otif',count(*) filter(where ot and inf),'percentual',case when count(*)>0 then round(100.0*count(*) filter(where ot and inf)/count(*),1) end) into v_otif from f;
 select jsonb_build_object('ofsConcluidas',count(*),'leadTimeDias',round(avg(extract(epoch from concluido_em-liberado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where concluido_em::date<=prazo)) into v_lead
  from erp_ordens_fabricacao where status='CONCLUIDA' and liberado_em is not null and concluido_em::date between p_ini and p_fim;
 -- Giro (anualizado) = custo das saídas no período / valor atual em estoque
 with sai as(select coalesce(sum(custo_total),0) v from est_movimentos where tipo='SAIDA' and criado_em::date between p_ini and p_fim),
 est as(select coalesce(sum(s.fisico*coalesce(exp_custo_medio(s.produto_id,s.local_id),0)),0) v from est_saldos s)
 select jsonb_build_object('custoSaidas',round(sai.v,2),'valorEstoque',round(est.v,2),
  'giroAnualizado',case when est.v>0 then round(sai.v*365.0/v_dias/est.v,2) end) into v_giro from sai,est;
 select jsonb_build_object('inspecionado',coalesce(sum(quantidade),0),'bloqueado',coalesce(sum(qtd_bloqueada),0),
  'ppm',case when sum(quantidade)>0 then round(1000000*sum(qtd_bloqueada)/sum(quantidade)) end) into v_ppm
  from qld_lotes_inspecao where status in('APROVADO','REPROVADO','SUCATEADO','QUARENTENA') and criado_em::date between p_ini and p_fim;
 -- OEE parcial: disponibilidade (paradas registradas) x qualidade (refugo); desempenho não é medido
 with at as(select count(*) n from mnt_ativos where ativo),
 par as(select coalesce(sum(extract(epoch from least(coalesce(fim,(p_fim+1)::timestamptz),(p_fim+1)::timestamptz)-greatest(inicio,p_ini::timestamptz))/3600),0) h
   from mnt_paradas where inicio<(p_fim+1)::timestamptz and coalesce(fim,(p_fim+1)::timestamptz)>p_ini::timestamptz),
 ap as(select coalesce(sum(quantidade) filter(where tipo in('PRODUCAO','FINALIZACAO')),0) bom,coalesce(sum(quantidade) filter(where tipo='REFUGO'),0) ref
   from pcp_apontamentos where data_producao between p_ini and p_fim)
 select jsonb_build_object('disponibilidade',case when at.n>0 then round(greatest(0,1-par.h/(at.n*24.0*v_dias))::numeric,4) end,
  'qualidade',case when ap.bom+ap.ref>0 then round((ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'oeeParcial',case when at.n>0 and ap.bom+ap.ref>0 then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'observacao','Sem medição de desempenho (velocidade); OEE parcial = disponibilidade x qualidade') into v_oee from at,par,ap;
 select coalesce(jsonb_object_agg(status,v),'{}'::jsonb) into v_com from(select status,round(sum(valor),2) v from crm_comissoes where competencia between to_char(p_ini,'YYYY-MM') and to_char(p_fim,'YYYY-MM') group by status) x;
 select jsonb_build_object('pedidosAbertos',count(*),'saldoAFaturar',coalesce(round(sum(total-faturado_valor),2),0),
  'atrasados',count(*) filter(where data_entrega<v_hoje),'saldoAtrasado',coalesce(round(sum(total-faturado_valor) filter(where data_entrega<v_hoje),2),0)) into v_cart
  from crm_pedidos_venda where status in('APROVADO','EM_PRODUCAO','PARCIAL');
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'otif',v_otif,'leadTime',v_lead,'giro',v_giro,'ppm',v_ppm,'oee',v_oee,'comissoes',v_com,'carteira',v_cart);
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-01_24_indicadores_integracoes.sql','4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-01_24_indicadores_integracoes.sql','4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 35_2026-11-02_25_pendencias_producao_estoque_financeiro.up.sql
-- GERADO do arquivo canônico 2026-11-02_25_pendencias_producao_estoque_financeiro.sql; SHA256 ac30c4e94780e573ae53b25273fd8cadf3fbd290e40c03eaf53ab81f48e0e5f9
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-01_24_indicadores_integracoes.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-02_25_pendencias_producao_estoque_financeiro.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-02_25_pendencias_producao_estoque_financeiro.sql' and checksum<>'ac30c4e94780e573ae53b25273fd8cadf3fbd290e40c03eaf53ab81f48e0e5f9') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. Substitutos de componente
create table if not exists erp_substitutos(
 id uuid primary key default gen_random_uuid(),
 componente_id uuid not null references est_produtos(id) on delete cascade,
 substituto_id uuid not null references est_produtos(id) on delete cascade,
 fator numeric(12,6) not null default 1 check(fator>0),
 prioridade integer not null default 1 check(prioridade>0),
 motivo text not null default '',
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(componente_id<>substituto_id),
 unique(componente_id,substituto_id)
);
create table if not exists erp_of_substituicoes(
 id bigserial primary key,
 of_id uuid not null references erp_ordens_fabricacao(id) on delete cascade,
 apontamento_id bigint not null,
 componente_id uuid not null references est_produtos(id),
 substituto_id uuid not null references est_produtos(id),
 quantidade_original numeric(16,3) not null, quantidade_substituto numeric(16,3) not null, fator numeric(12,6) not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(apontamento_id,componente_id)
);
create index if not exists ix_erp_of_subst_of on erp_of_substituicoes(of_id);

-- Componentes em falta e o que os substitutos autorizados cobrem no depósito.
create or replace function erp_substitutos_disponibilidade(p_estrutura uuid,p_qtd numeric,p_local uuid)
returns table(componente_id uuid,componente text,falta numeric,substituto_id uuid,substituto text,fator numeric,livre numeric,cobre numeric)
language sql stable as $$
 select d.componente_id,d.codigo::text,d.falta,s.substituto_id,p.codigo::text,s.fator,
  coalesce(g.livre,0)::numeric,
  least(d.falta,floor(coalesce(g.livre,0)/s.fator*1000)/1000)::numeric
 from erp_disponibilidade_estrutura(p_estrutura,p_qtd,p_local) d
 join erp_substitutos s on s.componente_id=d.componente_id and s.ativo
 join est_produtos p on p.id=s.substituto_id and p.ativo
 left join lateral (select greatest(0,e.fisico-e.reservado-e.bloqueado) livre from est_saldos e where e.produto_id=s.substituto_id and e.local_id=p_local) g on true
 where d.situacao in('FALTA','GERA_OF_FILHA') and d.falta>0
 order by d.codigo,s.prioridade
$$;

-- Apontamento com componente substituto: payload.consumos[].substitutoId (somente pares autorizados em erp_substitutos).
create or replace function erp_ciclo_processar(p_ap bigint,p_ator text) returns bigint language plpgsql as $$
declare a pcp_apontamentos%rowtype;op pcp_operacoes%rowtype;o erp_ordens_fabricacao%rowtype;i jsonb;c jsonb;escolha jsonb;v_q numeric;v_consumida numeric;v_boas numeric;v_refugo numeric;v_total numeric;v_anterior numeric;v_lote uuid;v_mov bigint;v_saldo numeric;v_rest numeric;v_tomar numeric;v_local uuid;v_prod uuid;v_erro text;v_custo numeric;rec record;v_orig uuid;v_subst uuid;v_fator numeric;v_qorig numeric;v_resv numeric;v_fr boolean;
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
   v_orig=v_prod;v_qorig=v_q;v_subst=nullif(escolha->>'substitutoId','')::uuid;
   if v_subst is not null and v_q>0 then
    select s.fator into v_fator from erp_substitutos s where s.componente_id=v_orig and s.substituto_id=v_subst and s.ativo;
    if v_fator is null then raise exception 'SUBSTITUTO_INVALIDO: substituto não autorizado para este componente';end if;
    select u.fracionavel into strict v_fr from est_produtos p join est_unidades u on u.codigo=p.unidade_base where p.id=v_subst and p.ativo;
    v_q=case when v_fr then ceil(v_qorig*v_fator*1000)/1000 else ceil(v_qorig*v_fator) end;
    -- a reserva do componente original é liberada; o substituto é baixado no lugar
    select greatest(0,coalesce(sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' or (tipo='SAIDA' and baixa_reserva) then -quantidade_base else 0 end),0)) into v_resv from est_movimentos where of_id=o.id and produto_id=v_orig and local_origem_id=coalesce((escolha->>'localId')::uuid,o.local_id);
    if v_resv>0 then perform erp_ciclo_mov('LIBERA_RESERVA',v_orig,coalesce((escolha->>'localId')::uuid,o.local_id),least(v_resv,v_qorig),o.id,op.id,a.id,null,'S:'||a.id||':'||v_orig,p_ator);end if;
    insert into erp_of_substituicoes(of_id,apontamento_id,componente_id,substituto_id,quantidade_original,quantidade_substituto,fator,criado_por) values(o.id,a.id,v_orig,v_subst,v_qorig,v_q,v_fator,p_ator) on conflict do nothing;
    v_prod=v_subst;
   end if;
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

-- ================================================================ B. OF do pedido com um clique
create table if not exists crm_pedido_venda_of(
 pedido_id uuid not null references crm_pedidos_venda(id) on delete cascade,
 linha integer not null,
 of_id uuid not null references erp_ordens_fabricacao(id),
 quantidade numeric(16,3) not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(pedido_id,linha,of_id)
);
create index if not exists ix_pv_of_of on crm_pedido_venda_of(of_id);

create or replace function erp_gerar_ofs_pedido(p_pedido uuid,p_emp uuid,p_fil uuid,p_local uuid,p_ator text)
returns table(linha integer,item_codigo text,of_id uuid,quantidade numeric,resultado text)
language plpgsql as $$
declare pv crm_pedidos_venda%rowtype;r record;v_of uuid;v_prazo date;v_ja numeric;
begin
 select * into strict pv from crm_pedidos_venda where id=p_pedido for update;
 if pv.status not in('APROVADO','EM_PRODUCAO','PARCIAL') then raise exception 'Pedido precisa estar aprovado para gerar OF (status %)',pv.status;end if;
 for r in select * from erp_necessidade_pedido(p_pedido) n where n.situacao='PRODUZIR' and n.falta_producao>0 order by n.linha loop
  select coalesce(sum(l.quantidade),0) into v_ja from crm_pedido_venda_of l join erp_ordens_fabricacao o on o.id=l.of_id where l.pedido_id=p_pedido and l.linha=r.linha and o.status<>'CANCELADA';
  linha:=r.linha;item_codigo:=r.item_codigo;of_id:=null;quantidade:=r.falta_producao-v_ja;
  if quantidade<=0 then resultado:='JA_GERADA';return next;continue;end if;
  select coalesce(i.data_entrega,pv.data_entrega) into v_prazo from crm_pedido_venda_itens i where i.pedido_id=p_pedido and i.linha=r.linha;
  if v_prazo is null then resultado:='ERRO: informe a data de entrega do pedido ou do item';return next;continue;end if;
  begin
   v_of=erp_mrp_gerar_of(p_emp,p_fil,r.produto_id,quantidade,v_prazo,p_local,p_ator);
   insert into crm_pedido_venda_of(pedido_id,linha,of_id,quantidade,criado_por) values(p_pedido,r.linha,v_of,quantidade,p_ator);
   of_id:=v_of;resultado:='GERADA';
  exception when others then of_id:=null;resultado:='ERRO: '||left(sqlerrm,200);
  end;
  return next;
 end loop;
 if pv.status='APROVADO' and exists(select 1 from crm_pedido_venda_of where pedido_id=p_pedido) then
  update crm_pedidos_venda set status='EM_PRODUCAO',atualizado_em=now(),atualizado_por=p_ator where id=p_pedido;
  insert into crm_pedido_venda_historico(pedido_id,evento,de,para,usuario,detalhe) values(p_pedido,'OF_GERADAS','APROVADO','EM_PRODUCAO',p_ator,'{}'::jsonb);
 end if;
end$$;

-- ================================================================ C. Custo de retrabalho e de conversão do refugo
create table if not exists cst_retrabalho(
 id uuid primary key default gen_random_uuid(),
 of_id uuid not null references erp_ordens_fabricacao(id) on delete cascade,
 processo varchar(80) not null default '',
 quantidade numeric(16,3) not null check(quantidade>0),
 minutos numeric(12,2) not null default 0 check(minutos>=0),
 material numeric(16,2) not null default 0 check(material>=0),
 centro_id uuid references pcp_capacidades_maquina(id),
 valor numeric(16,2) not null check(valor>=0),
 motivo text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_cst_retrabalho_of on cst_retrabalho(of_id);

create or replace function cst_registrar_retrabalho(p_of uuid,p_processo text,p_qtd numeric,p_minutos numeric,p_material numeric,p_centro uuid,p_motivo text,p_ator text) returns uuid language plpgsql as $$
declare t record;v_valor numeric;v_id uuid;
begin
 perform 1 from erp_ordens_fabricacao where id=p_of;if not found then raise exception 'OF inexistente';end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo do retrabalho';end if;
 select * into t from cst_taxa(p_centro,current_date);
 v_valor=round(coalesce(p_minutos,0)/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100)+coalesce(p_material,0),2);
 insert into cst_retrabalho(of_id,processo,quantidade,minutos,material,centro_id,valor,motivo,criado_por) values(p_of,left(coalesce(p_processo,''),80),p_qtd,coalesce(p_minutos,0),coalesce(p_material,0),p_centro,v_valor,trim(p_motivo),p_ator) returning id into v_id;
 return v_id;
end$$;

-- Análise de custo da OF ampliada: acrescenta retrabalho e a conversão (mão de obra, máquina e GG) perdida no refugo.
create or replace function cst_of_analise_ext(p_of uuid) returns jsonb language plpgsql stable as $$
declare a jsonb;o erp_ordens_fabricacao%rowtype;v_ret numeric;v_conv numeric:=0;v_acum numeric:=0;op record;t record;v_unit numeric;v_ref numeric;v_data date;v_det jsonb:='[]'::jsonb;
begin
 a=cst_of_analise(p_of);
 select * into strict o from erp_ordens_fabricacao where id=p_of;
 v_data=o.criado_em::date;
 select coalesce(sum(valor),0) into v_ret from cst_retrabalho where of_id=p_of;
 for op in select po.id,po.processo,po.sequencia,po.roteiro_snapshot rs,po.quantidade_refugo from pcp_operacoes po where po.of_id=p_of order by po.sequencia loop
  select * into t from cst_taxa(nullif(op.rs->>'centro_id','')::uuid,v_data);
  v_unit=coalesce((op.rs->>'ciclo')::numeric,0)/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100);
  v_acum=v_acum+v_unit;
  v_ref=coalesce(op.quantidade_refugo,0)*v_acum;
  if v_ref>0 then v_conv=v_conv+v_ref;v_det=v_det||jsonb_build_object('processo',op.processo,'refugo',op.quantidade_refugo,'custo_conversao',round(v_ref,2));end if;
 end loop;
 return jsonb_set(jsonb_set(a,'{retrabalho}',jsonb_build_object('valor',round(v_ret,2),'registros',(select coalesce(jsonb_agg(jsonb_build_object('processo',processo,'quantidade',quantidade,'minutos',minutos,'material',material,'valor',valor,'motivo',motivo) order by criado_em),'[]'::jsonb) from cst_retrabalho where of_id=p_of))),
  '{refugo_conversao}',jsonb_build_object('valor',round(v_conv,2),'detalhe',v_det));
end$$;

-- ================================================================ D. Endereçamento (rua/prateleira/nível) dentro do depósito
create table if not exists est_enderecos(
 id uuid primary key default gen_random_uuid(),
 local_id uuid not null references est_locais(id) on delete restrict,
 codigo varchar(40) not null,
 descricao varchar(160) not null default '',
 capacidade numeric(16,3) check(capacidade is null or capacidade>0),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(local_id,codigo)
);
create table if not exists est_endereco_saldos(
 endereco_id uuid not null references est_enderecos(id) on delete cascade,
 produto_id uuid not null references est_produtos(id) on delete restrict,
 quantidade numeric(16,3) not null default 0 check(quantidade>=0),
 atualizado_em timestamptz not null default now(),
 primary key(endereco_id,produto_id)
);
create table if not exists est_endereco_movs(
 id bigserial primary key,
 produto_id uuid not null references est_produtos(id),
 de_id uuid references est_enderecos(id), para_id uuid references est_enderecos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(de_id is not null or para_id is not null)
);

-- Movimenta entre endereços (ou aloca/retira). O endereçado nunca passa do saldo físico do depósito.
create or replace function est_endereco_mover(p_prod uuid,p_de uuid,p_para uuid,p_qtd numeric,p_ator text) returns bigint language plpgsql as $$
declare v_local uuid;v_fisico numeric;v_end numeric;v_atual numeric;v_cap numeric;v_ocup numeric;v_id bigint;
begin
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 if p_de is null and p_para is null then raise exception 'Informe o endereço de origem ou de destino';end if;
 if p_de is not distinct from p_para then raise exception 'Origem e destino iguais';end if;
 if p_de is not null then
  select local_id into strict v_local from est_enderecos where id=p_de;
  select quantidade into v_atual from est_endereco_saldos where endereco_id=p_de and produto_id=p_prod for update;
  if coalesce(v_atual,0)<p_qtd then raise exception 'SALDO_INSUFICIENTE: endereço de origem tem %',coalesce(v_atual,0);end if;
 end if;
 if p_para is not null then
  select local_id,capacidade into strict v_local,v_cap from est_enderecos where id=p_para and ativo;
  if p_de is not null and (select local_id from est_enderecos where id=p_de)<>v_local then raise exception 'Endereços de depósitos diferentes: use transferência de estoque';end if;
  select coalesce(sum(quantidade),0) into v_ocup from est_endereco_saldos where endereco_id=p_para;
  if v_cap is not null and v_ocup+p_qtd>v_cap then raise exception 'Capacidade do endereço excedida (% de %)',v_ocup+p_qtd,v_cap;end if;
 end if;
 if p_de is null then
  select coalesce(fisico,0) into v_fisico from est_saldos where produto_id=p_prod and local_id=v_local;
  select coalesce(sum(s.quantidade),0) into v_end from est_endereco_saldos s join est_enderecos e on e.id=s.endereco_id where s.produto_id=p_prod and e.local_id=v_local;
  if v_end+p_qtd>coalesce(v_fisico,0) then raise exception 'Endereçado (%) passaria do saldo físico do depósito (%)',v_end+p_qtd,coalesce(v_fisico,0);end if;
 end if;
 if p_de is not null then update est_endereco_saldos set quantidade=quantidade-p_qtd,atualizado_em=now() where endereco_id=p_de and produto_id=p_prod;delete from est_endereco_saldos where endereco_id=p_de and produto_id=p_prod and quantidade=0;end if;
 if p_para is not null then insert into est_endereco_saldos(endereco_id,produto_id,quantidade) values(p_para,p_prod,p_qtd) on conflict(endereco_id,produto_id) do update set quantidade=est_endereco_saldos.quantidade+excluded.quantidade,atualizado_em=now();end if;
 insert into est_endereco_movs(produto_id,de_id,para_id,quantidade,criado_por) values(p_prod,p_de,p_para,p_qtd,p_ator) returning id into v_id;
 return v_id;
end$$;

create or replace view est_v_pendente_enderecar as
 select s.produto_id,p.codigo,p.descricao,s.local_id,l.codigo deposito,s.fisico,
  coalesce((select sum(es.quantidade) from est_endereco_saldos es join est_enderecos e on e.id=es.endereco_id where es.produto_id=s.produto_id and e.local_id=s.local_id),0) enderecado,
  s.fisico-coalesce((select sum(es.quantidade) from est_endereco_saldos es join est_enderecos e on e.id=es.endereco_id where es.produto_id=s.produto_id and e.local_id=s.local_id),0) pendente
 from est_saldos s join est_produtos p on p.id=s.produto_id join est_locais l on l.id=s.local_id where s.fisico>0;

-- ================================================================ E. Inventário cíclico por curva ABC
create table if not exists est_ciclico_regras(
 classe char(1) primary key check(classe in('A','B','C')),
 frequencia_dias integer not null check(frequencia_dias>0)
);
insert into est_ciclico_regras(classe,frequencia_dias) values('A',30),('B',90),('C',180) on conflict do nothing;
create table if not exists est_ciclico_contagens(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 produto_id uuid not null references est_produtos(id),
 local_id uuid not null references est_locais(id),
 classe char(1) not null default 'C',
 saldo_sistema numeric(16,3) not null,
 contado numeric(16,3) check(contado is null or contado>=0),
 status varchar(10) not null default 'ABERTA' check(status in('ABERTA','DIVERGENTE','CONFERIDA','AJUSTADA','CANCELADA')),
 motivo text not null default '', movimento_id bigint,
 aberta_por varchar(160) not null, aberta_em timestamptz not null default now(),
 contada_por varchar(160), contada_em timestamptz,
 ajustada_por varchar(160), ajustada_em timestamptz
);
create unique index if not exists ux_ciclico_aberta on est_ciclico_contagens(produto_id,local_id) where status in('ABERTA','DIVERGENTE');

create or replace function est_ciclico_devidos(p_data date)
returns table(produto_id uuid,codigo text,descricao text,local_id uuid,deposito text,classe text,ultima date,dias_sem_contar integer,saldo numeric)
language sql stable as $$
 with abc as (select a.produto_id,a.classe_abc from cmp_curva_abc_xyz(180) a),
 base as (
  select s.produto_id,p.codigo::text codigo,p.descricao::text descricao,s.local_id,l.codigo::text deposito,coalesce(abc.classe_abc,'C')::text classe,s.fisico,
   (select max(c.contada_em)::date from est_ciclico_contagens c where c.produto_id=s.produto_id and c.local_id=s.local_id and c.status in('CONFERIDA','AJUSTADA')) ultima
  from est_saldos s join est_produtos p on p.id=s.produto_id and p.ativo join est_locais l on l.id=s.local_id and l.ativo left join abc on abc.produto_id=s.produto_id where s.fisico>0)
 select b.produto_id,b.codigo,b.descricao,b.local_id,b.deposito,b.classe,b.ultima,case when b.ultima is null then null else p_data-b.ultima end,b.fisico
 from base b join est_ciclico_regras r on r.classe=b.classe
 where (b.ultima is null or p_data-b.ultima>=r.frequencia_dias)
  and not exists(select 1 from est_ciclico_contagens c where c.produto_id=b.produto_id and c.local_id=b.local_id and c.status in('ABERTA','DIVERGENTE'))
 order by b.classe,b.ultima nulls first,b.codigo
$$;

create or replace function est_ciclico_abrir(p_data date,p_limite integer,p_ator text) returns integer language plpgsql as $$
declare r record;n integer:=0;
begin
 if p_limite<1 or p_limite>500 then raise exception 'Limite deve estar entre 1 e 500';end if;
 for r in select * from est_ciclico_devidos(p_data) limit p_limite loop
  insert into est_ciclico_contagens(produto_id,local_id,classe,saldo_sistema,aberta_por) values(r.produto_id,r.local_id,r.classe,r.saldo,p_ator) on conflict do nothing;
  if found then n=n+1;end if;
 end loop;
 return n;
end$$;

create or replace function est_ciclico_contar(p_id uuid,p_contado numeric,p_ator text) returns text language plpgsql as $$
declare c est_ciclico_contagens%rowtype;v_atual numeric;
begin
 if p_contado<0 then raise exception 'Contagem inválida';end if;
 select * into strict c from est_ciclico_contagens where id=p_id for update;
 if c.status not in('ABERTA','DIVERGENTE') then raise exception 'Contagem % não aceita nova contagem',c.status;end if;
 select coalesce(fisico,0) into v_atual from est_saldos where produto_id=c.produto_id and local_id=c.local_id;
 update est_ciclico_contagens set contado=p_contado,contada_por=p_ator,contada_em=now(),
  status=case when p_contado=coalesce(v_atual,0) then 'CONFERIDA' else 'DIVERGENTE' end where id=p_id;
 return case when p_contado=coalesce(v_atual,0) then 'CONFERIDA' else 'DIVERGENTE' end;
end$$;

-- Ajuste = contado menos o saldo ATUAL do sistema (o depósito não é bloqueado durante a contagem).
create or replace function est_ciclico_ajustar(p_id uuid,p_motivo text,p_ator text) returns bigint language plpgsql as $$
declare c est_ciclico_contagens%rowtype;v_atual numeric;v_delta numeric;v_custo numeric;v_mov bigint;
begin
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo do ajuste';end if;
 select * into strict c from est_ciclico_contagens where id=p_id for update;
 if c.status<>'DIVERGENTE' then raise exception 'Somente contagem divergente pode ser ajustada (status %)',c.status;end if;
 select coalesce(fisico,0) into v_atual from est_saldos where produto_id=c.produto_id and local_id=c.local_id;
 v_delta=c.contado-coalesce(v_atual,0);
 if v_delta=0 then update est_ciclico_contagens set status='CONFERIDA',motivo=trim(p_motivo),ajustada_por=p_ator,ajustada_em=now() where id=p_id;return null;end if;
 v_custo=coalesce(exp_custo_medio(c.produto_id,c.local_id),0)*abs(v_delta);
 v_mov=cmp_mov_estoque(case when v_delta>0 then 'ENTRADA' else 'SAIDA' end,c.produto_id,c.local_id,abs(v_delta),'INV-CIC-'||c.numero,trim(p_motivo),v_custo,p_ator);
 update est_ciclico_contagens set status='AJUSTADA',motivo=trim(p_motivo),movimento_id=v_mov,ajustada_por=p_ator,ajustada_em=now() where id=p_id;
 return v_mov;
end$$;

create or replace function est_ciclico_cancelar(p_id uuid,p_ator text) returns void language plpgsql as $$
begin
 update est_ciclico_contagens set status='CANCELADA',ajustada_por=p_ator,ajustada_em=now() where id=p_id and status in('ABERTA','DIVERGENTE');
 if not found then raise exception 'Contagem não encontrada ou já encerrada';end if;
end$$;

-- ================================================================ F. PEPS: camadas e valorização
create or replace function est_peps_camadas(p_prod uuid,p_local uuid default null)
returns table(entrada_id bigint,data date,lote text,local_id uuid,quantidade numeric,consumido numeric,restante numeric,custo_unitario numeric,valor_restante numeric)
language sql stable as $$
 select m.id,m.criado_em::date,l.codigo::text,m.local_destino_id,m.quantidade_base,
  coalesce(a.q,0)::numeric,greatest(0,m.quantidade_base-coalesce(a.q,0))::numeric,
  (m.custo_total/nullif(m.quantidade_base,0))::numeric,
  (greatest(0,m.quantidade_base-coalesce(a.q,0))*m.custo_total/nullif(m.quantidade_base,0))::numeric
 from est_movimentos m
 left join est_lotes l on l.id=m.lote_id
 left join lateral (select sum(x.quantidade) q from est_custeio_alocacoes x where x.entrada_id=m.id) a on true
 where m.tipo='ENTRADA' and m.estorno_de is null and m.produto_id=p_prod and (p_local is null or m.local_destino_id=p_local)
  and m.quantidade_base-coalesce(a.q,0)>0
 order by m.criado_em,m.id
$$;

create or replace function est_peps_resumo()
returns table(produto_id uuid,codigo text,descricao text,saldo numeric,valor_peps numeric,valor_medio numeric,diferenca numeric)
language sql stable as $$
 with sal as (select produto_id,sum(fisico) q from est_saldos group by 1 having sum(fisico)>0),
 peps as (select m.produto_id,sum(greatest(0,m.quantidade_base-coalesce(a.q,0))*m.custo_total/nullif(m.quantidade_base,0)) v
  from est_movimentos m left join lateral (select sum(x.quantidade) q from est_custeio_alocacoes x where x.entrada_id=m.id) a on true
  where m.tipo='ENTRADA' and m.estorno_de is null group by 1),
 med as (select produto_id,sum(case when tipo='ENTRADA' then custo_total when tipo='SAIDA' then -custo_total else 0 end) v from est_movimentos group by 1)
 select s.produto_id,p.codigo::text,p.descricao::text,s.q,round(coalesce(pe.v,0),2),round(greatest(0,coalesce(me.v,0)),2),round(coalesce(pe.v,0)-greatest(0,coalesce(me.v,0)),2)
 from sal s join est_produtos p on p.id=s.produto_id left join peps pe on pe.produto_id=s.produto_id left join med me on me.produto_id=s.produto_id
 order by p.codigo
$$;

-- ================================================================ G. Portal do fornecedor (confirmação de entrega por link)
create table if not exists cmp_portal_tokens(
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references cmp_pedidos(id) on delete cascade,
 token_hash char(64) not null unique,
 expira_em timestamptz not null,
 revogado_em timestamptz, usado_em timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists cmp_confirmacoes(
 id bigserial primary key,
 pedido_id uuid not null references cmp_pedidos(id) on delete cascade,
 previsao_entrega date not null,
 observacao text not null default '',
 origem varchar(12) not null default 'FORNECEDOR' check(origem in('FORNECEDOR','INTERNO')),
 criado_em timestamptz not null default now()
);
create or replace function cmp_confirmar_entrega(p_pedido uuid,p_previsao date,p_obs text,p_origem text) returns void language plpgsql as $$
declare p cmp_pedidos%rowtype;
begin
 select * into strict p from cmp_pedidos where id=p_pedido for update;
 if p.status not in('APROVADO','PARCIAL') then raise exception 'Pedido não aceita confirmação (status %)',p.status;end if;
 if p_previsao<current_date or p_previsao>current_date+365 then raise exception 'Data de entrega fora do intervalo permitido';end if;
 update cmp_pedidos set previsao=p_previsao,atualizado_em=now() where id=p_pedido;
 insert into cmp_confirmacoes(pedido_id,previsao_entrega,observacao,origem) values(p_pedido,p_previsao,left(coalesce(p_obs,''),500),case when p_origem='INTERNO' then 'INTERNO' else 'FORNECEDOR' end);
end$$;

-- ================================================================ H. Financeiro: juros, multa e desconto na baixa
do $$
declare v_con text;
begin
 select conname into v_con from pg_constraint where conrelid='fin_titulos'::regclass and contype='c' and pg_get_constraintdef(oid) like '%PEDIDO_VENDA%' limit 1;
 if v_con is not null then execute format('alter table fin_titulos drop constraint %I',v_con);end if;
 if not exists(select 1 from pg_constraint where conrelid='fin_titulos'::regclass and conname='fin_titulos_origem_chk') then
  alter table fin_titulos add constraint fin_titulos_origem_chk check(origem in('PEDIDO_VENDA','COMISSAO','COMPRA','MANUAL','ENCARGO'));
 end if;
end$$;

create table if not exists fin_ajustes(
 id uuid primary key default gen_random_uuid(),
 titulo_id uuid not null references fin_titulos(id),
 tipo varchar(10) not null check(tipo in('DESCONTO')),
 valor numeric(16,2) not null check(valor>0),
 motivo text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

-- Contas e regras de encargos/desconto. As regras só entram quando o plano base (ctb_semear_plano) já existe; a baixa completa reaplica.
create or replace function ctb_semear_encargos() returns void language plpgsql as $f$
begin
 insert into ctb_contas(codigo,nome,tipo,analitica) values
  ('3.2.01','Receitas financeiras (juros e multas recebidos)','RECEITA',true),
  ('3.2.02','Descontos obtidos','RECEITA',true),
  ('5.2.01','Descontos concedidos','DESPESA',true),
  ('5.2.02','Juros e multas pagos','DESPESA',true)
 on conflict(codigo) do nothing;
 insert into ctb_regras_lancamento(evento,conta_debito_id,conta_credito_id)
 select r.evento,d.id,c.id
 from (values('TITULO_RECEBER_ENCARGO','1.1.02','3.2.01'),('TITULO_PAGAR_ENCARGO','5.2.02','2.1.01'),('DESCONTO_RECEBER','5.2.01','1.1.02'),('DESCONTO_PAGAR','2.1.01','3.2.02')) r(evento,d,c)
 join ctb_contas d on d.codigo=r.d join ctb_contas c on c.codigo=r.c
 on conflict(evento) do nothing;
end$f$;
select ctb_semear_encargos();

-- Sugestão de encargos por atraso: multa única + juros simples ao dia (percentuais informados pelo chamador).
create or replace function fin_encargos_sugeridos(p_titulo uuid,p_data date,p_multa_pct numeric default 2,p_juros_mes_pct numeric default 1)
returns table(dias_atraso integer,saldo numeric,multa numeric,juros numeric)
language sql stable as $$
 select greatest(0,p_data-t.vencimento)::integer,(t.valor-t.valor_baixado)::numeric,
  case when p_data>t.vencimento then round((t.valor-t.valor_baixado)*p_multa_pct/100,2) else 0 end,
  case when p_data>t.vencimento then round((t.valor-t.valor_baixado)*(p_juros_mes_pct/100/30)*(p_data-t.vencimento),2) else 0 end
 from fin_titulos t where t.id=p_titulo
$$;

create or replace function fin_desconto(p_titulo uuid,p_valor numeric,p_motivo text,p_ator text) returns uuid language plpgsql as $$
declare t fin_titulos%rowtype;v_id uuid;novo numeric;
begin
 if p_valor<=0 then raise exception 'Desconto inválido';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo do desconto';end if;
 select * into strict t from fin_titulos where id=p_titulo for update;
 if t.status not in('ABERTO','PARCIAL') then raise exception 'Título % não aceita desconto',t.status;end if;
 if p_valor>t.valor-t.valor_baixado then raise exception 'Desconto maior que o saldo do título';end if;
 if t.valor-p_valor<=0 then raise exception 'Desconto não pode zerar o título; cancele-o';end if;
 novo=t.valor-p_valor;
 update fin_titulos set valor=novo,status=case when novo=valor_baixado then 'LIQUIDADO' else status end,atualizado_em=now() where id=p_titulo;
 insert into fin_ajustes(titulo_id,tipo,valor,motivo,criado_por) values(p_titulo,'DESCONTO',p_valor,trim(p_motivo),p_ator) returning id into v_id;
 perform ctb_postar_evento('DESCONTO_'||t.tipo,v_id,current_date,p_valor,'Desconto título '||t.numero||' '||t.parceiro,t.centro_custo_id,p_ator);
 return v_id;
end$$;

-- Baixa completa: principal + juros + multa (títulos de encargo liquidados na hora) e desconto, tudo na mesma transação.
create or replace function fin_baixar_completo(p_titulo uuid,p_conta uuid,p_data date,p_valor numeric,p_juros numeric,p_multa numeric,p_desconto numeric,p_extrato uuid,p_ator text) returns uuid language plpgsql as $$
declare t fin_titulos%rowtype;v_baixa uuid;v_enc uuid;v_seq integer;
begin
 perform ctb_semear_encargos();
 p_juros=coalesce(p_juros,0);p_multa=coalesce(p_multa,0);p_desconto=coalesce(p_desconto,0);p_valor=coalesce(p_valor,0);
 if p_juros<0 or p_multa<0 or p_desconto<0 or p_valor<0 then raise exception 'Valores não podem ser negativos';end if;
 if p_valor+p_desconto<=0 then raise exception 'Informe o valor da baixa ou o desconto';end if;
 select * into strict t from fin_titulos where id=p_titulo for update;
 if p_desconto>0 then perform fin_desconto(p_titulo,p_desconto,'Desconto na baixa',p_ator);end if;
 if p_juros>0 then
  select count(*)+1 into v_seq from fin_titulos where origem='ENCARGO' and origem_id=p_titulo;
  v_enc=fin_criar_titulo(t.tipo,'ENCARGO',p_titulo,'JUROS-'||v_seq,1,t.parceiro,t.parceiro_id,'Juros do título '||t.numero,p_data,p_juros,t.centro_custo_id,p_ator);
  perform fin_baixar(v_enc,p_conta,p_data,p_juros,null,p_ator);
 end if;
 if p_multa>0 then
  select count(*)+1 into v_seq from fin_titulos where origem='ENCARGO' and origem_id=p_titulo;
  v_enc=fin_criar_titulo(t.tipo,'ENCARGO',p_titulo,'MULTA-'||v_seq,1,t.parceiro,t.parceiro_id,'Multa do título '||t.numero,p_data,p_multa,t.centro_custo_id,p_ator);
  perform fin_baixar(v_enc,p_conta,p_data,p_multa,null,p_ator);
 end if;
 if p_valor>0 then v_baixa=fin_baixar(p_titulo,p_conta,p_data,p_valor,p_extrato,p_ator);end if;
 return v_baixa;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-02_25_pendencias_producao_estoque_financeiro.sql','ac30c4e94780e573ae53b25273fd8cadf3fbd290e40c03eaf53ab81f48e0e5f9',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-02_25_pendencias_producao_estoque_financeiro.sql','ac30c4e94780e573ae53b25273fd8cadf3fbd290e40c03eaf53ab81f48e0e5f9','APLICAR',current_user,'APLICADA');
COMMIT;

-- >>>>>>>>>> 36_2026-11-03_26_sac_qualidade_oee.up.sql
-- GERADO do arquivo canônico 2026-11-03_26_sac_qualidade_oee.sql; SHA256 1f1a5a6436c356f74b31bb2677ef787d3ef94fbf41b354389cfa04e4a84ea9e0
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-02_25_pendencias_producao_estoque_financeiro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-03_26_sac_qualidade_oee.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-03_26_sac_qualidade_oee.sql' and checksum<>'1f1a5a6436c356f74b31bb2677ef787d3ef94fbf41b354389cfa04e4a84ea9e0') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- ================================================================ A. SAC: anexos (fotos/PDF) e índice de reclamação
create table if not exists sac_anexos(
 id uuid primary key default gen_random_uuid(),
 atendimento_id uuid not null references pcp_sac_atendimentos(id) on delete cascade,
 nome varchar(160) not null,
 mime varchar(40) not null check(mime in('image/jpeg','image/png','image/webp','application/pdf')),
 tamanho integer not null check(tamanho>0 and tamanho<=3145728),
 conteudo bytea not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(octet_length(conteudo)=tamanho)
);
create index if not exists ix_sac_anexos_atend on sac_anexos(atendimento_id,criado_em);
create or replace function sac_anexos_limite() returns trigger language plpgsql as $$
begin
 if (select count(*) from sac_anexos where atendimento_id=new.atendimento_id)>=10 then raise exception 'Limite de 10 anexos por atendimento';end if;
 return new;
end$$;
drop trigger if exists sac_anexos_limite_t on sac_anexos;
create trigger sac_anexos_limite_t before insert on sac_anexos for each row execute function sac_anexos_limite();

-- Índice de reclamação: atendimentos do tipo reclamação por 100 pedidos entregues, tempo de resolução, prazo e reincidência.
create or replace function sac_indice_reclamacao(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare v_tot integer;v_rec integer;v_ent integer;v_res jsonb;v_tipos jsonb;v_reinc integer;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 select count(*),count(*) filter(where upper(tipo) in('RECLAMACAO','RECLAMAÇÃO','DEFEITO','GARANTIA')) into v_tot,v_rec from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim;
 select count(distinct r.pedido_venda_id) into v_ent from exp_remessas r where r.status='ENTREGUE' and r.entregue_em::date between p_ini and p_fim;
 select jsonb_build_object('concluidos',count(*),'diasMedios',round(avg(extract(epoch from concluido_em-criado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where prazo is null or concluido_em::date<=prazo)) into v_res
  from pcp_sac_atendimentos where status='CONCLUIDO' and concluido_em is not null and criado_em::date between p_ini and p_fim;
 select coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'total',c) order by c desc),'[]'::jsonb) into v_tipos from(select tipo,count(*) c from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim group by 1) x;
 select count(*) into v_reinc from(select cliente from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim group by cliente having count(*)>1) x;
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'atendimentos',v_tot,'reclamacoes',v_rec,'pedidosEntregues',v_ent,
  'por100Pedidos',case when v_ent>0 then round(100.0*v_rec/v_ent,2) end,'resolucao',v_res,'porTipo',v_tipos,'clientesReincidentes',v_reinc);
end$$;

-- ================================================================ B. Qualidade: importação de medições em lote (tudo ou nada)
create or replace function qld_medir_lote(p_lote uuid,p_medicoes jsonb,p_instr uuid,p_ator text) returns integer language plpgsql as $$
declare m jsonb;n integer:=0;
begin
 if jsonb_typeof(p_medicoes)<>'array' or jsonb_array_length(p_medicoes)=0 then raise exception 'Nenhuma medição para importar';end if;
 if jsonb_array_length(p_medicoes)>2000 then raise exception 'Máximo de 2000 medições por importação';end if;
 for m in select value from jsonb_array_elements(p_medicoes) loop
  begin
   perform qld_medir(p_lote,(m->>'linha')::integer,(m->>'valor')::numeric,coalesce(nullif(m->>'instrumentoId','')::uuid,p_instr),p_ator);
  exception when others then
   raise exception 'Linha % (característica %): %',n+1,m->>'linha',sqlerrm;
  end;
  n:=n+1;
 end loop;
 return n;
end$$;

-- ================================================================ C. OEE completo no painel (disponibilidade x desempenho x qualidade)
create or replace function ind_painel(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare
 v_otif jsonb;v_lead jsonb;v_giro jsonb;v_ppm jsonb;v_oee jsonb;v_com jsonb;v_cart jsonb;
 v_dias integer:=greatest(1,p_fim-p_ini+1);
 v_hoje date:=p_fim;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 -- OTIF: pedidos com entrega prevista no período; no prazo = última entrega <= data prevista; completo = entregue >= pedido
 with ped as(
  select v.id,v.data_entrega,
   (select coalesce(sum(quantidade),0) from crm_pedido_venda_itens i where i.pedido_id=v.id) qtd,
   (select coalesce(sum(ri.quantidade),0) from exp_remessa_itens ri join exp_remessas r on r.id=ri.remessa_id where r.pedido_venda_id=v.id and r.status='ENTREGUE') ent,
   (select max(r.entregue_em)::date from exp_remessas r where r.pedido_venda_id=v.id and r.status='ENTREGUE') ult
  from crm_pedidos_venda v where v.data_entrega between p_ini and p_fim and v.status not in ('RASCUNHO','EM_APROVACAO','CANCELADO')),
 f as(select *,(ult is not null and ult<=data_entrega) ot,(qtd>0 and ent>=qtd) inf from ped)
 select jsonb_build_object('pedidos',count(*),'noPrazo',count(*) filter(where ot),'completos',count(*) filter(where inf),
  'otif',count(*) filter(where ot and inf),'percentual',case when count(*)>0 then round(100.0*count(*) filter(where ot and inf)/count(*),1) end) into v_otif from f;
 select jsonb_build_object('ofsConcluidas',count(*),'leadTimeDias',round(avg(extract(epoch from concluido_em-liberado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where concluido_em::date<=prazo)) into v_lead
  from erp_ordens_fabricacao where status='CONCLUIDA' and liberado_em is not null and concluido_em::date between p_ini and p_fim;
 -- Giro (anualizado) = custo das saídas no período / valor atual em estoque
 with sai as(select coalesce(sum(custo_total),0) v from est_movimentos where tipo='SAIDA' and criado_em::date between p_ini and p_fim),
 est as(select coalesce(sum(s.fisico*coalesce(exp_custo_medio(s.produto_id,s.local_id),0)),0) v from est_saldos s)
 select jsonb_build_object('custoSaidas',round(sai.v,2),'valorEstoque',round(est.v,2),
  'giroAnualizado',case when est.v>0 then round(sai.v*365.0/v_dias/est.v,2) end) into v_giro from sai,est;
 select jsonb_build_object('inspecionado',coalesce(sum(quantidade),0),'bloqueado',coalesce(sum(qtd_bloqueada),0),
  'ppm',case when sum(quantidade)>0 then round(1000000*sum(qtd_bloqueada)/sum(quantidade)) end) into v_ppm
  from qld_lotes_inspecao where status in('APROVADO','REPROVADO','SUCATEADO','QUARENTENA') and criado_em::date between p_ini and p_fim;
 -- OEE parcial: disponibilidade (paradas registradas) x qualidade (refugo); desempenho não é medido
 with at as(select count(*) n from mnt_ativos where ativo),
 par as(select coalesce(sum(extract(epoch from least(coalesce(fim,(p_fim+1)::timestamptz),(p_fim+1)::timestamptz)-greatest(inicio,p_ini::timestamptz))/3600),0) h
   from mnt_paradas where inicio<(p_fim+1)::timestamptz and coalesce(fim,(p_fim+1)::timestamptz)>p_ini::timestamptz),
 pf as(
   select case when sum(x.min_real)>0 then round(least(1,sum(x.min_ideal)/sum(x.min_real))::numeric,4) end perf,
    case when count(*)>0 then round(100.0*count(*) filter(where x.min_real>0)/count(*),1) end cob
   from(select h.minutos min_real,
     coalesce((po.roteiro_snapshot->>'setup')::numeric,0)+coalesce((select sum((a.ciclo_payload->>'boa')::numeric) from pcp_apontamentos a where a.operacao_id=po.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO'),0)*coalesce((po.roteiro_snapshot->>'ciclo')::numeric,0) min_ideal
    from cst_horas_of h join pcp_operacoes po on po.id=h.operacao_id where h.informado_em::date between p_ini and p_fim) x),
 ap as(select coalesce(sum(quantidade) filter(where tipo in('PRODUCAO','FINALIZACAO')),0) bom,coalesce(sum(quantidade) filter(where tipo='REFUGO'),0) ref
   from pcp_apontamentos where data_producao between p_ini and p_fim)
 select jsonb_build_object('disponibilidade',case when at.n>0 then round(greatest(0,1-par.h/(at.n*24.0*v_dias))::numeric,4) end,
  'qualidade',case when ap.bom+ap.ref>0 then round((ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'desempenho',pf.perf,'coberturaDesempenho',pf.cob,
  'oeeParcial',case when at.n>0 and ap.bom+ap.ref>0 then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'oee',case when at.n>0 and ap.bom+ap.ref>0 and pf.perf is not null then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref)*pf.perf)::numeric,4) end,
  'observacao','Desempenho = minutos padrão (setup + boas x ciclo) / minutos reais apontados em cst_horas_of; cobertura = operações com horas informadas.') into v_oee from at,par,ap,pf;
 select coalesce(jsonb_object_agg(status,v),'{}'::jsonb) into v_com from(select status,round(sum(valor),2) v from crm_comissoes where competencia between to_char(p_ini,'YYYY-MM') and to_char(p_fim,'YYYY-MM') group by status) x;
 select jsonb_build_object('pedidosAbertos',count(*),'saldoAFaturar',coalesce(round(sum(total-faturado_valor),2),0),
  'atrasados',count(*) filter(where data_entrega<v_hoje),'saldoAtrasado',coalesce(round(sum(total-faturado_valor) filter(where data_entrega<v_hoje),2),0)) into v_cart
  from crm_pedidos_venda where status in('APROVADO','EM_PRODUCAO','PARCIAL');
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'otif',v_otif,'leadTime',v_lead,'giro',v_giro,'ppm',v_ppm,'oee',v_oee,'comissoes',v_com,'carteira',v_cart);
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-03_26_sac_qualidade_oee.sql','1f1a5a6436c356f74b31bb2677ef787d3ef94fbf41b354389cfa04e4a84ea9e0',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-03_26_sac_qualidade_oee.sql','1f1a5a6436c356f74b31bb2677ef787d3ef94fbf41b354389cfa04e4a84ea9e0','APLICAR',current_user,'APLICADA');
COMMIT;
