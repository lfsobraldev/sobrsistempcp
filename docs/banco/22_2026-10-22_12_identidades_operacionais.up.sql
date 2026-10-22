-- GERADO do arquivo canônico 2026-10-22_12_identidades_operacionais.sql; SHA256 6efdb01442e19fe1cb5284e2d495152b5db940f67d794890e3b372b7075cbf62
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-20_crm_comercial.sql, 2026-10-22_10_ciclo_industrial.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_12_identidades_operacionais.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
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
