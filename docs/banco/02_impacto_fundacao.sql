-- Somente leitura; executar após conferir existência das tabelas indicadas.
BEGIN TRANSACTION READ ONLY;
select e.codigo empresa,f.codigo unidade,f.id filial_id,f.ativo from pcp_empresas e join pcp_filiais f on f.empresa_id=e.id order by e.codigo,f.codigo;
select * from erp_identidade_banco;
select competencia,status,count(*) from pcp_programacao_competencias group by competencia,status order by competencia,status;
select codigo,count(*) quantidade from crm_clientes where codigo<>'' group by codigo having count(*)>1;
select pedido,count(distinct crm_cliente_id) clientes from pcp_controle_entregas group by pedido having count(distinct crm_cliente_id)>1;
COMMIT;
