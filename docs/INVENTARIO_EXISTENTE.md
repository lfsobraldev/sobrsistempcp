# Inventário do ERP

Item | situação (existente / melhorado / criado) | arquivos | observação
--- | --- | --- | ---
Programação industrial e importação Consistem | existente | `app/(erp)/programacao`, `app/api/programacoes`, `lib/order-import.ts` | Preservar códigos, quantidades, filtros e ordenação industrial.
Operações e apontamentos de produção | existente | `database/schema.sql`, `lib/pcp-schema.ts`, `app/api/pcp/operacoes/route.ts` | Produção registrada não equivale a OF independente.
Ordem de fabricação independente | criado | pendente | Não há entidade e fluxo próprios de OF; campo `of` é referência textual nos itens.
Estoque: produtos, unidades, locais, saldos | existente | `lib/estoque-schema.ts`, `app/api/estoque` | DDL atualmente inicializado em runtime, sem migration versionada correspondente no diretório.
Ledger imutável de estoque | existente | `lib/estoque-schema.ts`, `lib/estoque-db.ts`, `app/api/estoque/movimentos/route.ts` | `est_movimentos` é append-only; reaproveitar.
Inventário físico e contagem | existente | `app/api/estoque/inventarios/route.ts`, `lib/estoque.ts` | Divergências exigem conferência; fechamento processa ajustes em mais de uma instrução.
Bloqueio de movimentação durante inventário | melhorado | `lib/estoque-db.ts`, `tests/estoque-db.test.ts` | Considera escopo geral/local mesmo antes de adicionar o produto à contagem; concorrência na abertura/fechamento permanece pendente.
Reserva e bloqueio de estoque | existente | `lib/estoque.ts`, `lib/estoque-db.ts` | Controles por saldo/pedido, sem associação a OF persistente.
Fornecedores e suprimentos | criado | pendente | Nenhum cadastro/fluxo de compras correspondente identificado.
Lotes e números de série | criado | pendente | Sem rastreabilidade por lote/série no estoque.
CRM, clientes e representantes | existente | `app/(erp)/comercial`, `app/api/comercial/crm/route.ts`, `database/migrations/2026-10-20_crm_comercial.sql` | Conversão comercial cria/vincula pedido nos fluxos atuais.
Medições versionadas | existente | `app/(erp)/medicoes`, `app/api/medicoes/route.ts`, `lib/medicoes.ts` | Valida unidades suportadas e mantém revisão/aprovação.
SAC e eventos | existente | `app/(erp)/sac`, `app/api/sac/route.ts`, `database/migrations/2026-10-19_sac_industrial.sql` | Vínculos a cliente/pedido/medição; sem anexos próprios.
Qualidade/MSAC de pallets | existente | `app/(erp)/inspecao-pallets`, `app/api/pallets/route.ts` | Inspeção, fotos em banco, NC, bloqueio e liberação.
QR e portal de pallet | existente | `app/api/pallets/public-link/route.ts`, `app/api/pallets/public-tracking/route.ts`, `app/rastreio/pallet` | HMAC baseado em UUID; sem revogação individual ou rate limit persistente.
Controle de entrega e carregamentos | existente | `app/api/controle-entregas`, `app/api/controle-entregas/carregamentos/route.ts` | Datas, transportadora, NF como referência e eventos.
Romaneios e etiquetas | existente | `app/(erp)/romaneios`, `app/api/romaneios`, `lib/romaneio` | Processamento/exportação; sem ciclo completo persistido de carga/pallet/recebimento.
Multiempresa, filiais e isolamento | melhorado (fundação de schema) | `database/migrations/2026-10-21_fundacao_multiempresa.sql` | Cadastro de empresa/filial e vínculo de usuário com escopo por filial definidos; migration não aplicada, sem backfill nem enforcement nas rotas.
RBAC atual | parcial (fundação de schema) | `lib/auth.ts`, `database/migrations/2026-10-21_fundacao_multiempresa.sql`, APIs por módulo | Perfil/cookie HMAC e listas de papéis permanecem ativos; catálogo de permissões e grants por perfil definidos, ainda sem população nem enforcement por empresa/filial.
Auditoria global append-only | parcial (fundação de schema) | `pcp_eventos`, `crm_historico`, `database/migrations/2026-10-21_fundacao_multiempresa.sql` | Ledger global definido com trigger que bloqueia UPDATE/DELETE; ainda sem escrita pelas rotas e sem migration aplicada.
Financeiro, fiscal e contabilidade | criado | pendente | Não foram encontrados módulos/tabelas correspondentes.
Manutenção e ativos | criado | pendente | Capacidade/setup/perdas existem; ativos e ordens de manutenção não foram encontrados.
IA consultiva tipada | existente | `app/(erp)/sobral-ia`, `app/api/ia/chat/route.ts`, `lib/ia` | Ferramentas tipadas, consultas delimitadas e rate limit em memória; avaliar custo/latência e limite distribuído.
Painel de migrações do sistema | criado (estrutura inicial) | `app/admin/migracoes/page.tsx`, `app/api/admin/migracoes/route.ts`, `lib/migration-service.ts`, `scripts/migrate.ts`, `docs/MIGRACOES.md` | Reúne catálogo de arquivos, estado de habilitação, checksum e execução segura de migrações; ainda sem execução real em banco e sem aplicação do SQL em Neon.
Programação mensal por unidade | melhorado | `app/(erp)/programacao/sul/page.tsx`, `.../nordeste/page.tsx`, `.../consolidado/page.tsx` | Estrutura de visualização por unidade, competência, comparativo e tabela; importação, validação e persistência do CSV continuam pendentes.
Configurações do usuário | melhorado | `app/(erp)/configuracoes/page.tsx` | Abas de perfil, preferências, notificações, usuários, permissões e sistema; sem vínculo atual ao banco de usuários/permissões.
CI de testes/build | parcial | `.github/workflows/verify-build.yml` | Testa/build em PR; filtros de paths e atualização automática do lockfile precisam revisão.

