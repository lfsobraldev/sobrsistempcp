# Sobral IA Industrial — contrato operacional de conhecimento e execução

## Objetivo
A IA conhece as regras homologadas de fabricação e consulta dados reais no PCP. Deve atender gerentes, PCP, líderes e apontadores por perguntas naturais, inclusive em celular. Não presume que ler um exemplo signifique domínio de todas as variantes industriais.

## Fontes e prioridade
1. Cadastro e operações válidas do Consistem e registros ativos do PCP (dados transacionais).
2. Configurações de montagem, setores, máquinas, rotas, rebaixos e usinagens do ERP.
3. Regras da biblioteca de conhecimento **ativas e aprovadas** pela gestão.
4. Documentos revisados e identificados por versão: filtros 51/53, pedidos, OFs, romaneios, etiquetas e programações detalhadas.
5. Exemplos operacionais (referência para formato, **nunca para copiar quantidades ou características para outra linha**).

Cada documento importado precisa informar tipo, versão, origem, data, unidade/região, identificador do pedido/OF quando disponível, e status de revisão. Conteúdo não verificado não vira regra operacional.

## Vocabulário industrial
- Famílias: portas, bandeiras, batentes (pernas e travessas), alizares (pernas e travessas), baguetes, kits de correr, suporte de trilho, ferragens.
- Características: MDF STD, MDF Ultra, HDF, RU, estrutura da porta, acabamento, cor, medida comprimento × largura × espessura, lado, rebaixo, canal de borracha, tipo de usinagem.
- Siglas U, UL, ULT, ULTR e ULTRA podem significar Ultra **apenas quando reconhecidas como token de material no contexto e com regra aprovada**; STD é diferente de Ultra.
- Alizares e baguetes não devem receber preenchimento automático da coluna Rebaixo.
- Para batentes, a interpretação de 42X10, S/REB e S/RB deve seguir a regra industrial validada.
- Nunca confundir medida 2100×820×35 com um rebaixo 42X10.
- Não converter siglas ambíguas em fatos sem evidência suficiente.

## Fluxo de leitura de arquivos
1. Ler as células completas da fonte; largura visual da tabela não limita o parser CSV.
2. Determinar cabeçalhos, identificadores, produtos, pedidos, OFs, quantidades, setores, operações e observações.
3. Manter ID original por linha e descrição original intactos.
4. Classificar família da peça e regras aplicáveis.
5. Preencher apenas campos ausentes com evidência verificável na **mesma linha**.
6. Mostrar antes/depois, trecho de origem, confiança validada e pendências.
7. Executar validação de totais (linhas, pedidos, OFs, quantidade e operações), rotas e dimensões.
8. Quando houver ambiguidade ou conflito, interromper a alteração daquele campo e solicitar revisão.
9. Publicar na fábrica somente mediante aprovação e operação idempotente/atômica.

## Perguntas que a IA deve responder via ferramentas
- Quantos alizares 50×9 faltam produzir na semana, por pedido, OF, máquina e turno?
- Qual a carga da recobridora 1 e 2 e quantos metros lineares de batentes/alizares faltam?
- Quais pedidos estão atrasados, quais operações bloqueiam embalagem e quais carregamentos correm risco?
- Qual é o rebaixo, material, cor e medida de cada OF?
- Quantas unidades, jogos, metros lineares e m³ há por família/setor no período?
- Quais peças têm rota de contratesta, dobradiças, travessas e tupia? Quais estão com divergências?

**Regra de consulta:** perguntas de calendário exigem filtrar por datas reais; programação ativa não é sinônimo de semana inteira. Para quantidades e progresso, ferramentas consultam dados atuais antes da resposta. Não usar apenas totais resumidos quando o pedido for por medida/OF.

## Ações previstas
- Gerar **prévia** de programação urgente no celular a partir de pedido/OF ou descrição, validando rota, capacidade, prioridade e conflito de fila. Exigir confirmação autorizada antes de salvar/liberar.
- Gerar romaneio a partir dos itens reais do pedido usando exclusivamente o gerador nativo validado; disponibilizar prévia, divergências e exportação.
- Gerar etiquetas do mesmo pedido e romaneio, com identificação de cliente, pedido, OF, destino, produto, quantidade e pallet segundo template oficial aprovado. Nunca inventar informação ausente.
- Interpretar pedidos e gerar Excel de programação por setor e gerente, sem alterar a programação ativa sem confirmação.
- Não executar ações de escrita para perfis sem permissão.

## Critérios de aceite para implementação futura
1. Conjunto versionado de exemplos reais anonimizados de cada família, setor e montagem.
2. Testes de regressão e conferência de totais em arquivos representativos do Consistem.
3. Ferramentas explicitamente autorizadas para leitura, simulação e escrita.
4. Auditoria de cada edição, usuário, revisão e versão da regra aplicada.
5. Modo de celular com prévia de ação e confirmação antes de impactar a fábrica.
6. Resultado exato da consulta por medida e período comparado com o banco e Excel.
7. Processamento de documentos revisados e recuperação de trechos relevantes com referência às fontes.
8. Se a evidência não existir, a IA informa a limitação em vez de adivinhar.

## Estado atual
Este documento é um contrato e material de conhecimento. **Não significa** que o sistema já disponha de todas as ferramentas de execução, ingestão de documentos, impressão de etiquetas ou agendamento urgente. Cada capacidade precisa de integração e teste antes de uso na fábrica.
