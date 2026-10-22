-- GERADO do arquivo canônico 2026-10-31_23_manutencao_documentos.sql; SHA256 89c1af7ff48562b99ada6ee34925df0583f5688abc8273773291cdef89b6c5a8
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-30_22_financeiro_contabil.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-31_23_manutencao_documentos.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
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
