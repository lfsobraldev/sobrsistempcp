# Integração do ERP — trabalho em preparação, sem publicação

## Objetivo e estado real

Solicitação: mesmo ERP para Sul e Nordeste, com dados operacionais diferentes em todos os módulos, acesso por login e consolidado para gestão, seguido da expansão de toda a cadeia industrial. Uma única publicação final, sem publicar etapas intermediárias.

Base: main/9eb39cd (inclui PR 61). Branch de integração: `erp-unidades-integracao`. Auto-deploy desativado somente para essa branch em `vercel.json`; não altera a publicação automática da main nem de outras branches. Não foi solicitada desativação global de deploys de outros colaboradores.

**Este trabalho ainda não é o ERP completo solicitado. Não liberar a branch como produto pronto.** Não houve migração do banco real nem homologação com contas reais das duas unidades. As configurações de produção foram consultadas somente como metadados, sem descriptografar segredos; existe DATABASE_URL e não existem conexões específicas das unidades. A integração Vercel é acessível usando projectId sem filtro adicional de equipe; a falha 403 anterior estava associada ao filtro de equipe.

## Correção implementada no código

- Contexto global imutável de unidade por requisição usando AsyncLocalStorage; todas as APIs operacionais existentes passam pela barreira de unidade. Mesmos componentes, rotas e regras, com um banco operacional por unidade; não clonar o projeto nem implementar módulos paralelos Sul/Nordeste.
- `sql()` continua preservando o contrato nativo Neon, inclusive transações e promises adiadas. Quando multiunidade está habilitada, acesso sem contexto falha; não há fallback silencioso para o banco legado.
- Identidade e grants são consultados no banco central, reaproveitando `pcp_usuarios`, `pcp_usuario_empresas` e `pcp_usuario_filiais`. A seleção usa cookie HMAC vinculado ao login, expiração e revalidação de grant em cada requisição.
- Credenciais de operação por unidade são resolvidas exclusivamente no servidor. Request body, URL ou cookie não podem fornecer connection strings. Configuração recusa os dois ambientes apontando ao mesmo banco. Cada banco deve possuir identidade homologada correspondente à unidade; unit mismatch bloqueia a requisição.
- Nenhuma suposição automática de que registros atuais pertençam à Sul. Se o banco legado for reaproveitado como uma unidade, exigir confirmação explícita no servidor e homologação no banco.
- Seletor no cabeçalho para o ERP inteiro; a troca faz navegação completa e elimina estado/IDs da unidade anterior. O login invalida seleção prévia; logout limpa ambos os cookies. A administração antiga de líderes criava usuários no banco operacional e é substituída, no modo multiunidade, por `/acessos`: administrador central cria/edita contas, concede unidades e setores/turnos por unidade. Desativação, mudança de perfil ou senha revogam sessões de contas do banco. Logins de ambiente permanecem gerenciados na configuração do servidor.
- Consolidado de gestão consulta separadamente as duas fontes, exige acesso às duas e perfil PCP/GERENTE. Dados indisponíveis ou módulo não instalado aparecem como indisponíveis, nunca como zero. Posições de estoque são contadas; quantidades de materiais com unidades de medida diferentes não são somadas.
- Removidas entradas separadas de Programação Sul/Nordeste do menu. Rotas antigas redirecionam para o planejamento mensal único ou consolidado. O planejamento mensal usa a unidade global e não permite selecionar a unidade de outra conexão.
- Caches de inicialização de estoque/apontamentos/CRM deixam de ser booleanos globais e passam a ser por conexão, evitando que a primeira unidade marque a segunda como inicializada.
- Novos QR de pallet contêm unidade na assinatura. QR antigos permanecem restritos à fonte legada, sem procurar IDs nas outras unidades. Canal realtime de cada unidade é privado, com autorização por socket/login/unidade; o canal público legado é preservado apenas no modo anterior.
- WhatsApp requer unidade explícita na configuração do remetente e grant central correspondente antes de consultar IA/dados. Deduplicação de mensagens permanece no banco de identidade; consulta empresarial ocorre no contexto da unidade autorizada.
- Painel administrativo de migrações agora exige perfil PCP para leitura/escrita e usa o ator autenticado, em vez de confiar em nome recebido no payload.

## Configuração de ativação — ainda não aplicada

`ERP_MULTIUNIDADE=enabled` somente depois da homologação. Sem essa configuração, mantém-se o comportamento anterior, sem anunciar separação que ainda não exista no banco real.

