#!/usr/bin/env tsx

import { applyPendingMigrations, canApplyAdminMigrations } from "../lib/migration-service";

async function main() {
  if (process.env.ALLOW_ADMIN_MIGRATIONS !== "true") {
    throw new Error("ALLOW_ADMIN_MIGRATIONS=true é obrigatório para executar migrações via CLI.");
  }

  const actor = process.env.MIGRATION_ACTOR || process.env.USER || "system";
  const result = await applyPendingMigrations(actor);
  console.log(JSON.stringify({ ok: result.ok, actor, pending: result.pending.length }, null, 2));
  for (const item of result.pending) {
    console.log(`- ${item.name} (${item.checksum.slice(0, 12)})`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
