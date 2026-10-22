-- GERADO do arquivo canônico 2026-10-22_11_transferencias_unidades.sql; SHA256 cf29fe2470a336e371176b8f736c8a8b27700184139c472f790f3ef88972f0a7
-- Destino: identidade. Dependências: 2026-10-22_10_ciclo_industrial.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-22_11_transferencias_unidades.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-22_11_transferencias_unidades.sql' and checksum<>'cf29fe2470a336e371176b8f736c8a8b27700184139c472f790f3ef88972f0a7') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Documento de trânsito central. Estoque continua nos ledgers operacionais de cada unidade.
create table if not exists est_transferencias_unidades(
 id uuid primary key,empresa_id uuid not null,filial_id uuid not null,filial_destino_id uuid not null,
 origem text not null check(origem in('SUL','NORDESTE')),destino text not null check(destino in('SUL','NORDESTE')),check(origem<>destino),
 requisicao jsonb not null,status text not null default 'PENDENTE_ENVIO' check(status in('PENDENTE_ENVIO','EM_TRANSITO','RECEBIDA')),
 custo_total numeric(20,6),movimento_origem bigint,movimento_destino bigint,criado_por text not null,criado_em timestamptz not null default now(),recebido_por text,recebido_em timestamptz,
 foreign key(filial_id,empresa_id) references pcp_filiais(id,empresa_id),foreign key(filial_destino_id,empresa_id) references pcp_filiais(id,empresa_id)
);
create index if not exists est_transfer_status on est_transferencias_unidades(status,criado_em desc);
create or replace function est_transfer_proteger() returns trigger language plpgsql as $$begin
 if tg_op='DELETE' then raise exception 'Transferência não pode ser apagada';end if;
 if new.requisicao<>old.requisicao or new.empresa_id<>old.empresa_id or new.filial_id<>old.filial_id or new.filial_destino_id<>old.filial_destino_id or new.origem<>old.origem or new.destino<>old.destino or (old.status='RECEBIDA' and new is distinct from old) or (old.status='EM_TRANSITO' and new.status not in('EM_TRANSITO','RECEBIDA')) then raise exception 'Transferência imutável ou transição inválida';end if;return new;end$$;
drop trigger if exists est_transfer_imutavel on est_transferencias_unidades;
create trigger est_transfer_imutavel before update or delete on est_transferencias_unidades for each row execute function est_transfer_proteger();
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-22_11_transferencias_unidades.sql','cf29fe2470a336e371176b8f736c8a8b27700184139c472f790f3ef88972f0a7',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-22_11_transferencias_unidades.sql','cf29fe2470a336e371176b8f736c8a8b27700184139c472f790f3ef88972f0a7','APLICAR',current_user,'APLICADA');
COMMIT;
