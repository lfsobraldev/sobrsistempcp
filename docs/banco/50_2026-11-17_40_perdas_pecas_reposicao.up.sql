-- GERADO do arquivo canônico 2026-11-17_40_perdas_pecas_reposicao.sql; SHA256 ec0703258cb1ba96a63b9c6529bafe1b1f9eaf9eb1f27d3b316133aaa62cdd22
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-16_39_planta_layout_movimentacao.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-17_40_perdas_pecas_reposicao.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-17_40_perdas_pecas_reposicao.sql' and checksum<>'ec0703258cb1ba96a63b9c6529bafe1b1f9eaf9eb1f27d3b316133aaa62cdd22') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Ciclo único de perda de peça: registro com motivo obrigatório, decisão com dono, reposição e peça extraviada.
-- Também cadastra família -> responsável (embalagem por família, cada família com uma pessoa).

create table if not exists pcp_perda_motivos(
 codigo varchar(30) primary key,
 nome varchar(120) not null,
 categoria varchar(20) not null check(categoria in('MAQUINA','MATERIAL','MEDIDA','MANUSEIO','PROJETO','EXTRAVIO','OUTRO')),
 ativo boolean not null default true
);
insert into pcp_perda_motivos(codigo,nome,categoria) values
 ('MAQ_AJUSTE','Máquina fora de ajuste','MAQUINA'),
 ('MAQ_FALHA','Falha de máquina','MAQUINA'),
 ('MAT_DEFEITO','Defeito no material','MATERIAL'),
 ('MAT_ACABAMENTO','Acabamento/cor fora do padrão','MATERIAL'),
 ('MED_ERRADA','Medida errada','MEDIDA'),
 ('MANUSEIO','Dano no manuseio','MANUSEIO'),
 ('PROJ_ERRO','Erro de projeto/cadastro','PROJETO'),
 ('EXTRAVIO','Peça extraviada','EXTRAVIO'),
 ('OUTRO','Outro motivo','OUTRO')
on conflict(codigo) do nothing;

create table if not exists pcp_familia_responsaveis(
 familia varchar(80) primary key,
 responsavel varchar(160) not null,
 atualizado_por varchar(160) not null default '',
 atualizado_em timestamptz not null default now()
);

create table if not exists pcp_perdas_pecas(
 id uuid primary key default gen_random_uuid(),
 numero bigserial unique,
 pedido varchar(60) not null,
 peca varchar(120) not null,
 of varchar(80) not null default '',
 setor varchar(30) not null default '',
 quantidade numeric(16,3) not null default 1 check(quantidade>0),
 motivo varchar(30) not null references pcp_perda_motivos(codigo),
 classe varchar(12) not null check(classe in('REFUGO','RETRABALHO','EXTRAVIADA')),
 status varchar(12) not null default 'ABERTA' check(status in('ABERTA','DECIDIDA','REPOSICAO','FECHADA','CANCELADA')),
 decisao varchar(12) check(decisao in('REPOR','RETRABALHAR','ACEITAR')),
 responsavel varchar(160) not null default '',
 prazo date,
 obs varchar(500) not null default '',
 criado_por varchar(160) not null,
 criado_em timestamptz not null default now(),
 decidido_por varchar(160) not null default '',
 decidido_em timestamptz,
 fechado_por varchar(160) not null default '',
 fechado_em timestamptz,
 check(status<>'FECHADA' or fechado_em is not null)
);
create index if not exists ix_perdas_pecas_pedido on pcp_perdas_pecas(pedido);
create index if not exists ix_perdas_pecas_status on pcp_perdas_pecas(status,criado_em desc);

create table if not exists pcp_perdas_pecas_eventos(
 id bigserial primary key,
 perda_id uuid not null references pcp_perdas_pecas(id),
 evento varchar(20) not null,
 detalhe varchar(500) not null default '',
 por varchar(160) not null,
 em timestamptz not null default now()
);
create index if not exists ix_perdas_pecas_ev on pcp_perdas_pecas_eventos(perda_id,em);
create or replace function pcp_perdas_ev_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Histórico de perda é imutável';end$$;
drop trigger if exists pcp_perdas_ev_imutavel_t on pcp_perdas_pecas_eventos;
create trigger pcp_perdas_ev_imutavel_t before update or delete on pcp_perdas_pecas_eventos for each row execute function pcp_perdas_ev_imutavel();

