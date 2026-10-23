-- PARTE 3 de 4 — migrações 23 a 26. Execute na ordem 1,2,3,4. Pode rodar de novo sem problema.

-- >>>>>>>>>> migração 23_manutencao_documentos
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

-- >>>>>>>>>> migração 24_indicadores_integracoes
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

-- >>>>>>>>>> migração 25_pendencias_producao_estoque_financeiro
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

-- >>>>>>>>>> migração 26_sac_qualidade_oee
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
