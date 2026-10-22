-- depends-on: 2026-10-21_fundacao_multiempresa.sql
-- migrate:up
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
-- migrate:down
-- Preserva dados, eventos e marcação. A consulta de arquivados continua disponível.
select 'Histórico e auditoria preservados' as resultado;
