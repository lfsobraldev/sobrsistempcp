# Relatório Master

## Bloco 1 — primeiro incremento; restante ainda pendente

Reaproveitados os endpoints/páginas do painel PCP e apontamento, seleção global, regras de apontamento e cálculos de planejamento. Melhorados recortes de competência/filtro/pedido, consistência de datas/cartões/tabelas, respostas concorrentes, data civil e precisão de quantidade. Criados somente contrato/hook/componente de filtros e testes; nenhuma entidade operacional duplicada.

Arquivos principais: `lib/pcp-filters.ts`, `hooks/use-pcp-filters.ts`, `components/pcp-filter-bar.tsx`, `app/api/pcp/painel/route.ts`, `app/api/pcp/operacoes/route.ts`, páginas existentes correspondentes, provider operacional, `lib/carteira.ts` e `lib/apontamento.ts`.

Migrações novas: nenhuma neste incremento. Migrações 04–07 já existentes continuam como arquivos, sem execução pelo agente.

Validar manualmente: no Painel PCP escolher mês com dois filtros, selecionar um/ambos, combinar pedidos, conferir visão por data, cartões e exportação; limpar filtros; selecionar a programação do cabeçalho e alternar rapidamente. Repetir em Apontamento de Quantidades; usar paginação de 50 e conferir que ações continuam vinculadas ao ID original. Rejeitar valor 0,0001 e aceitar 0,001 quando permitido pelo saldo. Repetir em cada unidade com grants distintos.

Limites: opções de filtro/pedido mostram até 500 valores; metas/capacidade são do setor; não redistribuir por pedido. Lista de operações tem paginação, seus totais visíveis são da página. Painel usa agregados completos do recorte; exportação preserva limites históricos de estimativas/divergências. Dashboard e demais visões legadas ainda precisam adotar o contrato; não tratar todo Bloco 1 como concluído. Endpoints detectam schema ausente e retornam Módulo aguardando migração. Ver `BUGS_PCP.md` para pendências.

Publicação: sem merge/deploy conforme orientação atual. Link para abrir PR e validações registrados em `PROGRESSO.md` após envio da branch.


## Grupo 2/3 — primeiro incremento; detalhamento ainda pendente

Melhorados os acessos por unidade e o módulo mensal existente. Rotas por unidade são entradas para as mesmas páginas/componentes, com validação de perfil e grant no servidor, seleção auditada e descarte da URL anterior. O consolidado reutiliza o resumo existente de gestão; tabelas detalhadas específicas por módulo não foram criadas neste incremento.

Migração global nova, após 07: `2026-10-21_08_competencias_programacao.sql` (dependência 04). Cria somente o conceito de competência/status, referenciando empresas/filiais existentes. Índice garante um mês ativo por filial. Ativação encerra o anterior, é idempotente e auditada; encerrados não reabrem neste fluxo. Trigger integra os lotes existentes sem segundo importador e impede alterações em mês encerrado. Up idempotente; down retira proteção de lotes e preserva cadastros/histórico. Apenas gerada e testada em PGlite; nenhuma execução no Neon.

Variável nova para a Vercel: `ERP_PROGRAMACAO_STATUS=enabled`. Padrão desligado. Aplicar migração em homologação/produção pelo administrador antes de ativar a flag. Com flag desligada, consultas não usam a tabela nova. Com flag ligada e schema ausente: Módulo aguardando migração. Depois de aplicar a SQL, a proteção de meses encerrados é do banco e permanece até o down, mesmo que a flag da interface seja desligada.

Validação manual: ativar a flag em homologação com schema preparado; importar 11/2026 como planejado e verificar que não soma no ativo; consultar Planejados e Todos explicitamente; ativar novembro, conferir encerramento do anterior e auditoria; repetir ação sem novo evento; tentar importar/desfazer em mês encerrado (recusado). Testar filtros múltiplos de pedidos/filtros/competência/status e comparar lista, gráfico, totais e exportação. Com usuário Sul, tentar URL Nordeste e consolidado (recusado); com ambas as unidades e gestão, acessar resumo consolidado; trocar unidade e conferir que a URL anterior não é reaproveitada.

Testes locais: 135 aprovados no grupo, incluindo SQL real de ativação/encerramento, planejados fora do ativo, rollback de mês sem itens e verificação de tenant/RBAC. TypeScript e build aprovados. Links pendentes de abertura dos PRs registrados em PROGRESSO; nenhuma nova URL de deploy, pois publicação está suspensa por instrução do usuário.
