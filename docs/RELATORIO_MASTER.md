# Relatório Master

## Bloco 1 — primeiro incremento; restante ainda pendente

Reaproveitados os endpoints/páginas do painel PCP e apontamento, seleção global, regras de apontamento e cálculos de planejamento. Melhorados recortes de competência/filtro/pedido, consistência de datas/cartões/tabelas, respostas concorrentes, data civil e precisão de quantidade. Criados somente contrato/hook/componente de filtros e testes; nenhuma entidade operacional duplicada.

Arquivos principais: `lib/pcp-filters.ts`, `hooks/use-pcp-filters.ts`, `components/pcp-filter-bar.tsx`, `app/api/pcp/painel/route.ts`, `app/api/pcp/operacoes/route.ts`, páginas existentes correspondentes, provider operacional, `lib/carteira.ts` e `lib/apontamento.ts`.

Migrações novas: nenhuma neste incremento. Migrações 04–07 já existentes continuam como arquivos, sem execução pelo agente.

Validar manualmente: no Painel PCP escolher mês com dois filtros, selecionar um/ambos, combinar pedidos, conferir visão por data, cartões e exportação; limpar filtros; selecionar a programação do cabeçalho e alternar rapidamente. Repetir em Apontamento de Quantidades; usar paginação de 50 e conferir que ações continuam vinculadas ao ID original. Rejeitar valor 0,0001 e aceitar 0,001 quando permitido pelo saldo. Repetir em cada unidade com grants distintos.

Limites: opções de filtro/pedido mostram até 500 valores; metas/capacidade são do setor; não redistribuir por pedido. Lista de operações tem paginação, seus totais visíveis são da página. Painel usa agregados completos do recorte; exportação preserva limites históricos de estimativas/divergências. Dashboard e demais visões legadas ainda precisam adotar o contrato; não tratar todo Bloco 1 como concluído. Endpoints detectam schema ausente e retornam Módulo aguardando migração. Ver `BUGS_PCP.md` para pendências.

Publicação: sem merge/deploy conforme orientação atual. Link para abrir PR e validações registrados em `PROGRESSO.md` após envio da branch.
