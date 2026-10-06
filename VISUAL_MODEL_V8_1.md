# V8.1 — Modelo visual Famossul

Escopo desta revisão: apresentação e modelo de informação. Nenhuma regra operacional, API, schema ou fluxo de produção foi alterado.

## Sistema
- Visual industrial refeito: sidebar, topbar, dashboard, painéis, filtros, formulários, drawers e tabelas.
- Tabelas principais alinhadas ao modelo da programação: Pedido, Item, OF, Produto, Família, Descrição, Tipo, Rebaixo, Acabamento, Cor, quantidade programada, dimensões, produzido, saldo, percentual, status e prioridade.
- Programação, Sequenciamento e Apontamentos usam o mesmo padrão visual e informacional.
- Líderes mantém a consolidação existente, mas apresenta as mesmas informações técnicas do modelo.
- Exportação Excel usa a mesma nomenclatura do modelo de programação.
- Campos que não existem no banco atual (Máquina, Líder e Observação operacional) permanecem como "-" na exportação; nenhum dado foi inventado.

## Planilha
- Conteúdo, fórmulas e lógica mantidos.
- Títulos, cabeçalhos, metadados, larguras, alturas, congelamento e campos de preenchimento receberam novo padrão visual.
- Colunas de preenchimento manual foram destacadas em amarelo claro.
- Cabeçalhos seguem padrão industrial verde escuro / azul petróleo.

## Validação
- Planilha: inspeção de fórmulas sem #REF!, #DIV/0!, #VALUE!, #NAME? ou #N/A.
- TypeScript: validação estrutural/sintática executada com stubs locais para dependências, sem erros.
- `npm ci` não concluiu neste ambiente por timeout de transporte; portanto `next build` real não foi executado aqui.
