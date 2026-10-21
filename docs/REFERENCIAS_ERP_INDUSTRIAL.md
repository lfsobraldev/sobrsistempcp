# Referências para evolução do Sobral ERP

Pesquisa em documentação oficial em 21/10/2026. SAP S/4HANA, Oracle Fusion e Microsoft Dynamics 365 foram usados como referências de processos; esta análise não é um ranking independente de participação de mercado nem uma promessa de equivalência funcional.

| Referência | Prática documentada | Aplicação incremental no Sobral |
| --- | --- | --- |
| [SAP S/4HANA Manufacturing](https://www.sap.com/mena-ar/products/scm/manufacturing-for-planning-and-scheduling.html) | Planejamento integrado a vendas, estoque, capacidade e execução | Primeiro consolidar competência/unidade e dados reais; depois MRP e restrições de capacidade |
| [Oracle Manufacturing: ordens](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25c/faumf/overview-of-work-orders.html) | OF com produto, operações, recursos, componentes, quantidades e datas | Evoluir referência textual de OF para entidade rastreável, reaproveitando operações existentes |
| [Dynamics 365 Supply Chain](https://learn.microsoft.com/en-us/dynamics365/supply-chain/) | Cadeia integrada de planejamento, compras, produção, estoque e logística | Usar permissões de filial e indicadores coerentes no mesmo fluxo, sem criar cadastros paralelos |

## Sequência proposta a partir do código atual

1. Fechar e homologar programação por mês/unidade — implementação desta branch; migração ainda não aplicada em produção.
2. Conectar demanda comercial e medição aprovada ao plano; instituir OF persistente e estrutura de componentes/roteiro versionada, reaproveitando produtos/operações.
3. MRP: calcular necessidades líquidas usando saldos, reservas e compras. Separar insumos, semiacabados e acabados por cadastro explícito; sugerir classificação por regras revisáveis, sem mover saldos automaticamente por texto da descrição. Usar locais para distinguir galpões.
4. Compras/suprimentos e recebimento com qualidade; aprovações por valor e disponibilidade de materiais para a OF.
5. Execução e custos por OF; apontamentos, perdas, capacidade, manutenção e identificação por lote. Reaproveitar pallets e QR atuais.
6. Expedição com conferência, eventos/fotos de recebimento e rastreio até cliente/SAC; conectar romaneios e entregas existentes.
7. Financeiro/fiscal/contabilidade com regras brasileiras homologadas e integrações apropriadas; não criar emissão fiscal fictícia nem prometer conformidade sem validação.

Para cada etapa: investigar o existente, ampliar schema sem destruição, impor RBAC e auditoria, testar transações/repetições e homologar com dados reais antes de promover. O objetivo é integração efetiva, não apenas novas telas.
