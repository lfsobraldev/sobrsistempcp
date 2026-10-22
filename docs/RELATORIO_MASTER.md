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

## Etapa A — 22/10/2026
Recorte compartilhado nas visões industriais e seus leitores auxiliares, OF/MRP e posição de estoque. Consolidados detalhados por módulo com grants em ambas as unidades. Assistente mensal em três passos e URL canônica. Histórico arquivado sem exclusão de eventos (migração 09 somente gerada). Operações em várias programações são consultivas quando a escrita exige origem única. Metas/cadastros sem vínculo com pedidos continuam globais da unidade.

Validação: suíte local, tipos e build; nenhuma consulta ao banco de produção. Validar manualmente selecionando dois filtros, mês e pedidos no cabeçalho e navegando entre painel, sequenciamento, perdas e operações; conferir alteração de cartões/tabela/datas e preservação da URL; arquivar um histórico e confirmar consulta pela opção de arquivados. Importação: unidade/mês → arquivo → prévia → confirmação. Homologação visual com dados reais permanece necessária.

Branch dependente da anterior; PR a abrir: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-etapa-a-fechamento . Sem merge/deploy.

## Etapa B — engenharia → OF → produção → estoque

Implementado no código, sob `ERP_CICLO_INDUSTRIAL=enabled` (desligada por padrão). Evoluídos os módulos existentes de engenharia, OF, apontamento e estoque. Nenhum módulo empresarial do Bloco 9 foi criado.

- Engenharia: centro/turno/calendário existente ampliado; roteiro versionado/aprovado, componentes por operação e versão de produção com BOM, validade e lote mínimo/máximo.
- OF: seleção automática da versão válida, snapshot, filhos para semiacabados sem demanda duplicada, árvore e reserva transacional. Apontamento legado não pode modificar OF integrada.
- Produção: boa/refugo/motivo/tempos/turno, parcial, requisição manual ou baixa automática por operação, entrada do semi/acabado, pallet com qualidade pendente, estorno com movimentos inversos e reserva restaurada. Falta de saldo bloqueia ou guarda pendência auditada; reprocessar não reaponta quantidade.
- Estoque: lote/série, posição e rastreio para frente/trás com OF/apontamento/pallet/pedido, custo médio e alocações PEPS imutáveis. Transferência exige grants nas duas unidades, escolha explícita do item/depósito de destino e confirmação para sair de em trânsito.
- Chão de fábrica: interface dentro do apontamento existente, QR por operação, câmera compatível, manifest, contingência offline e fila IndexedDB por usuário/unidade. Cache do service worker contém apenas a página pública de contingência e marca; APIs/documentos autenticados não são cacheados.

Migrações novas, somente geradas, em sequência: **09** histórico seguro (operacional); **10** ciclo industrial/engenharia/OF/apontamento/lotes/custos (operacional, em cada unidade); **11** documentos de transferência (identidade central). Todas têm up/down conservador e dependências no catálogo; down preserva produção e ledger. Não executar o catálogo operacional indiscriminadamente no banco central. Nenhuma foi aplicada pelo agente.

Variável nova: `ERP_CICLO_INDUSTRIAL=enabled` apenas depois da aplicação/homologação das migrações e identidade das filiais. As variáveis de multiunidade e status mensal já documentadas continuam necessárias; nenhum segredo novo é armazenado no código.

Validação local: `npm test` (142 testes), `npx tsc --noEmit`, `npm run build`. Testes de ciclo executam SQL e serviços reais sobre PGlite: BOM/semiacabado, filho, reserva, parcial, baixa por operação, produto/lote/pallet, requisição manual, custo médio × PEPS, estorno, pendência/reprocessamento, idempotência, bloqueio de alterações e transferência entre duas fontes com interrupção simulada. Os testes de unidade/RBAC/filtros/datas anteriores permanecem. Não houve teste com dados reais nem E2E de navegador/câmera.

Validação manual após homologação: 1) Engenharia: classifique produtos, aprove BOM do semi e acabado, configure centro/turno, monte/aprove roteiros e versões válidas. 2) Estoque: receba matérias-primas com lote/custo. 3) OF: escolha item programado, prazo e depósito, gere pai/filhas e confirme; confira reservas. 4) Produção: abra filha/QR, aponte parcial, confira saída da matéria-prima e entrada do semi; faça o mesmo no pai e confira pallet aguardando qualidade. 5) Estorne pai antes da filha; confira inversos, reservas e pallet bloqueado. 6) Teste falta de saldo em PENDENTE, reponha e reprocese; quantidade não pode aumentar novamente. 7) Rastreie lote nos dois sentidos. 8) Envie Sul → Nordeste, confira trânsito, troque para destino e receba; repita confirmação e confira que não duplicou. 9) No dispositivo compatível, interrompa conexão, registre e reenvie com o mesmo usuário/unidade; troca de identidade deve impedir envio.

Limites conhecidos: operação EXTERNA exige futuro beneficiamento conferido (Bloco 9); câmera depende de suporte do navegador; saldo anterior sem custo/camada requer saneamento de abertura para valorização histórica confiável; calendário semanal não programa feriados/exceções automaticamente. Homologar concorrência com conexões Neon reais, dispositivos, permissões e conferência contábil antes de habilitar. Os Blocos 4–7 do Master completo ainda têm itens fora deste ciclo, como inventário/endereço por lote e políticas avançadas de reposição; não estão declarados integralmente concluídos.

Publicação: uma branch/commit por etapa, sem PR criado automaticamente, merge ou deploy. A: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-etapa-a-fechamento . B, dependente de A: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-etapa-b-ciclo . Links são para **abrir** os PRs.