- `DATABASE_URL`: controle central de logins, grants e auditoria de seleção.
- `DATABASE_URL_SUL` e `DATABASE_URL_NORDESTE`: secrets com conexões operacionais distintas. Criar banco vazio para uma unidade nova e aplicar schema/migrações; **não criar clone com todos os dados da outra unidade**.
- `ERP_LEGACY_UNIT=SUL` ou `NORDESTE`: somente se o banco atual for deliberadamente reaproveitado como essa unidade, após classificação conferida. Não preencher por conveniência.
- `ERP_ADMIN_UNITS=SUL,NORDESTE`: concessão bootstrap explícita apenas para login PCP_USER/ADMIN_USER com perfil PCP. Não substitui os vínculos normais de outros usuários.
- `WHATSAPP_ALLOWED_USERS_JSON`: remetente deve ter campo `unit` igual a SUL ou NORDESTE, além do usuário/perfil e grant correspondentes.
- Mapeamentos de filial da fundação devem ser cadastrados no controle central antes da ativação. Gerentes e demais perfis sem grant não recebem acesso automático.

Migração `2026-10-21_04_unidades_globais.sql`, dependente da 03: identidade de banco inicialmente sem unidade; proteção contra apagar/trocar identidade homologada; projeção mensal do legado passa a usar identidade conferida. Aplicar seção up somente após preparar o schema correspondente em cada fonte. Homologação deve registrar operador/data. Down preserva identidade e dados e instrui desativação por configuração; não é reversão destrutiva.

Os arquivos SQL foram somente gerados. Para provisionar/homologar o backend real, é necessário instalar/conectar Neon ao projeto existente. Não solicitar senhas, connection strings ou tokens em mensagens do chat.

## Escopo solicitado que continua pendente

| Área | Estado verificável |
| --- | --- |
| Administração central de usuários e líderes | Cadastro central, grants, setores por unidade, versão otimista e revogação de sessões implementados e testados localmente; homologação real pendente |
| Marketing/campanhas e atribuição de origem | Campanhas, orçamento, despesas imutáveis, estados e atribuição exclusiva às oportunidades existentes implementados; métricas são estimativas comerciais, sem alegação de faturamento ou lucro |
| Clientes, representantes e CRM | Módulo existente reutilizado; regras comerciais, comissões e atribuição de campanhas completas pendentes |
| Pedidos/comercial e medições | Módulos existentes isolados por unidade; homologação integrada com dados reais pendente |
| Engenharia, BOM/roteiros versionados, OF persistente e MRP | BOM multinível versionada e imutável após aprovação, detecção de ciclo, OF persistente vinculada ao item original e operações existentes, necessidades congeladas e MRP consultivo implementados. Roteiro industrial completo versionado, automação de compras, reservas e entradas continuam pendentes |
| PCP, programação, gerente e apontamentos | Código existente reaproveitado e protegido pelo contexto de unidade; homologação operacional pendente |
| Estoque e inventário | Cadastro existente reutilizado com classificação insumo/semiacabado/acabado e filtro; MRP lê saldo e movimentos explicitamente identificados com OF-N, abatendo saídas e incluindo reservas dessas OFs. Integração automática industrial/financeira pendente |
| Compras, cotações e recebimento | Não implementados como ciclo completo |
| Qualidade, pallets, QR e romaneios | Módulos existentes preservados; QR/realtime adaptados no código, ainda sem homologação externa |
| Logística, rotas e entrega | Fluxos existentes preservados; ciclo completo até recebimento com evidências ainda pendente |
| SAC | Módulo existente preservado e protegido por unidade; homologação integrada pendente |
| Financeiro e conciliação | Não implementados como módulo completo |
| Custos industriais, comissões e margens | Não implementados como ciclo completo |
| Fiscal e contábil | Integrações e regras brasileiras homologadas ainda não implementadas |
| Manutenção e ativos | Não implementados como módulo completo |
| Transferências entre unidades | Não implementadas; não permitir movimentação cruzada através de endpoints de uma unidade |
| Documentos, notificações e tarefas unificadas | Expansão transversal ainda pendente |
| IA operacional | Código existente reaproveitado com escopo; não substitui regras transacionais dos módulos pendentes |

## Validação