## Revisão de 21/10/2026 — programação multimestre

As páginas mensais originais eram demonstrações estáticas. Foram substituídas por `components/programacao-mensal.tsx` e `/api/programacao-mensal`. Importador reaproveitado: `lib/import-reader.ts`; parser/liberação industrial preservados. Não existe CSV de exemplo versionado. `pcp_programacoes.data_programacao` fornece competência dos dados legados, projetados sem cópia por views. Novos lotes/itens são a camada de planejamento mensal, sem duplicar ordens/produção. Detalhes, dependências, limites e validação: `RELATORIO_PROGRAMACAO_MULTIMES.md`. Referências e sequência de evolução ERP: `REFERENCIAS_ERP_INDUSTRIAL.md`.

## Prompt Master — revisão incremental

| Item | Situação | Arquivos | Observação |
| --- | --- | --- | --- |
| Unidades globais e acessos centrais | existente | `lib/unidades`, `app/(erp)/acessos`, migrações 04/05 | Implementado no código anteriormente; inventário antigo acima não representa este estado. Configuração/homologação reais não verificadas neste incremento |
| Engenharia, OF e campanhas | existente parcial | `lib/engenharia.ts`, `app/api/engenharia`, `app/api/ordens-fabricacao`, `app/api/marketing`, migrações 06/07 | BOM/OF persistentes e MRP consultivo existentes; OFs filhas e consumo automático ainda não implementados |
| Recorte de PCP e apontamento | melhorado | `lib/pcp-filters.ts`, `hooks/use-pcp-filters.ts`, `components/pcp-filter-bar.tsx`, APIs e páginas existentes | Mesmo contrato SQL/URL para mês, filtro e pedido; não cria tabelas ou segundo módulo |
| Visão geral por data | melhorado | `app/api/pcp/painel/route.ts`, `app/(erp)/pcp-painel/page.tsx` | Produtos e operações do mesmo recorte, sem limitar à última programação |
| Data civil e precisão do apontamento | melhorado | `lib/carteira.ts`, `lib/apontamento.ts`, `tests/pcp-filtros-master.test.ts` | Fuso explícito e até três casas decimais |
| Concorrência da seleção e OF congelada | melhorado | `components/operational-provider.tsx`, `app/api/programacoes/ativa/route.ts` | Descarte de resposta obsoleta; preservação de roteiros em programações com OF |


| Item | Situação | Arquivos | Observação |
| --- | --- | --- | --- |
| Entradas de módulo por unidade | melhorado | `app/(erp)/pcp/[unidade]`, `apontamento/[unidade]`, `estoque/[unidade]`, páginas mensais Sul/Nordeste existentes, `lib/unidades/module-page.tsx` | Reutiliza páginas existentes; valida perfil/grants no servidor antes de selecionar a unidade. Consolidado detalhado ainda pendente |
| Validação de unidade em consulta | melhorado | `lib/unidades/core.ts`, `handler.ts`, seletor | URL não muda fonte; troca elimina query antiga |
| Situação da competência mensal | criado | migração 08, `lib/programacao-mensal-service.ts`, API e componente mensal existentes | Conceito não existia: lotes tinham status próprio, distinto de mês ativo/planejado/encerrado. Sem tabela de programação paralela |
| Filtros mensais por pedido e status | melhorado | `lib/programacao-mensal.ts`, service e componente mensal | Mesmos filtros alcançam lista, totais, gráfico e exportação |


## Etapa A

| Item | Situação | Arquivos | Observação |
| --- | --- | --- | --- |
| Recorte nas visões restantes | melhorado | provider operacional, páginas industriais, APIs de carteira/entregas/gestão/perdas/inteligência/estoque | Query canônica com parâmetros repetidos; metadados sem vínculo industrial permanecem globais da unidade |
| Consolidado por módulo | melhorado | API consolidada existente, `consolidado-modulo.ts`, componente de detalhe | PCP, operações, programação e estoque; paginação distribuída entre fontes; nenhuma soma de unidades incompatíveis |
| Importação em passos | melhorado | componente mensal e hook existentes | Unidade/mês → arquivo → prévia/confirmação; restauração e exportação compartilham recorte |
| Arquivamento seguro | melhorado | APIs de programação/histórico, migração 09 | Retém linhas e eventos; ausente a migração, ação bloqueada com mensagem explícita |

