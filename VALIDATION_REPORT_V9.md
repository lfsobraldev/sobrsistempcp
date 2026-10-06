# Validation Report V9

- `npm test`: **PASS** — 4/4 testes.
- Verificação sintática TypeScript/TSX com `transpileModule`: **0 diagnostics**.
- `npm run typecheck`: não concluído porque as dependências do ZIP base estavam sem conteúdo em `node_modules`; `npm install` sofreu timeout de transporte neste ambiente.
- `npm run build`: não afirmado como validado pelo mesmo motivo.

## Testes cobertos
- Batentes e travessas da mesma largura juntos, largura maior → menor.
- OEE sem dados suficientes.
- Classificação de risco explicável.
- Pareto de perdas.

## Banco
Executar em ordem, se ainda não executadas:
1. `database/migrations/2026-10-02_pallet_quality_msac.sql`
2. `database/migrations/2026-10-02_pallet_quality_v2.sql`
3. `database/migrations/2026-10-06_operational_excellence.sql`
