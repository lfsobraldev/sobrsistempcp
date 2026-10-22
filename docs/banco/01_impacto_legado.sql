-- SOMENTE LEITURA, após confirmar o schema-base no precheck.
BEGIN TRANSACTION READ ONLY;
select date_trunc('month',data_programacao)::date competencia,status,count(*) programacoes from pcp_programacoes group by 1,2 order by 1,2;
select g.cliente,p.pedido,count(*) itens,sum(p.quantidade) quantidade from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id group by g.cliente,p.pedido order by p.pedido;
select perfil,count(*) usuarios from pcp_usuarios group by perfil order by perfil;
-- Perfis COMERCIAL/LOGISTICA/SAC já presentes exigem baseline da migração quality_user; reaplicá-la pode falhar na constraint antiga.
select count(*) produtos,sum(quantidade) quantidade_legada from pcp_produtos;
select count(*) operacoes,sum(quantidade_produzida) boa,sum(quantidade_refugo) refugo from pcp_operacoes;
COMMIT;
