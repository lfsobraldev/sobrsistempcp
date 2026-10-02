# Sobral PCP Industrial V7 — ERP + PCP + APS + MES

Reengenharia completa da V6 com rotas reais do Next.js, shell persistente e polling separado da sessão.

## Correções críticas
- Navegação não é mais controlada por um `useState<View>` global.
- Cada tela possui URL real (`/dashboard`, `/programacao`, `/sequenciamento`, `/lideres`, `/apontamentos`, `/fluxo`, `/andon`, `/performance`, `/historico`, `/configuracoes`).
- A sessão é carregada uma vez; o polling de 2,5s atualiza somente dados operacionais.
- Não há `alert()`, `prompt()` ou `confirm()` na interface operacional.
- Andon usa modal; detalhes de OF usam drawer; feedback usa toast.

## Filtro 51 — teste de regressão bloqueante
O parser exige, para filtro 51:
- 837 linhas
- 21 pedidos
- 831 OFs
- 42.796 peças
- 2.442 operações
- Preparação 49
- Usinagem 1 579
- Lixar 449
- Recobridora 682
- Usinagem 2 430
- Lustração 96
- Terceiros 11
- Embalagem 146
- Expedição 0

Se não bater, a liberação é bloqueada.

## Rota
N/A, vazio, hífen e N/D = não pertence ao processo.
0 = processo válido não iniciado.
1–99,99 = parcialmente executado.
100 = concluído.

## Banco
Execute `database/schema.sql` no Neon antes do deploy.

## Vercel mínimo
- DATABASE_URL
- AUTH_SECRET
- ADMIN_USER
- ADMIN_INITIAL_PASSWORD

O ADMIN é tratado como perfil PCP.

## Build
```bash
npm install
npm run build
```
