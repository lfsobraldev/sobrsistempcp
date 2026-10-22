# Migrações — procedimento vigente

**Fonte principal: [BANCO_IMPLANTACAO.md](BANCO_IMPLANTACAO.md).** O procedimento anterior prometia executor/baseline automáticos que não estavam implementados. Não usar presença de tabela como prova de aplicação.

- Fontes canônicas: `database/migrations/*.sql`. Não editar arquivo já aplicado nem alterar checksum para esconder divergência.
- `lib/migration-files.ts` lê SQL legado sem marcador e arquivos com up/down, calcula SHA-256 e ordena dependências explícitas. Leitura pura, sem conexão.
- O controle `schema_migrations` distingue APLICADA, BASELINE, REVERTIDA e FALHOU; o catálogo trata BASELINE como aplicado quando checksum coincide.
- `/admin/migracoes` é catálogo somente para administrador central. Sem registro legível, estado desconhecido/aguardando conferência; não simula aplicação.
- Aplicação/reversão automáticas estão bloqueadas. `ALLOW_ADMIN_MIGRATIONS=true` sozinha não as habilita.
- `npm run migrate -- --plan` lista o plano sem banco. Sem `--plan`, aborta com orientação.
- `npm run db:package` gera o pacote SQL/documental; não conecta a banco.
- `npm run db:validate:local` valida todas as migrações em PGlite descartável, vazio com baseline e legado sintético. Não usa DATABASE_URL.
- Execução real: administrador presencial, backup, precheck, baseline confirmado por arquivo, SQL pendente no destino correto, verificação e smoke. Nenhum acesso remoto foi realizado pelo agente.

Os downs conservadores preservam dados/estrutura; não equivalem a rollback completo. Downs destrutivos exigem backup e análise de dependentes. A reversão automática do controle de auditoria é bloqueada no pacote.
