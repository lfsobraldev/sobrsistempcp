-- GERADO do arquivo canônico 2026-10-09_tipo_pedido_embalagem.sql; SHA256 dbced338019029687344b9b65fb0c73eb43e161ae81c05d107e2f526f19c8a54
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-09_tipo_pedido_embalagem.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-09_tipo_pedido_embalagem.sql' and checksum<>'dbced338019029687344b9b65fb0c73eb43e161ae81c05d107e2f526f19c8a54') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Classificação de pedido para regras especiais de embalagem
alter table pcp_produtos
  add column if not exists tipo_pedido varchar(20) not null default 'NORMAL';

update pcp_produtos
set tipo_pedido = 'NORMAL'
where tipo_pedido is null
   or upper(tipo_pedido) not in ('NORMAL','REVENDA','ENGENHARIA');

create index if not exists ix_pcp_prod_tipo_pedido
  on pcp_produtos(programacao_id, pedido, tipo_pedido);


alter table pcp_produtos
  add column if not exists montagem_engenharia varchar(30) not null default 'MONTADO_HS';

update pcp_produtos
set montagem_engenharia = 'MONTADO_HS'
where montagem_engenharia is null
   or upper(montagem_engenharia) not in ('MONTADO_HS','MONTADO_TIMADEL','MONTADO_ESTANCIA');
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-09_tipo_pedido_embalagem.sql','dbced338019029687344b9b65fb0c73eb43e161ae81c05d107e2f526f19c8a54',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-09_tipo_pedido_embalagem.sql','dbced338019029687344b9b65fb0c73eb43e161ae81c05d107e2f526f19c8a54','APLICAR',current_user,'APLICADA');
COMMIT;
