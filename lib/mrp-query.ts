/** Consulta apenas: OF-N é a referência explícita do ledger de estoque existente. */
export const MRP_QUERY = `with por_of as (
 select o.numero,m.produto_id,m.necessidade,
 coalesce(sum(case when v.tipo='SAIDA' then v.quantidade_base else 0 end),0) consumido,
 greatest(0,coalesce(sum(case when v.tipo='RESERVA' then v.quantidade_base when v.tipo='LIBERA_RESERVA' or (v.tipo='SAIDA' and v.baixa_reserva) then -v.quantidade_base else 0 end),0)) reservado
 from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id
 left join est_movimentos v on v.produto_id=m.produto_id and v.of='OF-'||o.numero::text
 where o.status='LIBERADA' group by o.numero,m.produto_id,m.necessidade
),demanda as (
 select produto_id,sum(greatest(0,necessidade-consumido)) quantidade,
 sum(least(greatest(0,necessidade-consumido),reservado)) reservado_of from por_of group by produto_id
),saldo as (
 select produto_id,sum(fisico-reservado-bloqueado) disponivel,sum(reservado) reservado from est_saldos group by produto_id
)
select p.id,p.codigo,p.descricao,p.unidade_base,d.quantidade,
 coalesce(s.disponivel,0)+least(d.reservado_of,coalesce(s.reservado,0)) disponivel,
 greatest(0,d.quantidade-coalesce(s.disponivel,0)-least(d.reservado_of,coalesce(s.reservado,0))) necessidade_liquida
 from demanda d join est_produtos p on p.id=d.produto_id left join saldo s on s.produto_id=d.produto_id
 order by p.codigo limit 50 offset $1`;
