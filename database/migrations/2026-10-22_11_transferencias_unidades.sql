-- depends-on: 2026-10-22_10_ciclo_industrial.sql
-- scope: identity
-- migrate:up
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
-- migrate:down
-- Não apaga documentos ou movimentos em trânsito.
select 'Transferências preservadas; desative a flag de ciclo industrial' as resultado;
