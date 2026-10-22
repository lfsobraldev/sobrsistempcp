-- GERADO do arquivo canônico 2026-10-22_09_historico_seguro.sql; SHA256 1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-21_fundacao_multiempresa.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_09_historico_seguro.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_09_historico_seguro.sql' and checksum<>'1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
alter table pcp_programacoes add column if not exists arquivada boolean not null default false;
alter table pcp_programacoes add column if not exists arquivada_em timestamptz;
alter table pcp_programacoes add column if not exists arquivada_por text;
create or replace function pcp_arquivar_historico(p_ator text) returns integer language plpgsql as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('pcp:arquivar-historico',0));
 with alteradas as(update pcp_programacoes set arquivada=true,arquivada_em=clock_timestamp(),arquivada_por=p_ator where status<>'ATIVA' and not arquivada returning *)
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select p_ator,'ARQUIVAR','PROGRAMACAO',id::text,to_jsonb(alteradas) from alteradas;
 get diagnostics n=row_count;
 return n;
end$$;
create or replace function pcp_arquivar_programacao(p_id uuid,p_ator text) returns boolean language plpgsql as $$
begin
 with alterada as(update pcp_programacoes set status=case when status='ATIVA' then 'ENCERRADA' else status end,arquivada=true,arquivada_em=clock_timestamp(),arquivada_por=p_ator where id=p_id and not arquivada returning *)
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select p_ator,'ARQUIVAR','PROGRAMACAO',id::text,to_jsonb(alterada) from alterada;
 return found;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_09_historico_seguro.sql','1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_09_historico_seguro.sql','1f300fa902d93e1063ba564065afadbafe40aa8a2440ec7654e3181a97f6f7d9','APLICAR',current_user,'APLICADA');
COMMIT;
