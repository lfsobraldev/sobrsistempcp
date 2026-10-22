# ERP industrial — roteiros de teste manual e pendências

Aplicar as migrações 14 a 24 na unidade com backup do Neon feito antes (`npm run db:package` gera o pacote em `docs/banco`). Cada bloco abaixo tem 10 passos para validar na tela.

## Bloco 1 — Comercial (/vendas, /comercial)
1. Cadastre um cliente com limite de crédito e um representante com comissão padrão. 2. Crie um pedido com 2 itens e desconto de 3%. 3. Confira total e comissão provisionada. 4. Crie outro com desconto acima de 5%: deve ir para aprovação. 5. Crie pedido que estoure o limite: bloqueio de crédito. 6. Aprove como gerente. 7. Cadastre regra de comissão por item e recalcule. 8. Cancele um pedido com motivo. 9. Veja histórico do pedido. 10. Confira lançamentos de comissão imutáveis (sem editar/apagar).

## Bloco 2 — Miolo da produção (/engenharia, /ordens-fabricacao)
1. Abra um produto e a BOM aprovada. 2. Veja necessidade do pedido e disponibilidade. 3. Gere a OF. 4. Veja "onde é usado" de um componente. 5. Libere a OF e confira reservas. 6. Aponte produção no operador. 7. Aponte refugo. 8. Confira baixa automática de insumos. 9. Conclua a OF e confira entrada do acabado. 10. Cancele outra OF e veja as reservas liberadas.

## Bloco 3 — Interface (todas as telas)
1. Abra no celular e no desktop. 2. Tabelas viram cartões no celular. 3. Modais ocupam a tela cheia no celular. 4. Ctrl+K abre a busca. 5. Menu agrupado por área. 6. Sem botões duplicados. 7. Foco por teclado visível. 8. Erros aparecem em faixa vermelha. 9. Estados vazios explicam o próximo passo. 10. Percorra o checklist `docs/CHECKLIST_UX.md`.

## Bloco 4 — Compras, estoque e terceirização (/compras, /estoque)
1. Crie requisição e cotação. 2. Gere pedido de compra. 3. Receba com XML da NF-e. 4. Confira a divergência de quantidade. 5. Veja custo médio atualizado. 6. Crie remessa a terceiro e retorno. 7. Confira ABC/XYZ. 8. Veja sugestão de compra. 9. Transfira entre depósitos. 10. Tente estoque negativo: deve recusar.

## Bloco 5 — Qualidade (/qualidade-inspecao, /medicoes)
1. Cadastre instrumento com validade. 2. Crie plano de inspeção. 3. Abra lote de inspeção. 4. Lance medições (uma fora da tolerância). 5. Lote vai para quarentena. 6. Abra NC com 5 porquês. 7. Registre ação CAPA. 8. Tente medir com instrumento vencido: bloqueia. 9. Veja carta CEP. 10. Emita certificado de qualidade.

## Bloco 6 — MRP e programação (/planejamento-aps)
1. Rode o MRP líquido. 2. Veja sugestões de OF e compra. 3. Abra o Gantt. 4. Arraste uma OF e reprograme. 5. Veja carga por centro. 6. Abra o S&OP. 7. Crie pedido urgente e veja o impacto. 8. Confira capacidade excedida em vermelho. 9. Salve cenário. 10. Compare com o plano anterior.

## Bloco 7 — Expedição (/expedicao)
1. Consulte o ATP de um produto. 2. Reserve estoque para o pedido. 3. Abra remessa. 4. Leia os pallets por código. 5. Pallet de outro pedido: recusa. 6. Feche a carga: baixa estoque e custo. 7. Gere o link do cliente e abra em aba anônima. 8. Marque entregue. 9. Registre devolução parcial. 10. Confira o estorno proporcional da comissão.

## Bloco 8 — Custos (/custos)
1. Veja custo padrão pela BOM. 2. Compare padrão x real por OF. 3. Veja variações de preço, refugo e eficiência. 4. Confira valorização do estoque. 5. Veja margem real do pedido. 6. Mude preço de insumo e recalcule. 7. Filtre por período. 8. Exporte. 9. Confira que valores são em centavos exatos. 10. Veja OF sem apontamento marcada como incompleta.

## Bloco 9 — Fiscal (/fiscal)
1. Cadastre NCM/CFOP/regras com vigência. 2. Configure o provedor (homologação). 3. Monte uma nota simulada. 4. Valide a chave de 44 dígitos. 5. Cancele a nota simulada. 6. Importe XML de entrada e confira. 7. Veja apuração e IBS/CBS parametrizado. 8. Gere Bloco K. 9. Exporte CSV. 10. Provedor real sem configuração: mensagem "não configurado".

## Bloco 10 — Financeiro (/financeiro)
1. Entrega gera título a receber automaticamente. 2. Recebimento de compra gera a pagar. 3. Dê baixa parcial. 4. Importe extrato e concilie. 5. Gere PIX copia-e-cola. 6. Veja plano de contas. 7. Faça lançamento manual balanceado. 8. Emita balancete e DRE. 9. Veja fluxo de caixa projetado. 10. Compare orçado x realizado.

## Bloco 11 — Manutenção e documentos (/manutencao, /documentos)
1. Cadastre ativo ligado ao centro de capacidade. 2. Crie plano preventivo de 30 dias. 3. No operador, abra Andon "Máquina parada". 4. Confira OM corretiva e parada aberta. 5. Consuma peça do estoque na OM. 6. Conclua com causa e solução. 7. Veja MTBF/MTTR. 8. Crie documento, envie e aprove como outra pessoa (quem elabora não aprova). 9. Vincule ao setor e abra "Instruções" no operador. 10. Ligue o controle de qualificação e tente apontar sem qualificação.

## Bloco 12 — Indicadores e integrações (/indicadores)
1. Abra o painel e mude o período. 2. Confira OTIF, lead time, giro, PPM, OEE parcial e carteira. 3. Em Alertas, clique "Recalcular". 4. Resolva a causa (ex.: reponha estoque) e recalcule: alerta some. 5. Como gerente, gere um token e copie. 6. `curl -H "Authorization: Bearer <token>" https://<site>/api/v1/indicadores`. 7. Revogue o token e repita: 401. 8. Crie webhook https e gere um alerta. 9. "Enviar pendentes agora" e confira a assinatura `X-Sobral-Assinatura`. 10. Pergunte à Sobral IA "quais alertas estão abertos?".

## Parciais conhecidos (honestos)
- Bloco 2: substitutos na BOM, custo de estorno/retrabalho/refugo e "gerar OF do pedido com um clique".
- Bloco 4: portal do fornecedor, endereçamento, inventário cíclico, tela de PEPS.
- Bloco 5: importação de medições por planilha, SAC com fotos, índice de reclamação.
- Bloco 7: juros/desconto não se aplicam.
- Bloco 9: emissão real depende do provedor fiscal contratado; Bloco K usa o saldo atual.
- Bloco 10: juros/desconto na baixa; boleto real depende de provedor.
- Bloco 12: OEE é parcial (disponibilidade × qualidade; sem medir velocidade); entrega de webhooks é disparada por botão ou agendador externo chamando `POST /api/integracoes {acao:"ENTREGAR"}`; alertas recalculados por botão/agendador; revisão de segurança coberta por teste de rotas e SSRF, sem pentest externo; backup/restauração segue o procedimento Neon em `docs/BANCO_IMPLANTACAO.md`.
