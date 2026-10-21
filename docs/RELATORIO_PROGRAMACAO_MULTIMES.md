# Programação mensal por unidade — entrega de 21/10/2026

## Diagnóstico confirmado

`main`, `programacao-config-migracoes` e `programacao-multimes` apontavam para dd0d5ee no início. As três páginas mensais continham números fixos e controles sem comportamento. A integração Vercel informou sucesso de deployment para esse commit, portanto a ausência de funcionalidades não era apenas falta de publicação.

Não há CSV de exemplo versionado (`git ls-files '*.csv'` vazio). As colunas foram levantadas no leitor Consistem existente: filtro, pedido, item, produto, descrição, quantidade de peças, OF. Data é opcional no novo planejamento; quando disponível deve estar em DD/MM/AAAA ou AAAA-MM-DD. Não se presume que o arquivo inexistente tivesse determinada competência.

## Implementado e reaproveitado

- Leitor CSV/XLSX e conversão de números brasileiros de `lib/import-reader.ts`, sem substituir o parser industrial `lib/filter-parser.ts`.
- Páginas Sul, Nordeste e consolidado agora compartilham um componente funcional, sem dados fictícios: mês anterior/próximo, todos os meses, seleção múltipla, busca, filtros locais salvos, gráfico de evolução, comparativo, ordenação e paginação de 50 linhas no servidor.
- Exportações CSV e XLSX no servidor, auditadas e limitadas a 10.000 linhas; CSV protege fórmulas de planilha.
- Prévia com erros/avisos por linha, sugestão de competência, confirmação, hash SHA-256 e chaves naturais. Máximo 4 MB/10.000 linhas por lote. O servidor revalida o arquivo na confirmação. Prévia exibe as primeiras 100 ocorrências/linhas com totais completos.
- Lotes por filial/competência, modos acrescentar/substituir, histórico dos últimos 50 lotes e desfazer do mais recente para o mais antigo. Reenvio de arquivo desfeito retorna o lote original; para recuperar sua versão é preciso desfazer os posteriores ou revisar o arquivo, sem reutilização silenciosa da chave.
- Funções Postgres usam lock transacional por filial/mês; lote, itens e auditoria são atômicos. A ordem sequencial dos lotes resolve a precedência independentemente de timestamps concorrentes.
- Dados antigos são projetados diretamente de `pcp_programacoes`/`pcp_produtos`; não são copiados, apagados ou alterados. Competência deriva da data real da programação. Unidade legada assumida: Sul. Programações PREPARANDO não aparecem.
- Planejamento mensal permanece separado da liberação para a fábrica: importar previsão não cria operações, OFs, pallets ou romaneios. O botão de liberação leva ao fluxo original. Integração automática de demanda planejada com OF/MRP é evolução posterior.
- RBAC reaproveita sessão/perfis atuais e vínculos empresa/filial da fundação. PCP grava; PCP/GERENTE/ENCARREGADO consultam apenas filiais autorizadas. Consolidado exige Sul e Nordeste. Contas administrativas de ambiente (`PCP_USER`/`ADMIN_USER`, com perfil PCP) têm escopo global explícito. Demais contas sem vínculo não recebem escopo implícito.
- CI passa a verificar todas as alterações de main/programacao-multimes, com `npm ci`, teste/build, sem commits automáticos no lockfile.

## Migrações: ordem obrigatória

Somente arquivos gerados; nada executado em Neon/produção. Todas as demais migrações de negócio existentes devem ser avaliadas no ambiente de homologação.

1. `2026-10-21_fundacao_multiempresa.sql`: empresas/filiais/vínculos/auditoria (já existente). Depende do schema base e usuários.
2. `2026-10-21_02_schema_migrations.sql`: catálogo administrativo existente, quando necessário.
3. `2026-10-21_03_programacao_multimes.sql`: tabelas de lote/itens/escopo, projeções e funções transacionais. Executar apenas seção `migrate:up`. O catálogo administrativo agora respeita `depends-on` e ordena a fundação antes da migração 03; também recusa dependências ausentes e ciclos. Scripts externos devem seguir a mesma dependência.

A seção `down` é lógica: desativa lotes e restaura a projeção legada sem DROP/DELETE. Registra auditoria global por lote e deve ser executada como manutenção controlada e registrada no catálogo pelo operador; não é o desfazer operacional de um lote (que tem auditoria global atômica). Uma reaplicação do up não reativa lotes desfeitos. A empresa técnica `PCP_LEGADO` e suas duas filiais são criadas idempotentemente, sem modificar empresas existentes.

