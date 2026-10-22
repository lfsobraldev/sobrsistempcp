# Auditoria PCP — Bloco 1

| Erro | Causa | Correção / estado |
| --- | --- | --- |
| Painel preso à última programação | `/api/pcp/painel` usava `ATIVA ... LIMIT 1`; tela não enviava a seleção global | Corrigido: hook único de filtros na URL, seleção do cabeçalho ou todos/competência, múltiplos filtros/pedidos e recorte parametrizado compartilhado |
| Gráficos e cartões de períodos diferentes | Apontamentos, perdas e Andon eram agregados sem vínculo às operações selecionadas | Corrigido no painel: todas essas consultas usam IDs de operações do recorte; visão por data usa os mesmos produtos |
| Apontamento ignora troca global | Tela escolhia sua própria programação inicial | Corrigido: mesmo hook/contrato do painel e referência ao cabeçalho; setores/situação/pesquisa adicionais preservados |
| Resposta antiga reaparece após troca rápida | Fetch anterior podia substituir a seleção nova | Corrigido: AbortController nas consultas do painel/apontamento e descarte por seleção no provider operacional |
| Data muda de mês antes da fábrica | `hojeISO` dependia do fuso do host Vercel | Corrigido: data civil explícita em America/Maceio, comum às duas unidades; cálculo de dias úteis existente usa datas UTC ao meio-dia |
| Quantidade pequena vira zero no numeric(16,3) | Aceitava mais de três casas decimais antes do arredondamento | Corrigido na regra de apontamento: recusa precisão excessiva e valores fora do limite, preserva correções negativas válidas |
| Leitura de programação altera OF congelada | Conversor legado era chamado durante toda leitura e podia atualizar operações de OF planejada/concluída | Corrigido: não executar reparo automático em programação com qualquer OF formal. Não converter roteiro misto silenciosamente |
| Cadastros de metas sem pedido/programação | Metas e capacidade são globais por setor/turno | Não inventar atribuição: meta é exibida como global do setor, produção deriva de apontamentos filtrados; perdas sem operação vinculada ficam fora do recorte |
| Exclusão de histórico apaga eventos | DELETE legado em `/api/programacoes/historico` inclui pcp_eventos | Corrigido por arquivamento auditado (migração 09). DELETE não apaga produtos, apontamentos nem eventos; sem a migração retorna aguardando migração |
| Dashboard industrial e telas legadas têm recortes próprios | Foram construídos em torno de uma única programação operacional | Etapa A: provider de visão compartilhado adotado em dashboard, gerente, líderes, fluxo, prioridades, sequenciamento, críticos, performance, perdas, Andon e OF; carteira/entregas recebem o recorte na consulta. Cadastros e dados sem vínculo industrial mantêm escopo de unidade, sem atribuição inventada |

Validação: testes de SQL real em PGlite para filtros combinados, competência, datas e totais; teste de virada de mês/ano e precisão de apontamento. Unidade é validada no servidor pela barreira global existente; não é escolhida por parâmetros livres de consulta. Nenhuma consulta ou migração em produção.

## Correções do ciclo na Etapa B

| Erro / risco concreto | Causa | Correção / validação |
| --- | --- | --- |
| Finalização legada podia completar quantidade sem baixa | Quantidade era elevada ao planejado no FINALIZAR | OF integrada usa função própria: só finaliza quantidade realmente apontada e movimentos processados; trigger rejeita escrita legada |
| Consumo não distinguia operação | OF anterior tinha necessidade achatada e movimentos manuais | Snapshot direto e vínculo componente/operação; teste de duas operações comprova baixa somente do componente da operação |
| Reenvio repetia produção ou movimento | Fila/conexão instável sem contrato do ciclo | Chave de apontamento + comparação do payload/ator + lock/transação; teste de chamadas paralelas e chave reutilizada |
| Estorno físico não restaurava compromisso da OF | Liberação de reserva acompanha a saída | Estorno devolve componentes, retira produto e recria reservas liberadas; ledger original fica intacto |
| Filhas desapareciam no consolidado | Operações filhas não têm demanda própria em pcp_produtos | Consolidado usa origem raiz para o recorte e SKU real da OF; teste inclui pai e filha |
| Resposta/tela podia conservar dados ao trocar unidade | Formulários mantinham estado local entre fontes | Componentes integrados remontam por login/unidade; APIs validam escopo e a fila envia usuário e unidade esperados |
| Interrupção após crédito no destino poderia repetir entrada | Confirmação central e bancos operacionais são independentes | Saga retomável; teste usa serviço real com duas fontes locais e falha simulada antes de marcar recebida |

Validação manual do filtro/datas: no cabeçalho, escolha mês, dois filtros e pedidos; navegue painel → sequenciamento → apontamento/perdas. Cartões, tabela e visão de datas devem usar os mesmos itens e a URL deve preservar a seleção. Limpe filtros e repita na outra unidade. No consolidado, login com uma unidade deve receber recusa no servidor. Datas de produção são civis; validar virada de mês às 23h/00h no fuso da fábrica. Testes automatizados de datas/filtros existentes continuam na suíte.
