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
- Seletor no cabeçalho para o ERP inteiro; a troca faz navegação completa e elimina estado/IDs da unidade anterior. O login invalida seleção prévia; logout limpa ambos os cookies. A administração antiga de líderes criava usuários no banco operacional e não pode ser usada após centralização: está explicitamente bloqueada no modo multiunidade até concluir o cadastro central e concessão de etapas por unidade. Não anunciar gestão de usuários concluída.
- Consolidado de gestão consulta separadamente as duas fontes, exige acesso às duas e perfil PCP/GERENTE. Dados indisponíveis ou módulo não instalado aparecem como indisponíveis, nunca como zero. Posições de estoque são contadas; quantidades de materiais com unidades de medida diferentes não são somadas.
- Removidas entradas separadas de Programação Sul/Nordeste do menu. Rotas antigas redirecionam para o planejamento mensal único ou consolidado. O planejamento mensal usa a unidade global e não permite selecionar a unidade de outra conexão.
- Caches de inicialização de estoque/apontamentos deixam de ser booleanos globais e passam a ser por conexão, evitando que a primeira unidade marque a segunda como inicializada.
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
| Administração central de usuários e líderes | Autenticação e leitura de grants preparadas; criação/edição de líderes e seus setores no modo multiunidade bloqueada até completar sincronização de permissões; não habilitar produção |
| Marketing/campanhas e atribuição de origem | Não implementado nesta integração |
| Clientes, representantes e CRM | Módulo existente reutilizado; regras comerciais, comissões e atribuição de campanhas completas pendentes |
| Pedidos/comercial e medições | Módulos existentes isolados por unidade; homologação integrada com dados reais pendente |
| Engenharia, BOM/roteiros versionados, OF persistente e MRP | Não implementados como cadeia completa; OF atual permanece referência textual em produtos |
| PCP, programação, gerente e apontamentos | Código existente reaproveitado e protegido pelo contexto de unidade; homologação operacional pendente |
| Estoque e inventário | Módulo existente protegido por unidade; classificação insumo/semiacabado/acabado e integração completa com MRP/OF pendentes |
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

124 testes locais passaram: regressão do legado + assinatura/expiração/login, bancos distintos, confirmação de legado, requisições concorrentes com unidades diferentes, cobertura das barreiras nas APIs, QR por unidade e proteção de identidade usando Postgres/PGlite. Build e TypeScript locais aprovados antes do checkpoint; esta verificação não homologa banco real nem conclui os módulos pendentes.

Ainda necessários: duas fontes reais homologadas; testes ponta a ponta por perfil; read/write isolation com os mesmos IDs em unidades distintas; grants revogados durante sessão; QR anônimo e websocket autenticado com Pusher real; importações reais; auditoria e rollback; validação dos módulos que ainda não foram implementados.

## Publicação final

Não fazer merge ou deploy desta preparação. Quando TODO o escopo acordado estiver implementado e homologado, preparar uma única release de produção usando variáveis de produção, executar os testes necessários e então publicar. Não confundir build aprovado com funcionalidade completa ou com migração já aplicada.
