# Migrações do sistema

## Objetivo

As migrações do banco devem ser versionadas em arquivos SQL dentro de `database/migrations`, executadas em ordem cronológica e sempre pelo mecanismo interno do sistema, nunca por SQL editor manual em Neon.

## Convenção de arquivo

- Nome: `YYYY-MM-DD_NN_descricao.sql`
- Ordem: crescente pela data e número sequencial
- Estrutura obrigatória:
  - `-- migrate:up` para criação/alteração
  - `-- migrate:down` para reversão
- O serviço de migração calcula o checksum SHA-256 do arquivo para detectar alteração depois da aplicação.

## Fluxo de geração

1. Crie uma migration nova em `database/migrations`.
2. Inclua apenas DDL/DDL seguro e preservando dados existentes.
3. Defina `-- migrate:up` e `-- migrate:down` com SQL idempotente quando possível.
4. Verifique a sequência e a compatibilidade com a última migration já presente.
5. Teste no ambiente de branch do Neon antes de liberar em produção.

## Aplicar pelo painel

1. Defina a variável `ALLOW_ADMIN_MIGRATIONS=true` no ambiente.
2. Acesse `/admin/migracoes` como super-administrador.
3. Revise a tabela de migrações pendentes e o checksum.
4. Confirme com a palavra do ambiente antes de acionar `Aplicar pendentes`.
5. O painel só executa arquivos do repositório; não aceita SQL digitado.

## Aplicar via CLI

```bash
ALLOW_ADMIN_MIGRATIONS=true npm run migrate
```

O script lê a pasta de migrações, ordena por nome e aplica apenas as pendentes. O fluxo deve ser acionado por um administrador autorizado e não por um editor manual do banco.

## Reverter

- Use `Reverter última` no painel quando a operação for marcada como reversível.
- Em CLI, o mecanismo deve garantir a última migração aplicada no arquivo de registro e executar o bloco `-- migrate:down` correspondente.
- Qualquer falha deve parar na primeira exceção, registrar o erro e deixar o banco em estado consistente.

## Observações de segurança

- O painel exige ambiente controlado e não fica habilitado por padrão.
- O nome do banco/branch deve ser exibido, sem expor senha.
- Em produção, a tela deve sinalizar claramente o risco e exigir confirmação explícita.
- Auditoria registra quem aplicou, quando e qual foi o resultado.

## Baseline

Se a tabela `schema_migrations` já existir em um ambiente, o mecanismo registra o estado atual como baseline sem reexecutar SQL antigo.
