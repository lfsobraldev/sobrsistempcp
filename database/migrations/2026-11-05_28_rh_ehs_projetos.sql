-- depends-on: 2026-11-04_27_wms_revisoes_sobras.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- ================================================================ A. RH (HCM): cargos, colaboradores, ausências, ponto, folha simplificada
create table if not exists rh_cargos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(120) not null,
 nivel integer not null default 1 check(nivel between 1 and 9),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists rh_colaboradores(
 id uuid primary key default gen_random_uuid(),
 matricula varchar(30) not null unique, nome varchar(200) not null,
 cargo_id uuid references rh_cargos(id), setor varchar(80) not null default '',
 admissao date not null, desligamento date,
 salario_base numeric(14,2) not null default 0 check(salario_base>=0),
 status varchar(10) not null default 'ATIVO' check(status in('ATIVO','FERIAS','AFASTADO','DESLIGADO')),
 usuario_login varchar(160) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(desligamento is null or desligamento>=admissao)
);
create index if not exists ix_rh_colab_status on rh_colaboradores(status,setor);
create table if not exists rh_ausencias(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 tipo varchar(10) not null check(tipo in('FERIAS','ATESTADO','FALTA','LICENCA')),
 inicio date not null, fim date not null, observacao varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim>=inicio)
);
create index if not exists ix_rh_aus_periodo on rh_ausencias(colaborador_id,inicio,fim);
create table if not exists rh_ponto(
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 data date not null,
 entrada time, saida time,
 horas numeric(5,2) not null default 0 check(horas>=0 and horas<=24),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(colaborador_id,data)
);
create table if not exists rh_folha(
 competencia char(7) not null check(competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 colaborador_id uuid not null references rh_colaboradores(id),
 bruto numeric(14,2) not null default 0, desconto_faltas numeric(14,2) not null default 0,
 outros_descontos numeric(14,2) not null default 0 check(outros_descontos>=0),
 horas_extras numeric(14,2) not null default 0 check(horas_extras>=0),
 liquido numeric(14,2) generated always as (bruto-desconto_faltas-outros_descontos+horas_extras) stored,
 status varchar(10) not null default 'RASCUNHO' check(status in('RASCUNHO','FECHADA')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(competencia,colaborador_id)
);

-- Folha simplificada (gerencial): salário - faltas (dias/30) + horas extras a 50% sobre a hora de 220h. Não substitui eSocial/INSS/IRRF.
create or replace function rh_folha_gerar(p_comp text,p_ator text) returns integer language plpgsql as $$
declare v_ini date;v_fim date;v_n integer:=0;c record;v_faltas integer;v_extra numeric;v_hora numeric;
begin
 if p_comp !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida (use AAAA-MM)';end if;
 if exists(select 1 from rh_folha where competencia=p_comp and status='FECHADA') then raise exception 'Competência já fechada';end if;
 v_ini:=(p_comp||'-01')::date;v_fim:=(v_ini+interval '1 month - 1 day')::date;
 delete from rh_folha where competencia=p_comp and status='RASCUNHO';
 for c in select * from rh_colaboradores where status<>'DESLIGADO' or desligamento>=v_ini loop
  select coalesce(sum(least(fim,v_fim)-greatest(inicio,v_ini)+1),0) into v_faltas from rh_ausencias where colaborador_id=c.id and tipo='FALTA' and inicio<=v_fim and fim>=v_ini;
  select coalesce(sum(greatest(horas-8,0)),0) into v_extra from rh_ponto where colaborador_id=c.id and data between v_ini and v_fim;
  v_hora:=c.salario_base/220;
  insert into rh_folha(competencia,colaborador_id,bruto,desconto_faltas,horas_extras,criado_por)
  values(p_comp,c.id,c.salario_base,round(c.salario_base/30*v_faltas,2),round(v_extra*v_hora*1.5,2),p_ator);
  v_n:=v_n+1;
 end loop;
 return v_n;
end$$;
create or replace function rh_folha_fechar(p_comp text,p_ator text) returns void language plpgsql as $$
begin
 update rh_folha set status='FECHADA' where competencia=p_comp and status='RASCUNHO';
 if not found then raise exception 'Nada a fechar em %',p_comp;end if;
end$$;

-- ================================================================ B. EHS: ocorrências, EPI e treinamentos
create table if not exists ehs_ocorrencias(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(14) not null check(tipo in('ACIDENTE','QUASE_ACIDENTE','INCIDENTE','AMBIENTAL')),
 data date not null, setor varchar(80) not null default '',
 colaborador_id uuid references rh_colaboradores(id),
 gravidade varchar(8) not null default 'LEVE' check(gravidade in('LEVE','MODERADA','GRAVE')),
 descricao text not null, acao_corretiva text not null default '',
 emitiu_cat boolean not null default false,
 status varchar(12) not null default 'ABERTA' check(status in('ABERTA','EM_TRATAMENTO','ENCERRADA')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), encerrada_em timestamptz
);
create table if not exists ehs_epis(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(160) not null,
 ca varchar(20) not null default '', validade_ca date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists ehs_epi_entregas(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 epi_id uuid not null references ehs_epis(id),
 entregue_em date not null, vence_em date, quantidade integer not null default 1 check(quantidade>0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vence_em is null or vence_em>=entregue_em)
);
create table if not exists ehs_treinamentos(
 id uuid primary key default gen_random_uuid(),
 nome varchar(160) not null unique, validade_meses integer not null default 12 check(validade_meses>0),
 obrigatorio boolean not null default false, ativo boolean not null default true
);
create table if not exists ehs_treinamento_registros(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 treinamento_id uuid not null references ehs_treinamentos(id),
 realizado_em date not null, vence_em date not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vence_em>=realizado_em)
);
create or replace function ehs_registrar_treinamento(p_colab uuid,p_trein uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare v_m integer;v_id uuid;
begin
 select validade_meses into v_m from ehs_treinamentos where id=p_trein and ativo;
 if v_m is null then raise exception 'Treinamento inválido';end if;
 insert into ehs_treinamento_registros(colaborador_id,treinamento_id,realizado_em,vence_em,criado_por) values(p_colab,p_trein,p_data,(p_data+make_interval(months=>v_m))::date,p_ator) returning id into v_id;
 return v_id;
end$$;

create or replace view ehs_v_vencimentos as
 select 'EPI'::text tipo,c.id colaborador_id,c.nome colaborador,e.nome item,d.vence_em,(d.vence_em-current_date) dias
 from ehs_epi_entregas d join ehs_epis e on e.id=d.epi_id join rh_colaboradores c on c.id=d.colaborador_id
 where c.status<>'DESLIGADO' and d.vence_em is not null and d.vence_em<=current_date+30
  and d.entregue_em=(select max(x.entregue_em) from ehs_epi_entregas x where x.colaborador_id=d.colaborador_id and x.epi_id=d.epi_id)
 union all
 select 'TREINAMENTO',c.id,c.nome,t.nome,r.vence_em,(r.vence_em-current_date)
 from ehs_treinamento_registros r join ehs_treinamentos t on t.id=r.treinamento_id join rh_colaboradores c on c.id=r.colaborador_id
 where c.status<>'DESLIGADO' and r.vence_em<=current_date+30
  and r.realizado_em=(select max(x.realizado_em) from ehs_treinamento_registros x where x.colaborador_id=r.colaborador_id and x.treinamento_id=r.treinamento_id);

create or replace function ehs_indicadores() returns jsonb language sql stable as $$
 select jsonb_build_object(
  'diasSemAcidente',coalesce(current_date-(select max(data) from ehs_ocorrencias where tipo='ACIDENTE'),(select current_date-min(admissao) from rh_colaboradores),0),
  'acidentesAno',(select count(*) from ehs_ocorrencias where tipo='ACIDENTE' and data>=date_trunc('year',current_date)),
  'quaseAcidentesAno',(select count(*) from ehs_ocorrencias where tipo='QUASE_ACIDENTE' and data>=date_trunc('year',current_date)),
  'abertas',(select count(*) from ehs_ocorrencias where status<>'ENCERRADA'),
  'vencidos',(select count(*) from ehs_v_vencimentos where dias<0),
  'aVencer30',(select count(*) from ehs_v_vencimentos where dias>=0)
 )
$$;

-- ================================================================ C. Projetos (PS): projeto, tarefas (WBS) e custos
create table if not exists ps_projetos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(200) not null,
 responsavel varchar(160) not null default '', pedido varchar(60) not null default '',
 inicio date not null, fim_previsto date not null,
 orcamento numeric(16,2) not null default 0 check(orcamento>=0),
 status varchar(12) not null default 'PLANEJADO' check(status in('PLANEJADO','EM_ANDAMENTO','CONCLUIDO','CANCELADO')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim_previsto>=inicio)
);
create table if not exists ps_tarefas(
 id uuid primary key default gen_random_uuid(),
 projeto_id uuid not null references ps_projetos(id) on delete cascade,
 wbs varchar(30) not null, nome varchar(200) not null, responsavel varchar(160) not null default '',
 inicio date not null, fim date not null,
 percentual integer not null default 0 check(percentual between 0 and 100),
 predecessora_id uuid references ps_tarefas(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(projeto_id,wbs), check(fim>=inicio)
);
create table if not exists ps_custos(
 id uuid primary key default gen_random_uuid(),
 projeto_id uuid not null references ps_projetos(id) on delete cascade,
 data date not null, descricao varchar(300) not null, valor numeric(16,2) not null check(valor>0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create or replace function ps_resumo() returns table(id uuid,codigo text,nome text,status text,responsavel text,inicio date,fim_previsto date,orcamento numeric,realizado numeric,pct_orcamento numeric,pct_fisico numeric,tarefas_atrasadas bigint,atrasado boolean) language sql stable as $$
 select p.id,p.codigo::text,p.nome::text,p.status::text,p.responsavel::text,p.inicio,p.fim_previsto,p.orcamento,
  coalesce((select sum(c.valor) from ps_custos c where c.projeto_id=p.id),0),
  case when p.orcamento>0 then round(coalesce((select sum(c.valor) from ps_custos c where c.projeto_id=p.id),0)/p.orcamento*100,1) else 0 end,
  coalesce((select round(avg(t.percentual),1) from ps_tarefas t where t.projeto_id=p.id),0),
  (select count(*) from ps_tarefas t where t.projeto_id=p.id and t.fim<current_date and t.percentual<100),
  (p.status in('PLANEJADO','EM_ANDAMENTO') and p.fim_previsto<current_date)
 from ps_projetos p order by p.fim_previsto
$$;

-- migrate:down
drop function if exists ps_resumo();
drop table if exists ps_custos;
drop table if exists ps_tarefas;
drop table if exists ps_projetos;
drop function if exists ehs_indicadores();
drop view if exists ehs_v_vencimentos;
drop function if exists ehs_registrar_treinamento(uuid,uuid,date,text);
drop table if exists ehs_treinamento_registros;
drop table if exists ehs_treinamentos;
drop table if exists ehs_epi_entregas;
drop table if exists ehs_epis;
drop table if exists ehs_ocorrencias;
drop function if exists rh_folha_fechar(text,text);
drop function if exists rh_folha_gerar(text,text);
drop table if exists rh_folha;
drop table if exists rh_ponto;
drop table if exists rh_ausencias;
drop table if exists rh_colaboradores;
drop table if exists rh_cargos;
