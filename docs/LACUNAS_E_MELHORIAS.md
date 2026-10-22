# Lacunas e melhorias — auditoria de 22/10/2026

Base de publicação: `origin/main` b8259b27887240bc48a3fd3ec2fa29a7c1fc0e79. Comparação com a branch enviada `erp-rodada-b-producao` 2eb25a6e2e7b356c714c01f4bfbd0edb6a390162: 105 arquivos / 2484 inserções / 425 remoções ainda fora da main. Busca autenticada GitHub: nenhum PR aberto localizado; links anteriores são links para criar PR. Não encadear a nova branch sobre essas entregas. Reaproveitar o diff existente numa branch criada da main, sem reimplementar conceitos.

A classificação compara o escopo integral solicitado, não apenas a presença de uma tela. **Nenhum módulo foi classificado completo sem evidência de fluxo e testes.** Situação do banco remoto desconhecida; não consultado. Auditoria estática, não pen-test, nem homologação navegada completa.

| Módulo | Estado | Evidência existente | Lacuna | Etapa |
| --- | --- | --- | --- | --- |
| Engenharia | Parcial | BOM aprovada/versionada; roteiro/versão nas branches pendentes | Substitutos operacionais, onde-é-usado, homologação das revisões | 2.1 |
| PCP | Parcial | Programação e painel existentes; filtros ampliados nas branches | Fechar recorte em todas as consultas e integração pedido/demanda/MRP | 2.1/2.5 |
| Produção/Apontamento | Parcial | Apontamento legado; ciclo/filhas/reservas/estorno/PWA pendentes de integração | Homologação navegada, retrabalho/paradas no custo e fechamento do ciclo | 2.1 |
| Estoque | Parcial | Produtos, depósitos, saldo, ledger, inventário; lotes/custos nas branches | Endereçamento, política de reposição, ABC/XYZ e ajustes aprovados | 2.4 |
| Compras | Ausente | Não encontrado fluxo persistente de compras | Fornecedor, solicitação, cotação, pedido, alçada, recebimento/XML e portal | 2.4 |
| Terceirização | Ausente | Chave de operação externa prevista nas branches | Remessa, retorno, conferência, saldo em terceiros e custo de serviço | 2.4 |
| Qualidade/Medições | Parcial | Medições versionadas, SAC e Qualidade/MSAC de pallets | Planos/amostragem, SPC, instrumentos/calibração, CAPA e certificado | 2.3 |
| Vendas/Pedidos | Parcial | CRM/propostas, carteira e controle de entregas | Pedido formal completo, crédito, ATP, preços vigentes, desconto/alçada e importação | 2.2 |
| Representantes/Comissões | Parcial | Representante/vínculos e percentual simples | Carteira restrita, regras de comissão/eventos/estorno/metas e contas a pagar | 2.2 |
| CRM/Marketing | Parcial | Clientes, oportunidades, contatos, propostas e campanhas | Cadastro comercial completo, atribuição e integração com pedido/faturamento | 2.2 |
| Expedição/Logística | Parcial | Romaneio, QR, pallets, entregas e carregamentos | Carga persistida ponta a ponta, confirmação de recebimento e devolução | 2.2/2.8 |
| Custos | Parcial | Material real/PEPS nas branches; estimativas de capacidade | Mão de obra/máquina/terceiros, padrão versionado e variações | 2.5 |
| Financeiro | Ausente | Nenhum título/baixa persistente localizado | Pagar/receber, caixa, conciliação e boleto/PIX por adaptador | 2.7 |
| Contábil | Ausente | Sem razão/partidas contábeis | Plano de contas, lançamentos balanceados, DRE/balancete e validação do contador | 2.7 |
| Fiscal | Ausente | NF apenas como referência logística | Cadastros/regras vigentes, adaptadores de documentos, XML e exportação; homologação fiscal | 2.6 |
| Manutenção | Ausente | Andon/perdas não equivalem a manutenção | Ativos, planos, ordens, peças, MTBF/MTTR | 2.7 |
| Documentos | Parcial | Instrução textual congelada na branch B; anexos pontuais | Repositório controlado com revisão/aprovação/acesso e vínculos | 2.7 |
| Notificações | Parcial | Preferências/alertas pontuais | Central persistente, tarefas, outbox/retry e entrega | 2.7 |
| Dashboards | Parcial | Painéis industriais existentes | KPIs por papel conciliados com eventos comerciais/financeiros e testes | 2.7 |
| IA | Parcial | Ferramentas tipadas consultivas e endpoints de ação separados | Auditoria/RBAC de todas ferramentas, limite distribuído, isolamento e testes de vazamento | 2.7/2.8 |
| Administração | Parcial | Login/unidades/acessos/configurações e catálogo de migrações | Executor documentado não implementado; baseline, escopo por banco e bloqueio por checksum | 2.8/3 |
| Integrações | Parcial | Importações/exportações e integração Consistem | OpenAPI, webhooks assinados, jobs idempotentes e health check | 2.7 |

## Priorização

