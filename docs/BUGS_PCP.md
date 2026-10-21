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
| Exclusão de histórico apaga eventos | DELETE legado em `/api/programacoes/historico` inclui pcp_eventos | Pendente: substituir por arquivamento e corrigir ciclo de retenção em etapa própria; não foi executado |
| Dashboard industrial e telas legadas têm recortes próprios | Foram construídos em torno de uma única programação operacional | Pendente: adoção do contrato nas demais telas. Este incremento cobre painel PCP e apontamento por operação; não declarar todo o Bloco 1 concluído |

Validação: testes de SQL real em PGlite para filtros combinados, competência, datas e totais; teste de virada de mês/ano e precisão de apontamento. Unidade é validada no servidor pela barreira global existente; não é escolhida por parâmetros livres de consulta. Nenhuma consulta ou migração em produção.
