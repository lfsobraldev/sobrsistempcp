# Plano: WMS, logística, embalagem e revisões de pedido

Problema relatado: pedidos em revisão ficam parados esperando; há peças antigas, novas e sobras misturadas; muitas revisões **subtraem** itens (não só adicionam).

## 1. Revisão de pedido como documento versionado
- Cada revisão vira um registro com número (R1, R2...), motivo, quem pediu, quem responde e **prazo**.
- A revisão guarda a diferença linha a linha: **ACRESCENTA**, **SUBTRAI** ou **ALTERA** (medida, material, acabamento, quantidade).
- Estados: ABERTA, EM ANÁLISE (PCP), AGUARDANDO FÁBRICA, APLICADA, REJEITADA. Pedido com revisão aberta fica sinalizado e **não é programado nem embalado** até a revisão aplicar ou ser rejeitada.
- Fila de revisões paradas: ordenada por dias de espera, com alerta diário (rotina já existente) para o dono da revisão e para o Gerente/Diretor quando passar do prazo.

## 2. O que acontece com o que a revisão subtrai
Ao aplicar uma revisão que reduz ou remove itens, cada peça afetada recebe um destino obrigatório:
1. **Ainda não produzida**: cancelar/reduzir a OF e liberar a reserva de material.
2. **Já produzida e sem pedido**: vira **SOBRA** com código, medida, material, acabamento, pedido de origem e endereço.
3. **Sobra aproveitável por outro pedido**: sistema sugere o casamento (mesma medida/material/acabamento) antes de produzir de novo.
4. **Sem aproveitamento**: refugo com motivo (entra no custo de refugo).
Nada some sem destino registrado; o saldo do estoque sempre fecha.

## 3. Peças antigas, novas e sobras: organização física e no sistema
- **Zonas** no depósito (usar os endereços já criados): RECEBIMENTO, PRODUÇÃO ACABADA, EXPEDIÇÃO, **SOBRAS**, **REVISÃO/QUARENTENA**.
- Etiqueta impressa por peça e por pallet com: pedido, **revisão (R1, R2...)**, item, medida, material, acabamento, mão (D/E) e QR. Peça da revisão antiga recebe etiqueta vermelha de "NÃO USAR" até ser movida para SOBRAS ou REVISÃO.
- Regra de ouro: a etiqueta da revisão vigente é a única válida; ao aplicar uma revisão o sistema lista as peças a **retirar** (vermelho) e as a **produzir** (verde).
- Ronda semanal de sobras com inventário cíclico (já existe) para a zona SOBRAS.

## 4. WMS e logística (sobre o que já existe)
- Já existe: depósitos, endereçamento, inventário cíclico, PEPS, romaneio com regra de ordem do batente, expedição e remessas.
- Acrescentar: recebimento com conferência, **guarda sugerida por zona**, separação (picking) por romaneio com lista impressa na ordem de carga, **conferência de pallet por leitura de QR** na expedição, divergências registradas com foto.
- Embalagem: manter as regras por tipo de montagem (limites de portas, m³ e jogos) e adicionar **lista de embalagem impressa** por pallet e conferência antes de fechar o pallet.

## 5. Impressões previstas
Etiqueta de pallet, etiqueta de peça com revisão e QR, lista de separação, lista de embalagem por pallet, **folha de revisão** (o que sai e o que entra, com destino de cada peça), mapa de endereços e relatório de sobras.

## 6. Indicadores
Dias médios parado em revisão, revisões vencidas, % de sobra reaproveitada, valor de sobra parada, divergências de carga por mil peças, pedidos embalados com revisão aberta (meta: zero).

## 7. Fases
1. Revisão versionada com diferença linha a linha e bloqueio de programação/embalagem; fila de revisões paradas com alerta.
2. Destino das peças subtraídas (sobra, reaproveitamento, refugo) e zona de sobras.
3. Etiquetas e folha de revisão impressas.
4. Picking e conferência de pallet por QR; lista de embalagem.
5. Indicadores e painel do Diretor.

## 8. Dúvidas para fechar o desenho
- Quem pode abrir e quem pode aplicar uma revisão (cargos).
- Prazo padrão para uma revisão ser respondida.
- Existe impressora de etiqueta (térmica) ou será impressão em A4?
- Sobras têm valor de custo contábil ou ficam só como controle físico?