| ID | Prioridade | Achado e evidência | Tratamento / critério de fechamento |
| --- | --- | --- | --- |
| SEG-01 | Crítico | Ledger/OF/reservas não integrados à main; acabamento sem baixa pode divergir | Consolidar código existente e executar ciclo local; nunca anunciar integração de produção sem implantação/homologação |
| DB-01 | Crítico | `migration-service.ts` não executa SQL; arquivos antigos sem marcador resultam em up nulo; documentação promete aplicação/baseline | Catálogo puro testado, pacote completo, status honesto e bloqueio de executor incompleto; não expor sucesso fictício |
| DB-02 | Alto | Todas as migrações juntas nunca foram testadas; schema legado/runtime DDL tem pré-requisitos implícitos | Aplicar catálogo em dois bancos locais descartáveis, verificar preservação e idempotência; registrar incompatibilidades |
| SEG-02 | Alto | API de apontamento tratava líder sem setor como irrestrito; correção está em branch | Reaproveitar correção e testes; revisar IDOR por documento/ação além da barreira de unidade |
| SEG-03 | Alto | `npm audit` encontrou xlsx alto e csv-parse/exceljs/uuid moderados | Substituir parser vulnerável sem remover formatos silenciosamente; fixture real e testes de exportação/importação |
| SEG-04 | Alto | QR público sem revogação individual e limite persistente | Token por pallet revogável e rate limit distribuído, sem quebrar rastreio legado; teste por unidade |
| NEG-01 | Alto | Pedido/cliente/representante ainda em texto em parte do legado | Resolver ID/código unívoco, não adivinhar nomes; saneamento aprovado e consultas de impacto |
| NEG-02 | Alto | Compras, comissões, financeiro/fiscal completos ausentes | Implementar transações e eventos de negócio nas etapas, não criar abas demonstrativas |
| SEG-05 | Alto | LGPD: fotos/documentos e dados de contatos no banco; retenção/anonimização não definidas | Definir finalidade/acesso/retenção com responsável; não alegar conformidade só por RBAC |
| PERF-01 | Médio | Rotas antigas com SELECT amplo/limite fixo, subconsultas correlacionadas e bootstrap DDL | Paginar por cursor/página no servidor; medir EXPLAIN apenas em local/homologação; índices após evidência |
| UX-01 | Médio | Tabelas extensas, campos UUID e nomenclatura técnica em ações do ciclo | Seletores por nome/código, fluxo guiado, acessibilidade por teclado, responsivo e estados vazios |
| TEST-01 | Alto | Testes SQL locais existem, mas sem Playwright completo/câmera real ou concorrência multi-conexão remota | E2E local com fixtures, depois homologação presencial; não usar Neon nesta tarefa |
| ERR-01 | Médio | Erros legados podem revelar detalhes SQL e endpoints têm padrões divergentes | Envelope comum, mensagem acionável e correlação/log sem segredos; migração ausente vira 503 |
| DOC-01 | Alto | Inventário histórico chama itens pendentes de criado e painel parece funcional | Seções novas prevalecem; relatório por módulo distingue código existente, enviado, integrado e implantado |
| CI-01 | Médio | CI com paths/lockfile precisa revisão; observabilidade/health incompletos | CI sem atualizar lockfile automaticamente, testes/tipos/build e logs estruturados |
| UX-02 | Baixo | Tema, i18n e atalhos não uniformes | Backlog após integridade e fluxo operacional, com revisão de contraste/labels e mobile |

## Ordem de execução

1. Consolidar sem encadear as entregas já existentes; fechar ciclo principal (2.1) e remover risco de perda/inconsistência.
2. Segurança/integridade: autorização/IDOR, QR, catálogo/implantação e dependências vulneráveis (2.8).
3. Comercial → qualidade → suprimentos → MRP/custos, reaproveitando entidades (2.2–2.5).
4. Fiscal por provedor e financeiro/contábil com contador; manutenção e transversais (2.6–2.7).
5. Pacote do banco e smoke test completo somente após gates; implantação presencial pelo administrador. Nada será executado remotamente pelo agente.

## Auditoria de dependências

`npm audit --json` executado em 22/10/2026: 4 vulnerabilidades (1 alta, 3 moderadas), zero críticas. xlsx alto sem correção disponível no registry; csv-parse moderado com correção major; exceljs/uuid moderados. Não usar `npm audit fix --force`. Resultado bruto será preservado no pacote de evidências; achados não significam exploração confirmada.

## Tratamento neste incremento (não encerra o escopo integral)

- SEG-01/SEG-02: código pendente consolidado sobre main; regressões locais do ciclo e setores aprovadas. Implantação/homologação reais ainda pendentes.
- DB-01: catálogo e autorização corrigidos; executor fictício bloqueado e procedimento real descrito. Executor automático ainda não existe e não foi anunciado pronto.
- DB-02: 23 migrações passaram localmente em sequência e reaplicação, em vazio+baseline e legado sintético; pacote up/verify/histórico/seed/baseline testado. Banco real permanece desconhecido.
- SEG-03: dependências atualizadas com fontes oficiais, audit posterior zero; formatos antigos preservados. Evidências JSON no pacote.
- DOC-01: relatório/pacote/progresso distinguem entregue, código consolidado e pendente. Nenhum módulo ausente virou tela demonstrativa.
- Demais achados críticos/altos não foram todos fechados; especialmente QR/limites, comercial/financeiro e e2e completos. Não liberar a promessa de ERP integral com base só nesta branch.
