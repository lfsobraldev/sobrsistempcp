-- DIAGNÓSTICO — PARTE 2 de 4. Rode na ordem. Ao final aparece uma tabela: me envie as linhas que começam com ERRO.
-- RUNNER COM DIAGNÓSTICO: roda cada migração isolada e, no FINAL, mostra o resultado de cada uma.
create table if not exists _erros_migracao(id bigserial primary key,migracao text,erro text,em timestamptz default now());
delete from _erros_migracao where em<now()-interval '1 day';

-- >>>>> 2026-10-25_17_qualidade_inspecao
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-25_17_qualidade_inspecao.sql; SHA256 8df2d4bb2fd6597978d471ad31a52501731f6e8cb7e9243793ae1ec9685fb99e
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-24_16_compras_terceiros.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-25_17_qualidade_inspecao','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-25_17_qualidade_inspecao','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-10-26_18_mrp_aps
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-26_18_mrp_aps.sql; SHA256 ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-25_17_qualidade_inspecao.sql, 2026-10-22_09_historico_seguro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-26_18_mrp_aps','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-26_18_mrp_aps','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-10-27_19_expedicao_logistica
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-27_19_expedicao_logistica.sql; SHA256 10402fdcf6d29430b5f42be1687da9971c2e85093de243fb356d1a0f5a2c200b
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-26_18_mrp_aps.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-27_19_expedicao_logistica','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-27_19_expedicao_logistica','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-10-28_20_custos_industriais
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-28_20_custos_industriais.sql; SHA256 0dc76fdda50306b11bf89f1875239295283c6ceeab09b75b0eee875462554cca
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-27_19_expedicao_logistica.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-28_20_custos_industriais','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-28_20_custos_industriais','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-10-29_21_fiscal
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-29_21_fiscal.sql; SHA256 43f7e55f3c24e8c37302d124f4f774f90981c3f88ebb38844a263e22944b2a10
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-28_20_custos_industriais.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-29_21_fiscal','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-29_21_fiscal','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-10-30_22_financeiro_contabil
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-10-30_22_financeiro_contabil.sql; SHA256 964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-29_21_fiscal.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

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
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-10-30_22_financeiro_contabil','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-10-30_22_financeiro_contabil','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

select migracao, erro from _erros_migracao where em>now()-interval '30 minutes' order by id;