Para conceder acesso a uma conta legada não administrativa, o administrador pode executar no ambiente escolhido:

```sql
insert into pcp_programacao_acessos(usuario,filial_id)
select 'LOGIN_DO_USUARIO', f.id from pcp_filiais f
join pcp_empresas e on e.id=f.empresa_id
where e.codigo='PCP_LEGADO' and f.codigo='SUL'
on conflict do nothing;
```

Usuários já vinculados à fundação seguem `pcp_usuario_empresas`/`pcp_usuario_filiais`. Para a visão consolidada conceder ambas as unidades. Alterações administrativas de grants por SQL devem seguir o procedimento de auditoria do operador; não foi criada uma interface de administração de grants nesta entrega.

## Validar manualmente — outubro de 2026

1. Aplicar up das dependências e da migração 03 em homologação, com backup e confirmação do banco correto. Não executar o arquivo inteiro incluindo down.
2. Entrar como PCP administrativo. Abrir `/programacao/sul`; selecionar 2026-10. Conferir valores legados do banco, sem exemplos fixos.
3. Enviar arquivo CSV/XLSX real ou montar amostra com cabeçalho `Filtro;Pedido;Item;Produto;Descricao;Quantidade Pecas;Data` e linha `F01;00042;1;0007;Batente;12,5;01/10/2026`.
4. Validar e conferir prévia; confirmar acrescentar. Reenviar arquivo idêntico e verificar ausência de duplicação.
5. Importar novembro/Sul e outubro/Nordeste; conferir isolamento, visão consolidada e evolução mensal.
6. Importar arquivo diferente no modo substituir outubro/Sul; verificar ocultação reversível da versão anterior. Desfazer último lote e conferir restauração.
7. Com usuário só Sul, tentar Nordeste e consolidado (403). Perfil sem acesso ao módulo deve ser recusado.
8. Exportar CSV/XLSX e conferir auditoria, quantidade, zeros iniciais e filtros. Conferir paginação com mais de 50 linhas.
9. Testar pallets, QR, rastreio, importação industrial e liberação existentes, que não foram modificados.

## Verificação automatizada

Suite completa: 118 testes aprovados, incluindo Postgres embutido isolado (PGlite), idempotência do up, substituição/undo, escopo temporal/unidades, auditoria imutável e rollback integral quando auditoria falha. Nenhum teste acessa banco de produção. Script npm test utiliza o loader oficial do tsx pelo Node, evitando socket IPC desnecessário no ambiente de execução. `npm run build` aprovado; único aviso existente: convenção middleware depreciada. `npx tsc --noEmit` aprovado.

## Limitações e riscos concretos

- A classificação Sul de todo legado é uma suposição operacional a homologar antes da migração. Nenhuma informação disponível permite inferir outra unidade com segurança.
- Programações históricas encerradas continuam incluídas. Se há reenvios históricos do mesmo filtro como snapshots completos, seus totais devem ser reconciliados antes de usar como demanda acumulada; os registros não são excluídos automaticamente.
- Data vencida indica somente data planejada passada; não é indicador confirmado de atraso, pois o plano mensal não tem status de execução por linha.
- Alterar quantidade com a mesma chave no modo acrescentar não sobrescreve o dado existente; usar substituição explícita e revisar a prévia. Campos OF/data/descrição distinguem linhas na chave natural.
- Filtros salvos são preferências locais do navegador, sem sincronização entre contas/dispositivos. Histórico tem janela de 50 lotes; exportação tem limite explícito.
- Não houve homologação visual com sessão real nem teste com o CSV operacional ausente do repositório. Testes de SQL são locais e não substituem homologação em Neon.
- Esta entrega completa o planejamento mensal descrito acima; não representa implementação de todo o escopo de SAP/Oracle/Dynamics (financeiro, fiscal, compras e manutenção continuam pendentes).
- Publicação de código e aplicação de migração são etapas distintas. Enquanto a migração não for aplicada, o módulo retorna aviso 503 sem alterar o banco. Fluxos anteriores seguem disponíveis.

## Publicação

Trabalho mantido em `programacao-multimes`; sem merge na main, conforme regra fornecida. A integração GitHub/Vercel pode gerar preview da branch. Publicação em produção sem merge exige promover esse deployment na Vercel. O status efetivo e links serão reportados após o push; não se presume sucesso por apenas enviar commit.
