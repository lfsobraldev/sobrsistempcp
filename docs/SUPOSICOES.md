# Suposições registradas

| Suposição | Motivo | Como reverter |
| --- | --- | --- |
| O código operacional atual representa uma única empresa/planta até que o cadastro formal de empresas/filiais seja aprovado. | Não existe `empresa_id`/`filial_id` no schema inspecionado; inventar valores e atribuições pode misturar registros reais. | Manter novos vínculos nullable durante expansão; mapear cada registro com a empresa antes de tornar obrigatório. |
| Compras novas devem referenciar o cadastro de fornecedor do próprio domínio e não inferir fornecedores a partir de texto livre ou NF. | Não foi localizado cadastro mestre de fornecedores. | Importar cadastros validados antes de liberar o fluxo; manter documentos importados em estado não aprovado. |
| Recebimento não altera estoque até conferência explícita e registro em `est_movimentos`. | O ledger existente é a fonte auditável de saldo; evitar saldo paralelo ou entrada automática não conferida. | Corrigir recebimento por evento reverso no ledger, nunca editar/excluir movimentos. |
| Reserva de material para OF deve usar os movimentos existentes de reserva/liberação e a chave da OF quando o modelo de OF for definido. | Mantém um único saldo/ledger; a relação atual com OF é apenas textual. | Liberar reserva com movimento compensatório e manter histórico. |
| Valor de item e imposto em compra/venda são informativos até validação fiscal/contábil. | Alíquotas, CFOP, CST, regime tributário e regras de contabilização dependem do contador e da empresa. | Desativar adaptador fiscal e invalidar registros em rascunho; não apagar histórico aprovado. |
| Tokens públicos do QR não são autorização para confirmar recebimento; confirmação exigirá identidade ou OTP e consentimento definidos. | O QR atual é um link de posse e não prova identidade do destinatário. | Revogar o token individual e manter consulta somente leitura. |
| Inventário aberto bloqueia movimentos em todo o escopo cadastrado, mesmo para produtos ainda não adicionados à contagem. | Evita que movimentações alterem o conjunto contado após a abertura. | Alterar somente com regra formal de congelamento por item e trilha de exceção aprovada; validar concorrência em homologação. |
| A unidade e o mês de cada registro de programação serão inferidos por campos do CSV e normalizados para `SUL`, `NORDESTE` e `CONSOLIDADO` quando necessário. | O repositório não usa uma tabela de importação por mês/unidade antes desta mudança. | A importação atual precisa de validação manual antes da persistência definitiva. |
| O painel de migrações não será habilitado por padrão e exigirá `ALLOW_ADMIN_MIGRATIONS=true`. | Regra explícita da missão. | Nenhuma migração será aplicada sem autorização manual. |
| As migrações seguirão o padrão `YYYY-MM-DD_NN_nome.sql` com blocos `-- migrate:up` / `-- migrate:down`. | Regras do exercício e padronização do repositório. | A ordem e o checksum serão conferidos antes de liberar em produção. |
| O `schema_migrations` será somente um controle de execução, sem tocar em dados operacionais existentes. | O projeto usa DDL aditivo e não tem mecanismo global de migration antes dessa entrega. | Qualquer correção futura deve ser feita com `BASELINE` e auditoria de divergência. |

## Programação multimestre — 21/10/2026

- Sem CSV de exemplo no git: não inventar competência do mês passado. Usar data real da programação legada e datas do arquivo enviado para sugerir mês de novos lotes.
- Legado pertence à unidade Sul da empresa técnica PCP_LEGADO; homologar antes de aplicar migration. Não associar automaticamente a empresa existente pelo nome.
- Planejamento importado é demanda, e não autorização de execução. A liberação industrial atual permanece sob ação explícita do PCP.
- Mês pode ser corrigido pelo operador mesmo divergindo da data de uma linha, com aviso de prévia.
- Substituir é uma nova versão reversível; desfazer obedece ordem inversa para preservar encadeamento de lotes.
- Contas PCP_USER/ADMIN_USER com perfil PCP são administradoras globais. Todas as demais dependem de grants explícitos ou vínculos de filial da fundação.
- Filtros salvos são preferências locais. Data vencida não é atraso confirmado de execução. Histórico inicial limitado aos 50 lotes recentes e exportação a 10.000 linhas.
- Sem merge na main conforme regra transcrita; deploy da branch é preview até promoção em produção pela Vercel.


## Integração global e módulos industriais — atualização de 21/10/2026

