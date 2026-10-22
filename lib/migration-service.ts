import { z } from "zod";
import { readMigrationSources } from "./migration-files";
import { identitySql } from "@/lib/db";

export const migrationFileSchema = z.object({
  name: z.string(),
  checksum: z.string(),
  up: z.string().nullable(),
  down: z.string().nullable(),
  reverse: z.boolean(),
  status: z.enum(["pending", "applied", "checksum-mismatch", "failed", "reverted", "unknown"]).default("pending"),
  checksumMismatch: z.boolean().default(false),
  appliedAt: z.string().nullable().default(null),
  appliedBy: z.string().nullable().default(null),
  lastStatus: z.string().nullable().default(null),
});

export type MigrationFileInfo = z.infer<typeof migrationFileSchema>;

export async function listMigrationFiles(): Promise<MigrationFileInfo[]> {
  const files = await readMigrationSources();
  return files.map(file => ({...file, status:"pending" as const,checksumMismatch:false,appliedAt:null,appliedBy:null,lastStatus:null}));
}

export const migrationRecordSchema = z.object({
  name: z.string(),
  checksum: z.string(),
  aplicada_em: z.string().nullable(),
  aplicada_por: z.string().nullable(),
  duracao_ms: z.number().nullable(),
  status: z.string(),
  erro: z.string().nullable(),
});

async function loadAppliedMigrations() {
  if (!process.env.DATABASE_URL) {
    return [] as z.infer<typeof migrationRecordSchema>[];
  }

  try {
    const db = identitySql();
    const rows = await db`select name, checksum, aplicada_em, aplicada_por, duracao_ms, status, erro from schema_migrations order by name asc`;
    return rows.map((row) => migrationRecordSchema.parse(row));
  } catch {
    throw new Error("Não foi possível conferir schema_migrations. Estado de aplicação desconhecido; não aplicar novamente por suposição.");
  }
}

export async function getMigrationCatalog() {
  const files = await listMigrationFiles();
  const applied = await loadAppliedMigrations();
  const appliedMap = new Map(applied.map((row) => [row.name, row]));
  const migrations = files.map((file) => {
    const record = appliedMap.get(file.name);
    const checksumMismatch = Boolean(record && record.checksum !== file.checksum);
    let status: MigrationFileInfo["status"] = process.env.DATABASE_URL ? "pending" : "unknown";

    if (record) {
      if (checksumMismatch) {
        status = "checksum-mismatch";
      } else if (record.status === "APLICADA" || record.status === "BASELINE") {
        status = "applied";
      } else if (record.status === "REVERTIDA") {
        status = "reverted";
      } else if (record.status === "FALHOU") {
        status = "failed";
      }
    }

    return {
      ...file,
      status,
      checksumMismatch,
      appliedAt: record?.aplicada_em ?? null,
      appliedBy: record?.aplicada_por ?? null,
      lastStatus: record?.status ?? null,
    } satisfies MigrationFileInfo;
  });

  const catalog = {
    environment: {
      database: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") : "unconfigured",
      branch: process.env.NEON_BRANCH_NAME || process.env.VERCEL_GIT_COMMIT_REF || "local",
      production: (process.env.NODE_ENV || process.env.VERCEL_ENV || "development").toLowerCase() === "production",
      allow: false,
      requested: process.env.ALLOW_ADMIN_MIGRATIONS === "true",
    },
    migrations,
    schema: applied,
    pendingCount: migrations.filter((entry) => entry.status === "pending").length,
    checksumDriftCount: migrations.filter((entry) => entry.checksumMismatch).length,
  } as const;

  return catalog;
}

/** Executor remoto não foi homologado; flag sozinha não transforma plano em execução. */
export async function canApplyAdminMigrations() { return false; }
export async function applyPendingMigrations(actor:string) {
  const files=await listMigrationFiles();
  return {ok:false,actor,dryRun:true,reason:"Aplicação automática indisponível. Use o pacote revisado docs/BANCO_IMPLANTACAO.md com o administrador presencial.",pending:files.map(({name,checksum,up})=>({name,checksum,sql:up||""}))};
}
export async function revertLastMigration(actor:string) {
 return {ok:false,actor,dryRun:true,reverted:null,reason:"Reversão automática indisponível; use o roteiro por migração e o backup."};
}
