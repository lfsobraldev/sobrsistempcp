# Inventário único de migrações

Ordem topológica do catálogo. Pré-requisito: schema-base e controle 00_registro.sql. Escopo deve ser conferido por banco. Risco é estimativa estática, não autorização.

| Ordem | Arquivo | O que faz | Dependências declaradas | Reversão | Dados/cadastros | Risco |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-02_pallet_quality_msac.sql | Pallets, inspeções Qualidade/MSAC, fotos e eventos | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | médio |
| 2 | 2026-10-02_pallet_quality_v2.sql | Não conformidades e medições de pallets | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | baixo |
| 3 | 2026-10-06_operational_excellence.sql | Andon, perdas, capacidades, metas, setups e ações operacionais | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | alto |
| 4 | 2026-10-08_quality_user.sql | Usuários e restrição de perfis; pode conflitar com perfis comerciais já cadastrados | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | alto |
| 5 | 2026-10-09_tipo_pedido_embalagem.sql | Tipo de pedido e montagem para embalagem; normaliza valores existentes | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | médio |
| 6 | 2026-10-12_ia.sql | Logs de IA e histórico de romaneios | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | alto |
| 7 | 2026-10-16_local_montagem.sql | Local de montagem por pedido | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | baixo |
| 8 | 2026-10-19_sac_industrial.sql | SAC, eventos e ampliação de perfis | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | médio |
| 9 | 2026-10-20_crm_comercial.sql | Clientes, representantes, oportunidades, propostas e vínculos de entregas | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | médio |
| 10 | 2026-10-20_medicoes_engenharia.sql | Medições/revisões/aprovação técnica vinculadas ao CRM | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | médio |
| 11 | 2026-10-21_02_schema_migrations.sql | Controle de checksum, aplicação, baseline e eventos de migração | Schema-base/legado | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | baixo |
| 12 | 2026-10-21_fundacao_multiempresa.sql | Empresas, filiais, vínculos, permissões e auditoria imutável | Schema-base/legado | sem down automático; conservar dados | Estrutura/funções; conferir fonte | alto |
| 13 | 2026-10-21_03_programacao_multimes.sql | Lotes/itens mensais, acessos e projeção legada; cadastros técnicos PCP_LEGADO/SUL/NORDESTE | 2026-10-21_fundacao_multiempresa.sql | down disponível; revisar alcance e destrutividade | Sim/avaliar fonte | alto |
| 14 | 2026-10-21_04_unidades_globais.sql | Identidade homologada do banco e projeção legada por unidade | 2026-10-21_03_programacao_multimes.sql | down disponível; revisar alcance e destrutividade | Sim/avaliar fonte | alto |
| 15 | 2026-10-21_05_acessos_centrais.sql | Perfis e grants centrais por unidade, etapa e turno | 2026-10-21_fundacao_multiempresa.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | alto |
| 16 | 2026-10-21_06_engenharia_of.sql | Bootstrap do estoque existente, classificações, BOM, explosão e OF | 2026-10-21_04_unidades_globais.sql | down disponível; revisar alcance e destrutividade | Sim/avaliar fonte | alto |
| 17 | 2026-10-21_07_marketing.sql | Campanhas, despesas imutáveis e vínculo com CRM | 2026-10-20_crm_comercial.sql, 2026-10-21_fundacao_multiempresa.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | baixo |
| 18 | 2026-10-21_08_competencias_programacao.sql | Competências ativas/planejadas/encerradas, preenchimento inicial e proteção de lotes | 2026-10-21_04_unidades_globais.sql | down disponível; revisar alcance e destrutividade | Sim/avaliar fonte | alto |
| 19 | 2026-10-22_09_historico_seguro.sql | Arquivamento auditado sem apagar programações | 2026-10-21_fundacao_multiempresa.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | médio |
| 20 | 2026-10-22_10_ciclo_industrial.sql | Roteiros/versões, OF filhas/snapshot/reservas, apontamentos, ledger, lotes e custos | 2026-10-21_06_engenharia_of.sql, 2026-10-22_09_historico_seguro.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | alto |
| 21 | 2026-10-22_11_transferencias_unidades.sql | Documento central de transferência em trânsito entre bancos | 2026-10-22_10_ciclo_industrial.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | alto |
| 22 | 2026-10-22_12_identidades_operacionais.sql | Códigos mestres e resolução unificada de cliente/representante nos documentos | 2026-10-20_crm_comercial.sql, 2026-10-22_10_ciclo_industrial.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | alto |
| 23 | 2026-10-22_13_controle_of.sql | Bloqueio herdado e cancelamento da árvore com liberação de reservas | 2026-10-22_10_ciclo_industrial.sql | sem down automático; conservar dados | Estrutura/funções; conferir fonte | alto |
| 24 | 2026-10-23_14_vendas_comissoes.sql | Pedidos de venda, aprovação/crédito, regras e ledger imutável de comissões | 2026-10-22_12_identidades_operacionais.sql | down disponível; revisar alcance e destrutividade | Estrutura/funções; conferir fonte | baixo |

Dependências implícitas: qualidade_v2 depende de pallets/MSAC; medições depende do CRM; 10 usa capacidades (operational_excellence), pallets e estoque. Fundação depende de usuários. A 11 fica no banco central, mas depende funcionalmente da 10 em ambas as unidades — não copiar ledger operacional para satisfazer o catálogo. Não aplicar a 03 isolada da 04: a projeção temporária anterior assume Sul.