- Esta seção substitui a suposição anterior que atribuía automaticamente o legado à Sul. A origem real deve ser homologada; não preencher a identidade de unidade nem ativar o modo multiunidade sem essa conferência.
- Perfil é global da conta; acesso às unidades e setores/turnos de líderes de entregas são concedidos explicitamente por unidade. Administrador central é a conta PCP configurada em ADMIN_USER/PCP_USER. Não criar senha padrão nem reusar login de ambiente em cadastro de banco.
- Classificação inicial do estoque é NAO_CLASSIFICADO; não inferir insumo/acabado pelo texto da descrição. BOM consome a unidade base de cada componente por 1 unidade base do produto pai. Perdas são adicionais; quantidades finais arredondam para cima na precisão de estoque. Aprovação de subestruturas é serializada para impedir ciclos em concorrência.
- Uma OF cobre o item inteiro da programação existente, sem dividir ou copiar suas operações. Só pode ser criada antes de execução e para programação liberada. Necessidades multinível são congeladas na liberação; consumir/reservar/receber exige ação explícita no ledger existente com referência OF-N. MRP é consultivo, sem programação automática de compras ou reposição.
- Campanhas usam os clientes e oportunidades do CRM existente. Cada oportunidade tem uma origem de campanha exclusiva; despesas são registros imutáveis e idempotentes em centavos. Estornos de despesas, orçamento com aprovações e faturamento financeiro permanecem pendentes; valor estimado de oportunidade ganha não é receita realizada.
- Nada nesta etapa autoriza inferir regras fiscais, CFOP, integração bancária, assinatura de anúncios ou envio de mensagens em nome da empresa. Os módulos pendentes estão registrados na entrega integrada.

## Prompt Master — Bloco 1

| Suposição | Motivo | Como reverter |
| --- | --- | --- |
| Data civil industrial usa America/Maceio para Sul e Nordeste | Ambas usam UTC-3 no período operacional; evitar dependência de host/browser. O ledger existente usa America/Sao_Paulo, equivalente no período atual | Parametrizar fuso por filial se houver operação fora desse padrão; preservar datas civis já registradas |
| Visão por competência consulta todas as programações ATIVA/ENCERRADA no mês; seleção do cabeçalho continua disponível como modo separado | Não confundir um filtro ativo com todo o histórico mensal nem incluir rascunhos | Selecionar Programação do cabeçalho ou Ativo; implementar status mensal separado no grupo 2/3 |
| Metas e capacidade continuam globais por setor | O cadastro não atribui meta a pedido ou filtro | Evoluir cadastro e versionar política antes de distribuir metas proporcionalmente |
| Perdas sem operação não entram no recorte de pedidos | Não há vínculo confiável para rateio | Corrigir vínculo na origem ou exibir painel separado de perdas sem atribuição |
| Não reparar automaticamente roteiro de programação que já possui OF formal | Proteger snapshot, status e quantidades contra escrita durante consulta | Implementar migração explícita de roteiros com validação/auditoria; não reativar reparo automático em OF congelada |


## Prompt Master — competências e unidades

| Suposição | Motivo | Como reverter |
| --- | --- | --- |
| Um mês ativo por filial; ativar próximo encerra anterior | Padrão simples para separar demanda ativa e planejada | Evoluir política em migração futura antes de aceitar mais de um ativo |
| Competência do legado ativo segue a data real da programação ATIVA; outros meses existentes começam planejados | Preservar dados sem inventar encerramento de históricos; nenhuma atribuição nova de unidade | Administrador revisa e ativa/encerra os meses depois da aplicação; não renomear competência |
| Importação nova cria competência PLANEJADA; encerrado bloqueia alteração de lotes | Evitar misturar futuro em totais ativos e preservar documentos fechados | Fluxo de reabertura específico, autorizado e auditado, a implementar; não editar status diretamente |
| Entradas por unidade selecionam a fonte autorizada e reaproveitam os mesmos componentes | Evitar módulos/tabelas Sul e Nordeste duplicados | Acessar a rota geral do módulo com seletor global; grants do servidor continuam obrigatórios |
| Consolidado por módulo começa pelo resumo de gestão existente | Não misturar saldos de produtos/unidades de medida diferentes nem inventar correspondência entre cadastros | Implementar tabela detalhada com identificação de origem e regras de agregação explícitas em incremento próprio |


## Etapa A — decisões

- O recorte industrial filtra produtos/operações/planejamento. Estoque é posição atual dos códigos relacionados ao recorte; não inventa saldo histórico. Sem mês específico/pedidos/filtros explícitos, estoque mostra todos os produtos da unidade. Cadastros, capacidades e metas sem vínculo de pedido não são rateados artificialmente.
- Leituras gerais podem juntar programações. Escritas que dependem de um cabeçalho único exigem seleção de uma programação; ações por ID preservam a origem original. Não usar um ID sintético para escrever.
- “Excluir histórico” passa a arquivar, com auditoria e consulta de arquivados. O mesmo vale para excluir a programação ativa. Nada é removido em cascata. Para reverter o comportamento, criar fluxo explícito de desarquivamento; não reintroduzir DELETE físico.