130 testes locais passaram: regressão do legado + assinatura/expiração/login, bancos distintos, confirmação de legado, requisições concorrentes com unidades diferentes, cobertura das barreiras nas APIs, QR por unidade e proteção de identidade usando Postgres/PGlite. Incluem testes Postgres/PGlite de acessos centrais, BOM multinível, imutabilidade, liberação com medição, conclusão de OF, reservas/consumo no MRP e campanhas idempotentes/auditadas. Build e TypeScript locais aprovados; esta verificação não homologa banco real nem conclui os módulos pendentes.

Ainda necessários: duas fontes reais homologadas; testes ponta a ponta por perfil; read/write isolation com os mesmos IDs em unidades distintas; grants revogados durante sessão; QR anônimo e websocket autenticado com Pusher real; importações reais; auditoria e rollback; validação dos módulos que ainda não foram implementados.


## Migrações novas desta etapa — arquivos somente

| Ordem | Arquivo | Destino e efeito |
| --- | --- | --- |
| 05 | `2026-10-21_05_acessos_centrais.sql` | Banco central: perfis, concessão atômica de unidades, setores de líderes e auditoria sem senha/hash |
| 06 | `2026-10-21_06_engenharia_of.sql` | Cada banco operacional: bootstrap idempotente do schema de estoque existente, classificação de estoque, estruturas versionadas, OF persistente, snapshot de materiais e proteção dos apontamentos |
| 07 | `2026-10-21_07_marketing.sql` | Cada banco operacional: campanhas, despesas e origem das oportunidades do CRM |

Dependências explícitas devem ser respeitadas, inclusive o CRM antes de 07. A 06 inclui o bootstrap idempotente do estoque, gerado do DDL existente. Os blocos down preservam dados; não prometem reversão destrutiva nem apagamento de histórico. Nenhum arquivo foi executado no banco real. O painel central não provisiona automaticamente os dois bancos operacionais.

## Roteiro de homologação dos módulos adicionados

1. Em ambiente de homologação preparado, aplicar fundação e 05 no controle central; cadastrar uma filial SUL e uma NORDESTE ativas, sem ambiguidade. Aplicar schema operacional/estoque, 04, 06 e CRM/07 nas respectivas fontes; conferir identidade de cada banco.
2. Administrador de ambiente em `/acessos`: criar conta com senha de 12+ caracteres; conceder somente Sul. Confirmar que a mesma conta não acessa Nordeste nem consolidado. Editar perfil/senha/desativar e confirmar revogação da sessão anterior. Conceder ambas e verificar gestão consolidada com perfil permitido.
3. Criar líder de entregas com setores diferentes por unidade. Conferir que cada troca carrega apenas os setores daquela fonte. Edição concorrente de conta deve exigir recarregar a versão.
4. No estoque cadastrar códigos reais; em `/engenharia` classificar acabados, semiacabados e insumos. Exemplo: acabado usa 2 semis, cada semi usa 3 insumos. Aprovar versões, verificar ciclo recusado e consumo de 60 insumos para lote de 10 acabados. Conferir unidades base e perdas; não converter silenciosamente medidas incompatíveis.
5. Na programação existente selecionar item sem execução, com código igual ao estoque, e criar OF. A quantidade original é preservada. OF planejada bloqueia apontamentos; liberar exige medição quando obrigatória. Necessidades ficam congeladas, mesmo com nova versão da BOM. Conclusão exige todas as operações concluídas com quantidade produzida suficiente. Itens legados sem OF continuam no fluxo anterior.
6. Em estoque registrar reserva/saída com referência literal `OF-N` exibida na tabela de OF. Conferir MRP após saídas, reservas e liberação de reserva. Movimentos sem a referência não são atribuídos automaticamente; ordens de compra e entrada de acabados não são geradas por esse relatório.
7. Em `/marketing` criar campanha, ativar, registrar despesa e repetir a requisição: um lançamento. Vincular oportunidade existente, recusar atribuição da mesma oportunidade a outra campanha. Conferir orçamento/despesas/ganhas e valor comercial estimado. Não há envio de anúncios/mensagens nem integração financeira automática.
8. Repetir as ações com produtos e clientes diferentes nas duas unidades. Confirmar identidade do banco, restrições por perfil e trilhas de auditoria. Validar pallets, QR, romaneios e integrações reais antes da publicação.

## Publicação final

Não fazer merge ou deploy desta preparação. Quando TODO o escopo acordado estiver implementado e homologado, preparar uma única release de produção usando variáveis de produção, executar os testes necessários e então publicar. Não confundir build aprovado com funcionalidade completa ou com migração já aplicada.
