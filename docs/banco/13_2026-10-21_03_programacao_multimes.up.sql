-- GERADO do arquivo canônico 2026-10-21_03_programacao_multimes.sql; SHA256 01511da9fcdf278478ac7590b23e6d972f573c4e21ac51616fd0ef095da093bb
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_fundacao_multiempresa.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_03_programacao_multimes.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_03_programacao_multimes.sql' and checksum<>'01511da9fcdf278478ac7590b23e6d972f573c4e21ac51616fd0ef095da093bb') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists pcp_programacao_lotes (
 id uuid primary key default gen_random_uuid(),
 ordem bigserial unique,
 filial_id uuid not null references pcp_filiais(id),
 competencia date not null check (extract(day from competencia)=1),
 arquivo text not null, hash text not null, usuario text not null,
 modo text not null check (modo in ('ACRESCENTAR','SUBSTITUIR')),
 status text not null default 'ATIVO' check(status in ('ATIVO','DESFEITO')),
 linhas integer not null, criado_em timestamptz not null default now(), desfeito_em timestamptz,
 unique(filial_id,competencia,hash)
);
create table if not exists pcp_programacao_mensal_itens (
 id uuid primary key default gen_random_uuid(),
 lote_id uuid not null references pcp_programacao_lotes(id),
 filtro text not null, pedido text not null, item text not null, produto text not null,
 descricao text not null, of text not null, data date,
 quantidade numeric(16,3) not null check(quantidade>0), chave text not null,
 unique(lote_id,chave)
);
create index if not exists ix_prog_mensal_unidade_mes on pcp_programacao_lotes(filial_id,competencia,criado_em);
create index if not exists ix_prog_mensal_filtro on pcp_programacao_mensal_itens(filtro,lote_id);
-- Escopo adicional por login, para contas legadas por variável de ambiente.
create table if not exists pcp_programacao_acessos (
 usuario text not null, filial_id uuid not null references pcp_filiais(id),
 primary key(usuario,filial_id)
);
-- Empresa técnica de compatibilidade: nunca altera empresas já cadastradas.
insert into pcp_empresas(codigo,razao_social) values('PCP_LEGADO','PCP legado') on conflict(codigo) do nothing;
insert into pcp_filiais(empresa_id,codigo,nome)
 select id,u.codigo,u.nome from pcp_empresas cross join (values('SUL','Sul'),('NORDESTE','Nordeste')) u(codigo,nome)
 where pcp_empresas.codigo='PCP_LEGADO' on conflict(empresa_id,codigo) do nothing;
-- Projeção dos dados originais: sem cópia de produtos, alteração de status ou exclusão.
-- Competência derivada da data real; não existe CSV de exemplo versionado.
create or replace view pcp_programacao_mensal_base as
 select p.id::text as id, f.id as filial_id, date_trunc('month',g.data_programacao)::date as competencia,
 coalesce(nullif(p.filtro,''),g.filtro) as filtro,p.pedido,p.item,p.produto,p.descricao,p.of,
 p.quantidade,g.data_programacao as data,'LEGADO'::text as origem,
 null::uuid as lote_id,g.criado_em as criado_em,0::bigint as ordem
 from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id
 join pcp_empresas e on e.codigo='PCP_LEGADO'
 join pcp_filiais f on f.empresa_id=e.id and f.codigo='SUL'
 where g.status in ('ATIVA','ENCERRADA')
 union all
 select i.id::text,l.filial_id,l.competencia,i.filtro,i.pedido,i.item,i.produto,i.descricao,i.of,
 i.quantidade,i.data,'IMPORTADO',l.id,l.criado_em,l.ordem
 from pcp_programacao_mensal_itens i join pcp_programacao_lotes l on l.id=i.lote_id
 where l.status='ATIVO';

create or replace view pcp_programacao_mensal_efetiva as
 select b.* from pcp_programacao_mensal_base b
 where not exists(select 1 from pcp_programacao_lotes l
 where l.filial_id=b.filial_id and l.competencia=b.competencia
 and l.status='ATIVO' and l.modo='SUBSTITUIR'
 and (b.origem='LEGADO' or (l.ordem>b.ordem and l.id is distinct from b.lote_id)));