## Etapa B — ciclo integrado

| Item | Situação | Arquivos principais | Observação |
| --- | --- | --- | --- |
| Roteiros e versões de produção | criado (conceitos ausentes) | migração 10, `lib/ciclo-industrial.ts`, APIs/componente de engenharia existentes | Operações versionadas em JSON validado; cada componente da BOM pertence a uma operação; aprovação imutável; validade e faixa de lote sem sobreposição |
| Centros e turnos | melhorado | `pcp_capacidades_maquina`, migração 10, engenharia | Reaproveita capacidade/máquina/turno; calendário semanal e empresa/filial, sem segundo cadastro de centros |
| OF e semiacabados | melhorado | `erp_ordens_fabricacao`, `pcp_operacoes`, migração 10, `components/of-ciclo.tsx` | Snapshot, árvore, filhos sem duplicar demanda, reserva na confirmação, consumo direto por operação; OFs antigas preservadas |
| Apontamentos e estoque | melhorado | `pcp_apontamentos`, `est_movimentos`, migração 10, rota de operações existente | Transação, locks, idempotência, boa/refugo/tempos, parcial, entrada automática, estorno inverso incluindo reservas e pendência com reprocessamento |
| Lotes, séries e custos | criado/melhorado | `est_lotes`, associação `est_custeio_alocacoes`, ledger existente, `components/estoque-ciclo.tsx` | Lote/serial, custo médio no ledger e alocação PEPS auxiliar imutável; sem segunda tabela de movimentos |
| Pallets e rastreio | melhorado | `pcp_pallets`, consultas de estoque existentes | Pallet nasce do apontamento de acabado, pendente de qualidade; estorno bloqueia o pallet, liberação prévia impede estorno; rastreio por lote/OF/apontamento/pallet/pedido |
| Transferência entre fontes | criado (documento antes ausente) | migração 11, `lib/transferencias-unidades.ts`, API de estoque existente | Intenção central → saída operacional → em trânsito → recebimento no outro banco; retomada idempotente e mapeamento explícito de produto/depósito |
| Chão de fábrica PWA | melhorado | apontamento existente, `lib/chao-fila.ts`, manifest e contingência públicos | QR de operação, câmera quando suportada, IndexedDB por login/unidade, reenvio com chave e identidade; não armazena cookies ou respostas privadas no service worker |

## Rodada completa — etapa A

| Item | Situação | Arquivos | Observação |
| --- | --- | --- | --- |
| Cliente em visões operacionais | melhorado | `lib/clientes-operacionais.ts`, APIs de apontamento/programação/OF/carteira/entregas/pallets/rastreio e componentes existentes | Reutiliza CRM por ID; código/documento só resolve cadastro único; fallback da programação. Não cria cadastro paralelo |
| Filtros cliente/representante | melhorado | hook, filtros e APIs existentes; programação mensal e consolidado | Mesma URL, múltipla seleção, resumo/tabela no mesmo recorte. Projeção nova da migração 12; opção indisponível sem projeção |
| Códigos mestres e projeção | melhorado/criado (leitura) | migração 12 | Códigos opcionais em entidades existentes e view de identidade por produto/pedido; sem backfill assumido e sem execução real |
| Permissão por processo | corrigido | regra central em `lib/apontamento.ts`, APIs de leitura/histórico/escrita | Setor vazio de líder/apontador não é acesso total |
| Histórico e importação em passos | já existia | migrações 09, componente mensal | Preservados; não recriados. Filtros comerciais adicionados a URL e preferências |
| Auditoria de todas as entradas | criado (relatório) | `docs/AUDITORIA_GERAL.md` | 44 páginas e 73 APIs inspecionadas estaticamente; homologação navegada com dados reais ainda pendente |

## Rodada B — controle de execução e instruções

| Item | Estado | Arquivos | Observação |
| --- | --- | --- | --- |
| Bloqueio/cancelamento de OF | Melhorado | migração 13, ciclo-industrial, of-ciclo | Bloqueio herdado pelos filhos; cancelamento da árvore sem execução libera reservas no ledger e audita; nenhuma OF removida |
| Instrução do operador | Melhorado | engenharia-ciclo, of-ciclo, operacaoRoteiro | Texto/revisão fazem parte do roteiro aprovado e snapshot existente; não substitui gestão documental completa da H |
| Leitura por setor da OF | Melhorado | ciclo-consultas, API ordens-fabricacao | Sem setores não vê detalhe; componentes, movimentos, apontamentos e operações limitados ao setor autorizado |
| Ciclo com semiacabado | Já existia / ampliado | tests/ciclo-industrial.test.ts | Regressão completa inclui bloqueio herdado, cancelamento com reserva e tentativa com execução |
