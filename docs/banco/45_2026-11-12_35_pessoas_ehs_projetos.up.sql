-- GERADO do arquivo canônico 2026-11-12_35_pessoas_ehs_projetos.sql; SHA256 13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-11_34_plataforma_eventos_campos_notificacoes.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-12_35_pessoas_ehs_projetos.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-12_35_pessoas_ehs_projetos.sql' and checksum<>'13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

insert into erp_config(chave,valor,descricao) values
 ('rh.jornada_horas','8','Jornada diária padrão (horas) usada no banco de horas'),
 ('rh.encargos_pct','70','Encargos sobre o salário para custo de hora-homem (%)'),
 ('rh.horas_mes','220','Horas mensais para custo/hora')
on conflict(chave) do nothing;

create or replace function rh_cfg(p_chave text,p_padrao numeric) returns numeric language sql stable as $$
 select coalesce((select nullif(valor,'')::numeric from erp_config where chave=p_chave),p_padrao)$$;

-- ============ A. Banco de horas (ponto x jornada + lançamentos de compensação/pagamento)
create table if not exists rh_banco_horas_lanc(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 data date not null, horas numeric(6,2) not null check(horas<>0 and abs(horas)<=240),
 tipo varchar(12) not null check(tipo in('COMPENSACAO','PAGAMENTO','AJUSTE')),
 motivo varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_rh_bh_colab on rh_banco_horas_lanc(colaborador_id,data);
create or replace view rh_v_banco_horas as
select c.id colaborador_id,c.matricula,c.nome,c.setor,
 coalesce((select sum(p.horas-rh_cfg('rh.jornada_horas',8)) from rh_ponto p where p.colaborador_id=c.id and p.horas>0 and extract(isodow from p.data) between 1 and 5),0)
 +coalesce((select sum(p.horas) from rh_ponto p where p.colaborador_id=c.id and p.horas>0 and extract(isodow from p.data) in(6,7)),0) saldo_ponto,
 coalesce((select sum(l.horas) from rh_banco_horas_lanc l where l.colaborador_id=c.id),0) lancamentos
from rh_colaboradores c where c.status<>'DESLIGADO';
create or replace function rh_banco_saldo(p_colab uuid) returns numeric language sql stable as $$
 select round(saldo_ponto+lancamentos,2) from rh_v_banco_horas where colaborador_id=p_colab$$;
create or replace function rh_banco_lancar(p_colab uuid,p_data date,p_horas numeric,p_tipo text,p_motivo text,p_ator text) returns numeric language plpgsql as $$
declare s numeric;
begin
 if p_tipo in('COMPENSACAO','PAGAMENTO') and p_horas>0 then raise exception 'Compensação/pagamento deve ser negativo (baixa do saldo)';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo';end if;
 s=rh_banco_saldo(p_colab);
 if s is null then raise exception 'Colaborador inexistente ou desligado';end if;
 if p_horas<0 and s+p_horas<0 and p_tipo<>'AJUSTE' then raise exception 'SALDO_INSUFICIENTE: saldo % h, baixa % h',s,-p_horas;end if;
 insert into rh_banco_horas_lanc(colaborador_id,data,horas,tipo,motivo,criado_por) values(p_colab,p_data,p_horas,p_tipo,p_motivo,p_ator);
 return rh_banco_saldo(p_colab);
end$$;

-- ============ B. Férias: períodos aquisitivo/concessivo, saldo e regras de fracionamento
create or replace function rh_ciclo_ferias(p_admissao date,p_data date) returns integer language sql immutable as $$
 select date_part('year',age(p_data,p_admissao))::int$$;

create or replace function rh_trg_ferias() returns trigger language plpgsql as $$
declare adm date;ciclo int;usados int;fracoes int;dias int;
begin
 if exists(select 1 from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.id<>new.id and daterange(a.inicio,a.fim,'[]')&&daterange(new.inicio,new.fim,'[]')) then raise exception 'AUSENCIA_SOBREPOSTA: já existe ausência neste período';end if;
 if new.tipo<>'FERIAS' then return new;end if;
 select admissao into adm from rh_colaboradores where id=new.colaborador_id;
 ciclo=rh_ciclo_ferias(adm,new.inicio);
 if ciclo<1 then raise exception 'FERIAS_SEM_DIREITO: o colaborador ainda não completou o período aquisitivo de 12 meses';end if;
 dias=new.fim-new.inicio+1;
 if dias<5 then raise exception 'FERIAS_FRACAO: cada fração deve ter ao menos 5 dias';end if;
 select coalesce(sum(a.fim-a.inicio+1),0),count(*) into usados,fracoes from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.tipo='FERIAS' and a.id<>new.id and rh_ciclo_ferias(adm,a.inicio)=ciclo;
 if usados+dias>30 then raise exception 'FERIAS_SALDO: o ciclo % permite 30 dias; já usados %, solicitados %',ciclo,usados,dias;end if;
 if fracoes>=3 then raise exception 'FERIAS_FRACAO: máximo de 3 frações por ciclo';end if;
 if fracoes>=1 and not exists(select 1 from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.tipo='FERIAS' and a.id<>new.id and rh_ciclo_ferias(adm,a.inicio)=ciclo and a.fim-a.inicio+1>=14) and dias<14 and usados+dias<30 and fracoes=2 then
  raise exception 'FERIAS_FRACAO: uma das frações deve ter ao menos 14 dias';end if;
 return new;
end$$;
drop trigger if exists rh_ferias_t on rh_ausencias;
create trigger rh_ferias_t before insert on rh_ausencias for each row execute function rh_trg_ferias();

create or replace view rh_v_ferias_saldo as
select c.id colaborador_id,c.matricula,c.nome,g.ciclo,
 (c.admissao+(g.ciclo||' years')::interval)::date aquisitivo_fim,
 (c.admissao+((g.ciclo+1)||' years')::interval)::date concessivo_limite,
 30-coalesce((select sum(a.fim-a.inicio+1) from rh_ausencias a where a.colaborador_id=c.id and a.tipo='FERIAS' and rh_ciclo_ferias(c.admissao,a.inicio)=g.ciclo),0)::int saldo_dias,
 ((c.admissao+((g.ciclo+1)||' years')::interval)::date-current_date) dias_para_vencer
from rh_colaboradores c cross join lateral generate_series(1,greatest(rh_ciclo_ferias(c.admissao,current_date),0)) g(ciclo)
where c.status<>'DESLIGADO';

-- ============ C. RH <-> login <-> custo (hora-homem) e apropriação em projetos
create unique index if not exists ux_rh_colab_login on rh_colaboradores(lower(usuario_login)) where usuario_login<>'';
create or replace function rh_custo_hora(p_colab uuid) returns numeric language sql stable as $$
 select round(salario_base*(1+rh_cfg('rh.encargos_pct',70)/100)/nullif(rh_cfg('rh.horas_mes',220),0),2) from rh_colaboradores where id=p_colab$$;
create or replace view rh_v_colaborador_custo as
select c.id,c.matricula,c.nome,c.setor,c.status,c.usuario_login,r.nome cargo,c.salario_base,rh_custo_hora(c.id) custo_hora,
 (c.status='DESLIGADO' and c.usuario_login<>'') login_a_desativar
from rh_colaboradores c left join rh_cargos r on r.id=c.cargo_id;
create or replace function ps_apontar_horas(p_proj uuid,p_colab uuid,p_horas numeric,p_data date,p_ator text) returns numeric language plpgsql as $$
declare v numeric;nome text;
begin
 if p_horas<=0 or p_horas>24 then raise exception 'Horas inválidas';end if;
 select rh_custo_hora(id),c.nome into v,nome from rh_colaboradores c where c.id=p_colab and c.status<>'DESLIGADO';
 if v is null or v<=0 then raise exception 'Colaborador sem salário base ou desligado';end if;
 insert into ps_custos(projeto_id,data,descricao,valor,criado_por) values(p_proj,p_data,'Mão de obra: '||nome||' · '||p_horas||' h',round(v*p_horas,2),p_ator);
 return round(v*p_horas,2);
end$$;

-- ============ D. EHS: inspeções, CAT obrigatória e encerramento de acidente grave
alter table ehs_ocorrencias add column if not exists cat_numero varchar(40) not null default '';
alter table ehs_ocorrencias add column if not exists cat_data date;
create or replace function ehs_trg_encerrar() returns trigger language plpgsql as $$
begin
 if new.status='ENCERRADA' and old.status is distinct from 'ENCERRADA' and new.tipo='ACIDENTE' and new.gravidade='GRAVE' and new.colaborador_id is not null and (new.cat_numero='' or new.cat_data is null) then
  raise exception 'CAT_OBRIGATORIA: acidente grave com colaborador exige o número e a data da CAT antes de encerrar';end if;
 if new.status='ENCERRADA' and old.status is distinct from 'ENCERRADA' then new.emitiu_cat=new.emitiu_cat or new.cat_numero<>'';end if;
 return new;
end$$;
drop trigger if exists ehs_encerrar_t on ehs_ocorrencias;
create trigger ehs_encerrar_t before update on ehs_ocorrencias for each row execute function ehs_trg_encerrar();

create table if not exists ehs_inspecoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(14) not null check(tipo in('EPI','MAQUINA','AMBIENTE','EXTINTOR','GERAL')),
 setor varchar(80) not null default '', data date not null default current_date,
 itens jsonb not null check(jsonb_typeof(itens)='array' and jsonb_array_length(itens)>0),
 total integer not null, nao_conformes integer not null default 0,
 ocorrencia_id uuid references ehs_ocorrencias(id) on delete set null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create or replace function ehs_inspecao_registrar(p_tipo text,p_setor text,p_data date,p_itens jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_nc int;v_tot int;v_oc uuid;x jsonb;v_desc text:='';
begin
 v_tot=jsonb_array_length(p_itens);
 for x in select value from jsonb_array_elements(p_itens) loop
  if coalesce(x->>'item','')='' or jsonb_typeof(x->'conforme')<>'boolean' then raise exception 'Cada item precisa de descrição e conformidade (verdadeiro/falso)';end if;
  if (x->>'conforme')::boolean=false then
   if length(trim(coalesce(x->>'obs','')))<3 then raise exception 'ITEM_SEM_OBS: descreva o problema do item "%"',x->>'item';end if;
   v_nc=coalesce(v_nc,0)+1;v_desc=v_desc||(x->>'item')||': '||(x->>'obs')||'; ';
  end if;
 end loop;
 v_nc=coalesce(v_nc,0);
 if v_nc>0 then
  insert into ehs_ocorrencias(tipo,data,setor,gravidade,descricao,criado_por) values('INCIDENTE',p_data,coalesce(p_setor,''),case when v_nc*3>=v_tot then 'MODERADA' else 'LEVE' end,'Inspeção '||p_tipo||' com '||v_nc||' não conformidade(s): '||left(v_desc,1500),p_ator) returning id into v_oc;
 end if;
 insert into ehs_inspecoes(tipo,setor,data,itens,total,nao_conformes,ocorrencia_id,criado_por) values(p_tipo,coalesce(p_setor,''),p_data,p_itens,v_tot,v_nc,v_oc,p_ator) returning id into v_id;
 return v_id;
end$$;

-- ============ E. Projetos: dependências múltiplas, reprogramação em cascata e caminho crítico
create table if not exists ps_tarefa_dependencias(
 tarefa_id uuid not null references ps_tarefas(id) on delete cascade,
 predecessora_id uuid not null references ps_tarefas(id) on delete cascade,
 folga_dias integer not null default 0 check(folga_dias between 0 and 365),
 primary key(tarefa_id,predecessora_id), check(tarefa_id<>predecessora_id)
);
insert into ps_tarefa_dependencias(tarefa_id,predecessora_id) select id,predecessora_id from ps_tarefas where predecessora_id is not null on conflict do nothing;
create or replace function ps_trg_dep() returns trigger language plpgsql as $$
begin
 if (select projeto_id from ps_tarefas where id=new.tarefa_id)<>(select projeto_id from ps_tarefas where id=new.predecessora_id) then raise exception 'Dependência entre projetos diferentes não é permitida';end if;
 if exists(with recursive alc(id) as (select new.predecessora_id union select d.predecessora_id from ps_tarefa_dependencias d join alc on d.tarefa_id=alc.id) select 1 from alc where id=new.tarefa_id) then
  raise exception 'DEPENDENCIA_CIRCULAR: a dependência criaria um ciclo';end if;
 return new;
end$$;
drop trigger if exists ps_dep_t on ps_tarefa_dependencias;
create trigger ps_dep_t before insert or update on ps_tarefa_dependencias for each row execute function ps_trg_dep();

create or replace function ps_reprogramar(p_tarefa uuid,p_inicio date,p_ator text) returns integer language plpgsql as $$
declare t ps_tarefas%rowtype;dur int;mexidas int:=1;pass int:=0;r record;novo date;
begin
 select * into strict t from ps_tarefas where id=p_tarefa for update;
 dur=t.fim-t.inicio;
 update ps_tarefas set inicio=p_inicio,fim=p_inicio+dur where id=p_tarefa;
 while mexidas>0 and pass<200 loop
  mexidas=0;pass=pass+1;
  for r in select s.id,s.inicio,s.fim,max(p.fim+1+d.folga_dias) minimo from ps_tarefa_dependencias d join ps_tarefas s on s.id=d.tarefa_id join ps_tarefas p on p.id=d.predecessora_id where s.projeto_id=t.projeto_id group by s.id,s.inicio,s.fim loop
   if r.inicio<r.minimo then update ps_tarefas set inicio=r.minimo,fim=r.minimo+(r.fim-r.inicio) where id=r.id;mexidas=mexidas+1;end if;
  end loop;
 end loop;
 update ps_projetos p set fim_previsto=greatest(p.fim_previsto,(select max(fim) from ps_tarefas where projeto_id=t.projeto_id)) where p.id=t.projeto_id;
 return pass;
end$$;

create or replace function ps_caminho_critico(p_proj uuid) returns table(ordem int,wbs text,nome text,inicio date,fim date,dias int) language sql stable as $$
 with recursive cam(id,caminho,total) as (
  select t.id,array[t.id],(t.fim-t.inicio+1) from ps_tarefas t where t.projeto_id=p_proj and not exists(select 1 from ps_tarefa_dependencias d where d.tarefa_id=t.id)
  union all
  select t.id,c.caminho||t.id,c.total+(t.fim-t.inicio+1)+d.folga_dias from cam c join ps_tarefa_dependencias d on d.predecessora_id=c.id join ps_tarefas t on t.id=d.tarefa_id where t.projeto_id=p_proj and not t.id=any(c.caminho)),
 melhor as (select caminho from cam order by total desc,array_length(caminho,1) desc limit 1)
 select u.ord::int,t.wbs::text,t.nome::text,t.inicio,t.fim,(t.fim-t.inicio+1)::int from melhor m cross join lateral unnest(m.caminho) with ordinality u(id,ord) join ps_tarefas t on t.id=u.id order by u.ord$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-12_35_pessoas_ehs_projetos.sql','13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-12_35_pessoas_ehs_projetos.sql','13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6','APLICAR',current_user,'APLICADA');
COMMIT;