create or replace function pcp_importar_mensal(p_filial uuid,p_mes date,p_arquivo text,p_hash text,p_usuario text,p_modo text,p_linhas jsonb)
returns jsonb language plpgsql as $$
declare v_id uuid; v_n integer; v_empresa uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_filial::text||p_mes::text,0));
 select id into v_id from pcp_programacao_lotes where filial_id=p_filial and competencia=p_mes and hash=p_hash;
 if v_id is not null then
   return jsonb_build_object('id',v_id,'repetido',true);
 end if;
 insert into pcp_programacao_lotes(filial_id,competencia,arquivo,hash,usuario,modo,linhas)
 values(p_filial,p_mes,p_arquivo,p_hash,p_usuario,p_modo,0) returning id into v_id;
 insert into pcp_programacao_mensal_itens(lote_id,filtro,pedido,item,produto,descricao,of,data,quantidade,chave)
 select v_id,x.filtro,x.pedido,x.item,x.produto,x.descricao,x.of,x.data,x.quantidade,x.chave
 from jsonb_to_recordset(p_linhas) as x(filtro text,pedido text,item text,produto text,descricao text,of text,data date,quantidade numeric,chave text)
 where p_modo='SUBSTITUIR' or not exists(
 select 1 from pcp_programacao_mensal_efetiva b where b.filial_id=p_filial and b.competencia=p_mes
 and (b.filtro,b.pedido,b.item,b.produto,b.of,b.descricao)=(x.filtro,x.pedido,x.item,x.produto,x.of,x.descricao)
 and b.data is not distinct from x.data);
 get diagnostics v_n=row_count;
 update pcp_programacao_lotes set linhas=v_n where id=v_id;
 select empresa_id into v_empresa from pcp_filiais where id=p_filial;
 insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,entidade_id,depois)
 values(v_empresa,p_filial,p_usuario,'IMPORTAR','PROGRAMACAO_MENSAL',v_id::text,jsonb_build_object('modo',p_modo,'linhas',v_n,'hash',p_hash,'competencia',p_mes));
 return jsonb_build_object('id',v_id,'linhas',v_n,'repetido',false);
end $$;

create or replace function pcp_desfazer_mensal(p_id uuid,p_usuario text)
returns jsonb language plpgsql as $$
declare l pcp_programacao_lotes%rowtype; v_empresa uuid;
begin
 select * into strict l from pcp_programacao_lotes where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended(l.filial_id::text||l.competencia::text,0));
 select * into strict l from pcp_programacao_lotes where id=p_id for update;
 if l.status='DESFEITO' then return jsonb_build_object('ok',true,'repetido',true); end if;
 if exists(select 1 from pcp_programacao_lotes n where n.filial_id=l.filial_id and n.competencia=l.competencia and n.status='ATIVO' and n.ordem>l.ordem) then
 raise exception 'Desfaça primeiro os lotes mais recentes desta unidade e competência';
 end if;
 update pcp_programacao_lotes set status='DESFEITO',desfeito_em=now() where id=p_id;
 select empresa_id into v_empresa from pcp_filiais where id=l.filial_id;
 insert into pcp_auditoria_global(empresa_id,filial_id,ator,acao,entidade,entidade_id,antes,depois)
 values(v_empresa,l.filial_id,p_usuario,'DESFAZER','PROGRAMACAO_MENSAL',p_id::text,to_jsonb(l),jsonb_build_object('status','DESFEITO'));
 return jsonb_build_object('ok',true);
end $$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_03_programacao_multimes.sql','01511da9fcdf278478ac7590b23e6d972f573c4e21ac51616fd0ef095da093bb',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_03_programacao_multimes.sql','01511da9fcdf278478ac7590b23e6d972f573c4e21ac51616fd0ef095da093bb','APLICAR',current_user,'APLICADA');
COMMIT;