create or replace function pcp_perda_abrir(p_pedido text,p_peca text,p_of text,p_setor text,p_qtd numeric,p_motivo text,p_classe text,p_obs text,p_ator text) returns bigint language plpgsql as $$
declare v_id uuid;v_num bigint;
begin
 if coalesce(trim(p_pedido),'')='' or coalesce(trim(p_peca),'')='' then raise exception 'Informe pedido e peça';end if;
 if not exists(select 1 from pcp_perda_motivos where codigo=upper(trim(p_motivo)) and ativo) then raise exception 'Motivo inválido';end if;
 if upper(p_classe) not in('REFUGO','RETRABALHO','EXTRAVIADA') then raise exception 'Classe inválida';end if;
 if upper(p_classe)='EXTRAVIADA' and upper(trim(p_motivo))<>'EXTRAVIO' then raise exception 'Peça extraviada exige o motivo EXTRAVIO';end if;
 if upper(trim(p_motivo))='OUTRO' and length(trim(coalesce(p_obs,'')))<5 then raise exception 'Descreva o motivo (mínimo 5 caracteres)';end if;
 insert into pcp_perdas_pecas(pedido,peca,of,setor,quantidade,motivo,classe,obs,criado_por,prazo)
  values(trim(p_pedido),trim(p_peca),coalesce(trim(p_of),''),coalesce(upper(trim(p_setor)),''),coalesce(nullif(p_qtd,0),1),upper(trim(p_motivo)),upper(p_classe),coalesce(p_obs,''),p_ator,
   case when upper(p_classe)='EXTRAVIADA' then current_date+2 else null end)
  returning id,numero into v_id,v_num;
 insert into pcp_perdas_pecas_eventos(perda_id,evento,detalhe,por) values(v_id,'ABERTA',upper(p_classe)||' · '||upper(trim(p_motivo)),p_ator);
 return v_num;
end$$;

create or replace function pcp_perda_decidir(p_numero bigint,p_decisao text,p_responsavel text,p_prazo date,p_obs text,p_ator text) returns void language plpgsql as $$
declare r pcp_perdas_pecas;
begin
 select * into r from pcp_perdas_pecas where numero=p_numero for update;
 if not found then raise exception 'Perda não encontrada';end if;
 if r.status not in('ABERTA','DECIDIDA') then raise exception 'Perda já encerrada ou em reposição';end if;
 if upper(p_decisao) not in('REPOR','RETRABALHAR','ACEITAR') then raise exception 'Decisão inválida';end if;
 if upper(p_decisao)<>'ACEITAR' and (coalesce(trim(p_responsavel),'')='' or p_prazo is null) then raise exception 'Informe responsável e prazo';end if;
 if upper(p_decisao)='ACEITAR' and length(trim(coalesce(p_obs,'')))<5 then raise exception 'Justifique o aceite (mínimo 5 caracteres)';end if;
 update pcp_perdas_pecas set decisao=upper(p_decisao),responsavel=coalesce(trim(p_responsavel),''),prazo=p_prazo,decidido_por=p_ator,decidido_em=now(),
   status=case when upper(p_decisao)='REPOR' then 'REPOSICAO' when upper(p_decisao)='ACEITAR' then 'FECHADA' else 'DECIDIDA' end,
   fechado_por=case when upper(p_decisao)='ACEITAR' then p_ator else '' end,fechado_em=case when upper(p_decisao)='ACEITAR' then now() end
  where id=r.id;
 insert into pcp_perdas_pecas_eventos(perda_id,evento,detalhe,por) values(r.id,'DECIDIDA',upper(p_decisao)||coalesce(' · '||nullif(trim(p_obs),''),''),p_ator);
end$$;

create or replace function pcp_perda_fechar(p_numero bigint,p_obs text,p_ator text) returns void language plpgsql as $$
declare r pcp_perdas_pecas;
begin
 select * into r from pcp_perdas_pecas where numero=p_numero for update;
 if not found then raise exception 'Perda não encontrada';end if;
 if r.status in('FECHADA','CANCELADA') then raise exception 'Perda já encerrada';end if;
 if r.status='ABERTA' then raise exception 'Decida antes de fechar';end if;
 update pcp_perdas_pecas set status='FECHADA',fechado_por=p_ator,fechado_em=now() where id=r.id;
 insert into pcp_perdas_pecas_eventos(perda_id,evento,detalhe,por) values(r.id,'FECHADA',coalesce(p_obs,''),p_ator);
end$$;

-- Painel: abertas, vencidas, por motivo e por setor
create or replace view pcp_v_perdas_pecas as
 select p.*,m.nome motivo_nome,m.categoria,
        case when p.status in('ABERTA','DECIDIDA','REPOSICAO') and p.prazo is not null and p.prazo<current_date then true else false end vencida,
        greatest(0,(current_date-p.criado_em::date))::int dias_aberta
   from pcp_perdas_pecas p join pcp_perda_motivos m on m.codigo=p.motivo;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-17_40_perdas_pecas_reposicao.sql','ec0703258cb1ba96a63b9c6529bafe1b1f9eaf9eb1f27d3b316133aaa62cdd22',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-17_40_perdas_pecas_reposicao.sql','ec0703258cb1ba96a63b9c6529bafe1b1f9eaf9eb1f27d3b316133aaa62cdd22','APLICAR',current_user,'APLICADA');
COMMIT;
