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
