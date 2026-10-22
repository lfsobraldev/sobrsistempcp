-- NOVO AMBIENTE, após Fundação e 06. Não cria login/senha nem concede unidade a usuários.
-- Motivos/condições de pagamento sem cadastro persistente estão no CSV de implantação, não em tabelas paralelas.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:seed-minimo',0));
insert into pcp_empresas(codigo,razao_social) values('PCP_LEGADO','PCP legado') on conflict(codigo) do nothing;
insert into pcp_filiais(empresa_id,codigo,nome) select e.id,u.codigo,u.nome from pcp_empresas e cross join(values('SUL','Sul'),('NORDESTE','Nordeste')) u(codigo,nome) where e.codigo='PCP_LEGADO' on conflict(empresa_id,codigo) do nothing;
insert into pcp_permissoes(codigo,descricao) values('pcp.visualizar','Consultar PCP'),('pcp.apontar','Apontar produção'),('engenharia.aprovar','Aprovar engenharia'),('estoque.movimentar','Movimentar estoque') on conflict(codigo) do nothing;
insert into pcp_perfil_permissoes(perfil,permissao_codigo) values('PCP','pcp.visualizar'),('PCP','pcp.apontar'),('PCP','engenharia.aprovar'),('PCP','estoque.movimentar'),('GERENTE','pcp.visualizar') on conflict do nothing;
-- Catálogo não substitui a autorização das APIs. Não concede acesso a filiais automaticamente.
insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois)
 select current_user,'SEED_MINIMO','IMPLANTACAO','2026-10-22','{"semCredenciais":true}'::jsonb
 where not exists(select 1 from pcp_auditoria_global where acao='SEED_MINIMO' and entidade='IMPLANTACAO' and entidade_id='2026-10-22');
COMMIT;
