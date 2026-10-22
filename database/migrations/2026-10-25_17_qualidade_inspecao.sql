-- depends-on: 2026-10-24_16_compras_terceiros.sql
-- scope: operational
-- migrate:up
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

-- migrate:down
drop function if exists qld_ppm(int);
drop function if exists qld_encerrar_nc(uuid,text);
drop function if exists qld_decidir(uuid,text,text,text);
drop function if exists qld_medir(uuid,int,numeric,uuid,text);
drop function if exists qld_abrir_lote(uuid,numeric,text,text,uuid,uuid,text);
drop table if exists qld_acoes;
drop table if exists qld_nao_conformidades;
drop trigger if exists qld_medicao_imutavel_t on qld_medicoes;
drop table if exists qld_medicoes;
drop function if exists qld_medicao_imutavel();
drop table if exists qld_lotes_inspecao;
drop table if exists qld_plano_caracteristicas;
drop table if exists qld_planos;
drop table if exists qld_instrumentos;
