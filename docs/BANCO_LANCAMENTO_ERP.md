# Banco de dados — o que lançar para o ERP industrial (migrações 14 a 24)

Nada aqui foi executado em banco remoto. Quem aplica é o administrador, na unidade, com backup do Neon feito antes. Os roteiros up/verify/down/baseline de cada migração estão em `docs/banco/` (gerados por `npm run db:package`; 34 migrações no total, as 11 novas são as de ordem 24 a 34).

## 1. Antes de começar (por unidade: Sul e Nordeste)
1. Criar branch/snapshot de backup no Neon e anotar o nome (`NEON_BRANCH_NAME`).
2. Rodar `00_precheck.sql` e guardar o resultado.
3. Confirmar que a migração 13 (`controle_of`) e as anteriores já constam em `schema_migrations`. Se a unidade ainda não as tem, seguir primeiro `docs/BANCO_IMPLANTACAO.md`.
4. Conferir a unidade homologada em `erp_identidade_banco` (Sul ou Nordeste) antes de aplicar.

## 2. Ordem de aplicação (cada uma é aditiva e idempotente; aplicar uma por vez e rodar o `verify`)
| Nº | Arquivo | O que cria | Dados semeados |
| --- | --- | --- | --- |
| 14 | `2026-10-23_14_vendas_comissoes` | pedidos de venda, itens, histórico, regras e ledger imutável de comissões; colunas de crédito no cliente | nenhum |
| 15 | `2026-10-23_15_vendas_producao` | funções de necessidade, disponibilidade, onde-é-usado e rastreio | nenhum |
| 16 | `2026-10-24_16_compras_terceiros` | requisição, cotação, pedido de compra com alçada, recebimento/NF-e, terceirização | alçadas: até R$ 5.000 aprova PCP; acima aprova GERENTE |
| 17 | `2026-10-25_17_qualidade_inspecao` | instrumentos, planos, lotes de inspeção, medições, NC/CAPA | nenhum |
| 18 | `2026-10-26_18_mrp_aps` | MRP líquido, agenda fixa de OF | nenhum |
| 19 | `2026-10-27_19_expedicao_logistica` | remessas, pallets lidos, devoluções, portal do cliente | nenhum |
| 20 | `2026-10-28_20_custos_industriais` | custo padrão, padrão x real por OF | nenhum |
| 21 | `2026-10-29_21_fiscal` | cadastros e regras fiscais com vigência, documentos, apuração | nenhum |
| 22 | `2026-10-30_22_financeiro_contabil` | títulos, baixas, conciliação, plano de contas, razão | nenhum (plano de contas vem vazio) |
| 23 | `2026-10-31_23_manutencao_documentos` | manutenção, documentos controlados, qualificação | qualificação nasce DESLIGADA |
| 24 | `2026-11-01_24_indicadores_integracoes` | alertas, tokens de API, webhooks, painel de indicadores | nenhum |

Observações: a 16 é a única que insere dados (as duas alçadas). A 23 cria gatilhos em `pcp_andon` e `pcp_apontamentos`; a 24 cria gatilhos em `crm_pedidos_venda` e `exp_remessas`. Todas têm `down` testado, mas depois de haver dados reais a reversão deve ser por restauração do backup, não por `down`.

## 3. Variáveis de ambiente
- Já existentes e obrigatórias: `DATABASE_URL` (e as URLs por unidade), `AUTH_SECRET`, `ERP_MULTIUNIDADE`, `ERP_CICLO_INDUSTRIAL`.
- Opcional: `VENDAS_DESCONTO_SEM_APROVACAO` (limite de desconto sem aprovação; padrão 5%).
- Fiscal real e cobrança real: não configurar agora. Sem provedor contratado o sistema opera só em homologação simulada.

## 4. Cadastros que precisam ser lançados depois das migrações (sem eles o módulo abre vazio)
1. **Financeiro:** plano de contas, centros de custo e contas de caixa/banco; mapeamento dos eventos automáticos (entrega, recebimento de compra, baixa).
2. **Fiscal:** NCM, CFOP, regras por produto e cliente com vigência, dados do emitente. Alíquotas IBS/CBS ficam parametrizadas: informar só valores oficiais vigentes.
3. **Estoque:** depósitos, estoque mínimo por item (alimenta o alerta de ruptura), custo de abertura conferido.
4. **Comercial:** limite de crédito e condição de pagamento por cliente; percentual padrão e regras de comissão por representante.
5. **Compras:** conferir as alçadas semeadas; cadastrar fornecedores.
6. **Qualidade:** instrumentos com validade de calibração, planos de inspeção por produto.
7. **Manutenção:** ativos ligados aos centros de capacidade; planos preventivos.
8. **Documentos:** instruções por setor/produto; só então ligar o controle de qualificação.
9. **Expedição:** transportadoras.
10. **Integrações:** gerar tokens e webhooks só quando houver sistema externo para consumir.

## 5. Conferência após cada unidade
- Rodar o `verify` de cada migração e `select count(*) from schema_migrations` (deve subir 11).
- No ERP: abrir /vendas, /compras, /qualidade-inspecao, /expedicao, /custos, /fiscal, /financeiro, /manutencao, /documentos e /indicadores sem erro "aguardando migração".
- Fazer o roteiro do bloco correspondente em `docs/ERP_INDUSTRIAL_ROTEIROS.md`.
- Em /indicadores, "Recalcular alertas" e conferir que os alertas refletem a realidade da unidade.

## 6. Decisões que dependem de você antes de lançar
- Em qual unidade (Sul ou Nordeste) lançar primeiro (recomendado: a menor, como piloto).
- Se o plano de contas vem de planilha da contabilidade (preferível) ou será montado no sistema.
- Quem é o aprovador de documentos e de compras acima de R$ 5.000 (alçadas).
- Se alertas e envio de webhooks serão disparados por agendador (recomendado a cada 15 min) ou só por botão.
- Data de início do controle de qualificação por posto.
