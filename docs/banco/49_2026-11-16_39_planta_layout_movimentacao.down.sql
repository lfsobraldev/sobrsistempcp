-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
create or replace view wms_v_localizador as
 select 'PALLET'::text tipo, p.id::text ref, p.codigo codigo, ('Pallet ' || p.codigo)::text descricao, coalesce(p.quantidade,0)::numeric quantidade,
        p.pedido::text pedido, pp.endereco_id, pp.desde
   from pcp_pallets p join wms_pallet_posicoes pp on pp.pallet_id=p.id
 union all
 select 'SOBRA', s.id::text, ('S' || s.numero)::text,
        trim(concat_ws(' ', s.descricao, nullif(s.medida,''), nullif(s.material,''), nullif(s.acabamento,''), nullif(s.mao,'')))::text,
        s.quantidade, s.origem_pedido::text, s.endereco_id, s.criado_em
   from wms_sobras s where s.status in('DISPONIVEL','RESERVADA') and s.endereco_id is not null
 union all
 select 'ESTOQUE', pr.id::text, pr.codigo::text, pr.descricao::text, es.quantidade, ''::text, es.endereco_id, es.atualizado_em
   from est_endereco_saldos es join est_produtos pr on pr.id=es.produto_id where es.quantidade>0;
drop function if exists wms_mover(text,text,text,text,text,text);
drop table if exists wms_movimentacoes;
drop table if exists wms_peca_posicoes;
drop function if exists wms_layout_salvar(text,jsonb,text);
drop table if exists wms_layout_blocos;
drop table if exists wms_plantas;
COMMIT;
