import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sql } from "@/lib/db";

export const migrationFileSchema = z.object({
  name: z.string(),
  checksum: z.string(),
  up: z.string().nullable(),
  down: z.string().nullable(),
  reverse: z.boolean(),
  status: z.enum(["pending", "applied", "checksum-mismatch", "failed", "reverted"]).default("pending"),
  checksumMismatch: z.boolean().default(false),
  appliedAt: z.string().nullable().default(null),
  appliedBy: z.string().nullable().default(null),
  lastStatus: z.string().nullable().default(null),
});

export type MigrationFileInfo = z.infer<typeof migrationFileSchema>;

export async function listMigrationFiles(): Promise<MigrationFileInfo[]> {
  const dir = path.join(process.cwd(), "database", "migrations");
  const entries = await readdir(dir);
  const files = entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  const result: MigrationFileInfo[] = [];
  for (const file of files) {
    const source = await readFile(path.join(dir, file), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const matchUp = source.match(/--\s*migrate:up\s*\n([\s\S]*?)(?:\n--\s*migrate:down\s*\n|$)/i);
    const matchDown = source.match(/--\s*migrate:down\s*\n([\s\S]*)$/i);
    const up = matchUp?.[1]?.trim() || null;
    const down = matchDown?.[1]?.trim() || null;
    result.push({
      name: file,
      checksum,
      up,
      down,
      reverse: Boolean(down && down.length > 0),
      status: "pending",
      checksumMismatch: false,
      appliedAt: null,
      appliedBy: null,
      lastStatus: null,
    });
  }
  return result;
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
    const db = sql();
    const rows = await db`select name, checksum, aplicada_em, aplicada_por, duracao_ms, status, erro from schema_migrations order by name asc`;
    return rows.map((row) => migrationRecordSchema.parse(row));
  } catch {
    return [] as z.infer<typeof migrationRecordSchema>[];
  }
}

export async function getMigrationCatalog() {
  const files = await listMigrationFiles();
  const applied = await loadAppliedMigrations();
  const appliedMap = new Map(applied.map((row) => [row.name, row]));
  const migrations = files.map((file) => {
    const record = appliedMap.get(file.name);
    const checksumMismatch = Boolean(record && record.checksum !== file.checksum);
    let status: MigrationFileInfo["status"] = "pending";

    if (record) {
      if (checksumMismatch) {
        status = "checksum-mismatch";
      } else if (record.status === "APLICADA") {
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
      allow: process.env.ALLOW_ADMIN_MIGRATIONS === "true",
    },
    migrations,
    schema: applied,
    pendingCount: migrations.filter((entry) => entry.status === "pending").length,
    checksumDriftCount: migrations.filter((entry) => entry.checksumMismatch).length,
  } as const;

  return catalog;
}

export async function canApplyAdminMigrations() {
  return process.env.ALLOW_ADMIN_MIGRATIONS === "true";
}

export async function applyPendingMigrations(actor: string) {
  const files = await listMigrationFiles();
  const applied = await loadAppliedMigrations();
  const appliedMap = new Map(applied.map((row) => [row.name, row]));

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      actor,
      reason: "DATABASE_URL não configurada; a execução real fica bloqueada até o ambiente do Neon ser informado.",
      pending: files
        .filter((file) => !appliedMap.has(file.name) || appliedMap.get(file.name)?.checksum !== file.checksum)
        .map(({ name, checksum, up }) => ({ name, checksum, sql: up || "" })),
    };
  }

  const pending = files
    .filter((file) => !appliedMap.has(file.name) || appliedMap.get(file.name)?.checksum !== file.checksum)
    .map(({ name, checksum, up }) => ({ name, checksum, sql: up || "" }));

  return {
    ok: true,
    actor,
    pending,
    dryRun: false,
  };
}

export async function revertLastMigration(actor: string) {
  const files = await listMigrationFiles();
  const applied = await loadAppliedMigrations();
  const appliedNames = new Set(applied.filter((entry) => entry.status === "APLICADA").map((entry) => entry.name));
  const candidate = [...files].reverse().find((file) => appliedNames.has(file.name));

  if (!candidate) {
    return {
      ok: false,
      actor,
      reverted: null,
      reason: "Nenhuma migração aplicada foi localizada para reverter.",
    };
  }

  return {
    ok: true,
    actor,
    reverted: { name: candidate.name, sql: candidate.down || "", reverse: candidate.reverse },
    dryRun: false,
  };
}
