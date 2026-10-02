# Relatório de validação — V8

## Executado
- `npm install` OK; `npx tsc --noEmit` sem erros; `next build` concluído com sucesso (todas as rotas, incluindo /criticos).
- Ordenação (maior → menor medida) e classificação por família testadas com dados sintéticos.

## Não executado
- Regressão do Filtro 51 com o CSV real (arquivo não disponível neste ambiente). Rode a importação do filtro 51 e confira o bloqueio de regressão.
- Testes com banco Neon real e com a coluna "Recobridora 2" no CSV (é opcional; aceita RECOBRIDORA-2 / "Recobridora 2").

## Mudanças V8
Fontes ≥ 12–17px, tabelas com cabeçalho fixo e rolagem própria, Excel (.xlsx) em todas as telas + exportação completa, quantidades reais (planejado/produzido/refugo/saldo), famílias separadas, Recobridora 2, descrição correta da peça, ordenação por maior medida (`lib/sort.ts`, constante DIM_PRINCIPAL), apontamento com 1 toque + teclado numérico + validação de saldo (ação SOMAR atômica), tela de Itens Críticos (`lib/criticos.ts`).