## Etapa B — decisões do ciclo

| Suposição | Motivo | Como reverter |
| --- | --- | --- |
| `ERP_CICLO_INDUSTRIAL` desligado por padrão; habilitar com `enabled` após homologação e migração | Preservar fluxos legados sem schema novo | Desligar a flag; OFs integradas continuam protegidas contra escrita pelo apontamento legado |
| Snapshot é congelado já na geração; confirmação reserva a mesma revisão | Não trocar a engenharia enquanto o planejador confirma | Uma futura revisão de OF precisa ser explícita, antes da confirmação, com auditoria; nunca editar snapshot |
| Roteiro usa quantidades da BOM na unidade base cadastrada; quantidade informada no ciclo também é base | Reutilizar conversões do estoque e evitar duas regras de conversão | Evoluir o assistente para escolher unidade alternativa, convertendo pelo cadastro existente antes de enviar |
| Cada componente pertence a exatamente uma operação; entrada de produto apenas na última | Evitar dupla baixa e dupla entrada | Evoluir política versionada de rateio entre operações antes de permitir múltiplos vínculos |
| Falta de saldo pode bloquear ou deixar movimento pendente; nunca cria saldo negativo | Preservar constraints atuais de estoque | Exige projeto específico e migração antes de autorizar estoque negativo |
| Filho produz a falta do semiacabado calculada na geração; confirmação revalida disponibilidade | Não reservar saldo inexistente; filhos usam o mesmo fluxo de OF | Alterações de disponibilidade entre planejamento e confirmação precisam ser resolvidas no planejamento; não forçar saldo |
| Estornos seguem operações posteriores e ordem inversa dos apontamentos | Preservar rastreio e arredondamento acumulado | Criar recomposição de custos/consumo antes de permitir estorno fora de ordem |
| Custos legados não informados valem zero e não são estimados | Não inventar valorização histórica | Homologar abertura/inventário valorizado com o responsável financeiro; PEPS de legado sem camadas exige saneamento |
| Centro é capacidade/máquina/turno existente, com calendário semanal ISO | Evitar cadastro paralelo e manter capacidade conhecida | Expandir o mesmo cadastro para exceções/feriados; não criar outro centro de trabalho |
| Chave EXTERNA é cadastrável, mas execução bloqueada sem remessa/retorno conferidos | Beneficiamento externo pertence ao Bloco 9 e não foi criado nesta rodada | Integrar o fluxo de terceirização ao roteiro existente quando autorizado |
| Transferência é saga, pois os bancos são independentes; produto de destino é escolhido explicitamente | Não supor IDs/códigos iguais nem prometer transação distribuída | Reprocessar a mesma chave; o documento só é recebido depois do crédito confirmado no destino |
| PWA guarda propostas offline; autorização e saldo são validados novamente no servidor | Login/unidade podem mudar durante a falta de conexão | Voltar com o login e unidade de origem; corrigir/descartar propostas recusadas, sem alterar o ledger |
| Câmera usa BarcodeDetector; navegador sem essa API usa leitor físico ou digitação | Não introduzir dependência externa de câmera nesta etapa | Adicionar decodificador local com homologação de iOS se câmera universal for necessária |

## Rodada completa — etapa A

- Cliente segue o ID explícito do CRM; quando só há código/documento, a resolução exige um cadastro único. Homônimos não são vinculados automaticamente. Cadastro sem código mostra “sem código”; manutenção/validação na etapa C. Reverter por ajuste auditado do vínculo mestre, nunca por renomear textos em massa.
- Sem CRM instalado, leitura preserva nome da programação; filtros comerciais novos dependem da projeção da migração 12 e não podem produzir totais falsos. A opção não é preenchida enquanto o schema não estiver disponível.
- Nome de cliente não é número de pedido do cliente. O campo de referência de compra permanece separado.
- Auditoria geral é inspeção do código de todas as entradas e testes locais dos caminhos corrigidos. Campos vazios/latência em produção não foram medidos nem inferidos; homologação com dados reais permanece necessária.

## Rodada B

- Bloqueio é herdado da OF pai; remover o bloqueio de uma filha não remove o do pai. Motivo obrigatório. Reversão: desbloquear explicitamente a OF responsável pelo impedimento.
- Cancelar árvore exige ausência de execução vigente e filhas concluídas; apontamentos devem ser estornados antes. Não cancela parcialmente árvore com produção.
- Instrução textual e revisão congeladas no roteiro bastam para o primeiro acesso do operador. Arquivos/aprovação documental independente continuam pendentes na H; nova revisão de roteiro não altera OF liberada.
