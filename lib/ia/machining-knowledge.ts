/**
 * Manual técnico do processo produtivo usado pelo Assistente Sobral.
 * Este arquivo descreve regras estáveis. Status, quantidades, prazos,
 * capacidade e progresso devem sempre vir do banco.
 */
export const MACHINING_KNOWLEDGE = `
MANUAL DE USINAGEM E PROCESSOS DA FÁBRICA

1. CLASSIFICAÇÃO DAS PEÇAS
- PORTA: folha/porta propriamente dita. Vai para USINAGEM-PORTAS quando a rota de usinagem estiver presente.
- BATENTE/MARCO PERNA: perna vertical do batente. Sua usinagem padrão é CONTRATESTA + DOBRADIÇAS. Se houver canal/rebaixo/borracha válido, também passa na TUPIA.
- BATENTE/MARCO TRAVESSA: travessa do batente. Vai para USINAGEM-TRAVESSAS. Se houver canal/rebaixo/borracha válido, também passa na TUPIA.
- ALIZAR: não deve ser enviado para USINAGEM-PORTAS, CONTRATESTA, DOBRADIÇAS ou TRAVESSAS DE BATENTE apenas por semelhança de texto. Segue sua rota real.
- BAGUETE, KIT DE CORRER e SUPORTE DE TRILHO: não entram automaticamente nas cinco usinagens principais de porta/batente.
- FERRAGEM: não é peça produtiva equivalente a porta/batente e não deve receber rota de usinagem de madeira.
- BANDEIRA: não deve ser confundida com porta sem que a rota real indique isso.

2. PORTAS
- Processo de referência: USINAGEM-PORTAS.
- A planilha deve preservar: Pedido, OF, item, produto, descrição, medida, tipo, canal, rebaixo, acabamento, cor, material, quantidade programada, produzida, saldo, prioridade, turno e observação.
- Ordenação industrial: medidas maiores antes das menores quando a máquina/regra do setor não exigir outra sequência.
- Acabamento, cor, material e rebaixo devem ser considerados para reduzir setup, mas prioridade/prazo podem prevalecer quando necessário.
- Friso: se "friso" aparecer como característica da própria porta, ele continua pertencendo à lógica da porta e deve ser exibido na descrição/observação. Se aparecer como peça autônoma e não houver rota explícita, marcar REVISÃO; não inventar máquina ou operação.

3. BATENTE — PERNAS
- Processos padrão:
  1) USINAGEM-CONTRATESTA
  2) USINAGEM-DOBRADICAS
  3) USINAGEM-TUPIA somente quando houver canal/rebaixo/borracha aplicável.
- CONTRATESTA e DOBRADIÇAS são operações diferentes.
- Nunca assumir mão direita/esquerda se o dado não estiver no pedido, usinagem ou outra fonte confiável.
- Quando houver mão, preservar DIREITA/ESQUERDA na planilha e no romaneio.
- Se houver canal/rebaixo válido, a Tupia é obrigatória para a peça de batente.
- Termos como N/A, NA, N/D, SEM CANAL, S CANAL, SEM REBAIXO, S REBAIXO e equivalentes não devem gerar Tupia.

4. BATENTE — TRAVESSAS
- Processo padrão: USINAGEM-TRAVESSAS.
- Com canal/rebaixo/borracha válido: adicionar USINAGEM-TUPIA.
- Travessa não deve receber CONTRATESTA ou DOBRADIÇAS automaticamente.
- Diferenciar travessa de perna pela classificação central do PCP e pela medida/descrição.

5. TUPIA / CANAL DA BORRACHA
- USINAGEM-TUPIA representa canal/borracha/rebaixo aplicável em batentes.
- Rebaixo válido pode indicar Tupia mesmo quando a palavra CANAL não aparece.
- Negativos explícitos ("SEM CANAL", "SEM BORRACHA") prevalecem.
- A IA deve sempre informar qual campo justificou a Tupia: canal, rebaixo ou descrição.

6. DOBRADIÇAS / CONTRATESTA
- A IA deve tratar como operações separadas.
- Para pernas de batente, ausência de uma dessas operações é divergência de rota.
- Para travessas, presença automática de DOBRADIÇAS/CONTRATESTA é suspeita.
- No romaneio, quando houver dados de mão, a ordem operacional de referência é:
  Dobradiça Direita -> Dobradiça Esquerda -> Contratesta Direita -> Contratesta Esquerda -> Travessas.
- Nunca criar quantidade de mão direita/esquerda por divisão matemática ou suposição.

7. RECOBRIDORAS
- RECOBRIDORA 1: batentes/pernas + travessas de batente.
- RECOBRIDORA 2: alizares/pernas + travessas de alizar + baguetes + kit de correr + suporte de trilho.
- Uma peça não deve permanecer na recobridora errada só porque a coluna original do Consistem veio preenchida.

8. EMBALAGENS
- PORTAS/BANDEIRAS -> EMBALAGEM-PORTAS.
- BATENTE PERNA -> EMBALAGEM-1.
- BATENTE TRAVESSA -> EMBALAGEM-2.
- ALIZAR PERNA -> EMBALAGEM-3.
- ALIZAR TRAVESSA -> EMBALAGEM-4.
- KIT DE CORRER -> EMBALAGEM-5.
- BAGUETE -> EMBALAGEM-6.
- SUPORTE DE TRILHO -> EMBALAGEM-7.
- Pedido REVENDA -> EMBALAGEM-REVENDA.
- Pedido ENGENHARIA -> EMBALAGEM-ENGENHARIA.

9. PLANILHA DE USINAGEM
- Deve ser gerada a partir da programação ativa, nunca inventada pelo texto da IA.
- Uma aba/setor deve conter somente peças cuja rota inclua aquele processo.
- Separações mínimas: PORTAS, TRAVESSAS, CONTRATESTA, DOBRADIÇAS, TUPIA.
- Se o usuário pedir "planilha de usinagem do pedido X", filtrar somente o pedido X.
- Se pedir "todas", gerar todas as usinagens da programação ativa.
- Quantidade da planilha é o saldo real a produzir quando esse dado estiver disponível; não usar quantidade total como saldo se já houver produção apontada.
- Itens com saldo zero/concluídos não devem ser tratados como pendentes.
- Preservar OF e pedido; são chaves operacionais importantes.

10. SEQUENCIAMENTO
- Regra geral de medidas: maior -> menor.
- Dentro do mesmo setup, agrupar material/acabamento/cor/rebaixo quando isso não prejudicar prioridade/prazo.
- Filas fixadas são restrição e não devem ser reordenadas automaticamente.
- Prioridade: URGENTE > ALTA > NORMAL, porém a IA deve explicar quando isso quebra uma sequência de setup.
- Programação sugerida nunca deve ser aplicada silenciosamente; precisa de confirmação.

11. ATRASOS E PREVISÃO
- A IA não "adivinha" atraso. Ela calcula risco operacional.
- Evidências principais: data de entrega, dias restantes, progresso, saldo por processo, capacidade, fila, Andon, perda, falta/retrabalho, bloqueio de qualidade, operação divergente/bloqueada e pedido urgente.
- Um pedido com prazo curto e saldo em processo acima da capacidade recebe risco elevado.
- Um pedido com falta/retrabalho aberto perto da expedição recebe risco elevado.
- Um bloqueio de qualidade pode tornar o pedido crítico mesmo com produção concluída.
- Sem data de entrega ou sem capacidade cadastrada, a IA deve reduzir confiança e declarar a ausência.
- Sempre responder: risco, causas, processo que ameaça o prazo e ação recomendada.

12. CONFIABILIDADE
- Dados do banco e regras determinísticas do PCP vencem inferência da IA.
- Quando uma regra ainda não estiver cadastrada (ex.: peça nova ou friso autônomo), marcar REVISÃO e solicitar validação humana.
- Depois que uma regra nova for oficialmente definida, ela pode ser incorporada ao manual do sistema.

13. INTERPRETAÇÃO DE CAMPOS AUSENTES EM QUALQUER FILTRO / API DO CONSISTEM
- A IA deve reconhecer que qualquer filtro/programação do Consistem, qualquer que seja seu número, pode trazer parte das informações somente dentro da descrição.
- Quando MATERIAL/TIPO estiver vazio, procurar exclusivamente na mesma linha termos explícitos como MDF ULTRA, ULTRA, MDF STD, STD, PINUS, HDF ou MDF.
- Quando ACABAMENTO estiver vazio, procurar somente termos claramente identificados na mesma linha, como PET, PVC ou ESMALTE.
- Quando MEDIDA estiver vazia, extrair a dimensão explícita da própria linha e mantê-la separada do nome do produto.
- Quando REBAIXO/CANAL estiverem vazios, só recuperar valor se houver indicação explícita; negativos como SEM CANAL/SEM REBAIXO prevalecem.
- Não substituir valor estruturado válido do Consistem por interpretação textual.
- Não usar outro pedido, outra OF ou histórico parecido para preencher um campo ausente.
- Toda informação recuperada da descrição deve ser tratada como "recuperada da linha", não como valor originalmente preenchido no campo.
- Se uma classificação ou rota depender de um valor recuperado, explicar a origem quando o usuário pedir auditoria.
- Essa mesma lógica deve continuar válida quando o CSV for substituído por API do Consistem.

14. IA E ROMANEIO
- A IA deve compreender o romaneio como documento operacional de expedição, não apenas como texto.
- Deve montar/revisar linhas preservando Pedido, Item, Código/Produto, Quantidade e medida real.
- A descrição final do produto não deve repetir a medida física principal; Comprimento/Largura/Espessura ficam em colunas próprias.
- Consolidar somente peças realmente idênticas. Ao consolidar, somar quantidades e preservar rastreabilidade dos itens de origem.
- Não duplicar números de Item na observação e não inventar Item ausente.
- Sem usinagem, nunca inferir mão direita/esquerda ou aplicações.
- Com usinagem, usar a planilha como fonte complementar para mão, aplicações e detalhes específicos.
- Antes de considerar o romaneio correto, verificar cobertura de todos os itens, ausência de duplicidades, quantidades, medidas, descrição, ferragens e ordem industrial.
- Quando algo depender do cliente/Engenharia e ainda não estiver definido, sinalizar exatamente o campo pendente e continuar com as partes seguras.

`;
