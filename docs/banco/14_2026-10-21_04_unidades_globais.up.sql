-- GERADO do arquivo canônico 2026-10-21_04_unidades_globais.sql; SHA256 5d7a9ef9202472621496e573202b2714e4a52d45d85edd3780e3729915b0bd2d
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_03_programacao_multimes.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-21_04_unidades_globais.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-21_04_unidades_globais.sql' and checksum<>'5d7a9ef9202472621496e573202b2714e4a52d45d85edd3780e3729915b0bd2d') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists erp_identidade_banco(
 singleton boolean primary key default true check(singleton),
 unidade varchar(20) check(unidade in ('SUL','NORDESTE')),
 homologado_por text,
 homologado_em timestamptz
);
insert into erp_identidade_banco(singleton) values(true) on conflict do nothing;
create or replace function erp_proteger_identidade_banco() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' or (old.unidade is not null and new.unidade is distinct from old.unidade) then
  raise exception 'A identidade de uma unidade homologada não pode ser apagada ou trocada';
 end if;
 if new.unidade is not null and (new.homologado_por is null or new.homologado_em is null) then
  raise exception 'Informe operador e data de homologação';
 end if;
 return new;
end $$;
drop trigger if exists erp_identidade_immutavel on erp_identidade_banco;
create trigger erp_identidade_immutavel before update or delete on erp_identidade_banco for each row execute function erp_proteger_identidade_banco();
-- Projeção do legado usa a identidade homologada do banco, nunca uma unidade assumida.
create or replace view pcp_programacao_mensal_base as
 select p.id::text as id,f.id as filial_id,date_trunc('month',g.data_programacao)::date as competencia,
 coalesce(nullif(p.filtro,''),g.filtro) as filtro,p.pedido,p.item,p.produto,p.descricao,p.of,
 p.quantidade,g.data_programacao as data,'LEGADO'::text as origem,null::uuid as lote_id,g.criado_em,0::bigint as ordem
 from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id
 join erp_identidade_banco b on b.singleton and b.unidade is not null
 join pcp_empresas e on e.codigo='PCP_LEGADO'
 join pcp_filiais f on f.empresa_id=e.id and f.codigo=b.unidade
 where g.status in ('ATIVA','ENCERRADA')
 union all
 select i.id::text,l.filial_id,l.competencia,i.filtro,i.pedido,i.item,i.produto,i.descricao,i.of,
 i.quantidade,i.data,'IMPORTADO',l.id,l.criado_em,l.ordem
 from pcp_programacao_mensal_itens i join pcp_programacao_lotes l on l.id=i.lote_id
 where l.status='ATIVO';
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-21_04_unidades_globais.sql','5d7a9ef9202472621496e573202b2714e4a52d45d85edd3780e3729915b0bd2d',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-21_04_unidades_globais.sql','5d7a9ef9202472621496e573202b2714e4a52d45d85edd3780e3729915b0bd2d','APLICAR',current_user,'APLICADA');
COMMIT;
