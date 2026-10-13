/**
 * Conhecimento operacional estável do Sobral PCP / Famossul.
 * Regras numéricas e status de produção nunca substituem os dados do banco.
 */
export const FACTORY_KNOWLEDGE = `
CONTEXTO INDUSTRIAL
- O Sobral PCP é a camada operacional/PCP da fábrica. O ERP Consistem continua sendo o ERP oficial.
- A programação é formada por pedidos, OFs, peças e operações por processo.
- O objetivo é evitar atraso de produção e carregamento, antecipando faltas, gargalos, bloqueios, perdas e pendências de qualidade.
- Ao falar em "hoje", use a programação ATIVA e a data local de Sergipe (America/Maceio).

PROCESSOS E FLUXO
- Preparação, usinagens, lixar, recobridoras, lustração, terceiros, embalagens e expedição são etapas distintas.
- Usinagem é separada em: PORTAS, TRAVESSAS, CONTRATESTA, DOBRADIÇAS e TUPIA/canal de borracha.
- Recobridora 1 trabalha principalmente batentes/pernas e travessas de batente.
- Recobridora 2 trabalha principalmente alizares, travessas de alizar, baguetes, kit de correr e suporte de trilho.
- Dentro das sequências industriais, a regra operacional prioriza medidas maiores antes das menores quando aplicável.
- Para alizares: pernas L maior antes de L menor; depois travessas; depois baguetes; depois kit de correr/suporte, respeitando a rota real do item.
- Não mande peça para uma máquina/processo que não pertença à rota real registrada.

PEDIDOS ESPECIAIS / EMBALAGEM
- Pedido NORMAL segue embalagem por família.
- REVENDA possui embalagem própria.
- ENGENHARIA possui embalagem própria e pode usar montagem HS, Timadel ou Estância conforme configuração do pedido.
- Portas/bandeiras, pernas/travessas de batente, pernas/travessas de alizar, kit, baguete e suporte de trilho possuem embalagens distintas no PCP.

ROMANEIO
- O gerador nativo de romaneios do PCP é a fonte principal para pedidos do Filtro 51.
- A IA auxilia leitura, conferência, exceções e pedidos fora do padrão; nunca deve inventar item, código, medida ou quantidade.
- A ordem industrial de referência é: portas, pernas de batente, travessas de batente, alizares e ferragens, respeitando a regra específica da montagem.
- Em portas, normalmente as maiores medidas vêm antes e a separação por lado deve ser preservada quando existir.
- Em batentes, a sequência de usinagem/embalagem deve respeitar contratesta e dobradiças conforme lado/rota real.
- Regras conhecidas de palletização do projeto: Montado HS trabalha com limite de referência de 32 portas por pallet e controle de volume; Revenda, Timadel e Complemento usam referência de 34 portas por pallet; Estância usa referência própria para jogos de alizar. O gerador nativo é sempre a autoridade final caso a configuração atual seja diferente.
- Antes de emitir romaneio, destaque divergências, itens ausentes, duplicados e campos essenciais faltantes.
- Quando houver dados reais do pedido no PCP, prefira esses dados a qualquer inferência.

PLANILHAS DE USINAGEM / PRODUÇÃO
- Planilhas devem sair dos dados reais da programação ativa.
- Devem preservar Pedido, OF, peça/descrição, medida, canal, rebaixo, acabamento, cor, quantidade programada, produzida, saldo, turno e observação quando disponíveis.
- Não fabrique uma planilha apenas em texto se existe ferramenta de geração Excel.

ANÁLISE DE RISCO
- "Risco" é indicador operacional, não certeza do futuro.
- Considere prazo/data de entrega, progresso, operação bloqueada/divergente, falta/retrabalho, Andon, qualidade/MSAC bloqueada, perdas recentes e sobrecarga de capacidade.
- Sempre informe os sinais concretos que levaram ao risco.
- Dê prioridade a pedidos URGENTES/ALTA, prazos próximos/atrasados e gargalos que podem impedir embalagem/expedição.
- Se faltarem dados de capacidade ou prazo, diga explicitamente que a previsão tem confiança menor.

PROGRAMAÇÃO
- Não altere a programação automaticamente sem confirmação do usuário.
- Ao sugerir sequência, respeite prioridade, prazo, saldo a produzir, rota, fila já fixada e capacidade conhecida.
- Itens com fila fixada pelo PCP devem ser tratados como restrição, não reordenados arbitrariamente.
`;
