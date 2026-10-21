# Arquitetura alvo incremental

## Princípios

- Monólito modular no App Router; manter rotas atuais como adaptadores durante a migração.
- Domínios: identidade/tenancy, cadastro, compras, estoque, PCP, qualidade, vendas/logística, financeiro, manutenção e IA.
- Cada domínio separa regras puras, casos de uso, persistência e UI. Não mover `app/` em massa.
- APIs novas sob `/api/v1`; manter contratos atuais e encaminhar para os mesmos serviços até descontinuação explícita.
- Zod na borda HTTP; RBAC e escopo empresa/filial no caso de uso e no repositório.
- Postgres/Neon como fonte transacional; avaliar Drizzle para queries tipadas e migrations versionadas. A adoção deve ser incremental e não coexistir como segundo dono do schema.
- Evento de domínio e registro outbox na mesma transação da escrita; worker idempotente para envio/retentativa.
- Arquivos em storage privado S3 compatível ou Vercel Blob, com metadados no banco, URL curta assinada e validação de tipo/tamanho.
- IA consulta somente ferramentas tipadas; escrita operacional requer confirmação explícita do usuário.

## Modelo conceitual

```mermaid
erDiagram
  EMPRESA ||--o{ FILIAL : possui
  EMPRESA ||--o{ USUARIO_EMPRESA : autoriza
  USUARIO ||--o{ USUARIO_EMPRESA : participa
  PAPEL ||--o{ USUARIO_EMPRESA : atribui
  EMPRESA ||--o{ CLIENTE : cadastra
  EMPRESA ||--o{ FORNECEDOR : cadastra
  EMPRESA ||--o{ ITEM : mantém
  ITEM ||--o{ UNIDADE_CONVERSAO : converte
  ITEM ||--o{ BOM_VERSAO : estrutura
  BOM_VERSAO ||--|{ BOM_COMPONENTE : detalha
  ITEM ||--o{ ROTEIRO : percorre
  ROTEIRO ||--|{ OPERACAO_ROTEIRO : define
  CLIENTE ||--o{ PEDIDO_VENDA : compra
  PEDIDO_VENDA ||--|{ ITEM_PEDIDO : contém
  ITEM ||--o{ ITEM_PEDIDO : referencia
  FORNECEDOR ||--o{ PEDIDO_COMPRA : atende
  PEDIDO_COMPRA ||--|{ ITEM_COMPRA : contém
  ITEM ||--o{ ITEM_COMPRA : referencia
  ITEM ||--o{ SALDO_ESTOQUE : contabiliza
  LOCAL_ESTOQUE ||--o{ SALDO_ESTOQUE : armazena
  LOTE ||--o{ SALDO_ESTOQUE : identifica
  ITEM ||--o{ MOVIMENTO_ESTOQUE : registra
  PEDIDO_VENDA ||--o{ ORDEM_FABRICACAO : origina
  ORDEM_FABRICACAO ||--|{ OF_OPERACAO : executa
  OF_OPERACAO ||--o{ APONTAMENTO : recebe
  ORDEM_FABRICACAO ||--o{ PALLET : produz
  PEDIDO_VENDA ||--o{ MEDICAO : exige
  PEDIDO_VENDA ||--o{ ATENDIMENTO_SAC : relaciona
  PALLET ||--o{ INSPECAO : verifica
  ROMANEIO ||--|{ ROMANEIO_PALLET : agrupa
  PALLET ||--o{ ROMANEIO_PALLET : embarca
  ROMANEIO ||--o{ EVENTO_ENTREGA : registra
  EMPRESA ||--o{ AUDITORIA : escopa
  EMPRESA ||--o{ OUTBOX : publica
  ENTIDADE ||--o{ ANEXO : evidencia
```

Cadastros globais (ex.: unidade de medida) podem ser compartilhados. Cadastros e movimentos operacionais devem carregar escopo de empresa/filial, ou derivá-lo por FK obrigatória em transações; queries não podem inferir escopo do cliente.

## Jobs e deploy

Cron da Vercel pode despachar itens outbox pequenos. MRP, extração documental e relatórios demorados devem usar worker/fila externa com retry, dead-letter, idempotency key e observabilidade. CI deve executar `npm ci`, lint, tipos, testes e build; migrations só em etapa controlada de ambiente de homologação.
