import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const up = async (f: string) => (await readFile(`database/migrations/${f}`, "utf8")).split("-- migrate:down")[0].replace(/create extension if not exists pgcrypto;/gi, "");
const BASE = ["2026-10-19_sac_industrial.sql", "2026-10-21_06_engenharia_of.sql", "2026-10-22_09_historico_seguro.sql", "2026-10-22_10_ciclo_industrial.sql", "2026-10-22_13_controle_of.sql", "2026-10-20_crm_comercial.sql", "2026-10-23_14_vendas_comissoes.sql", "2026-10-23_15_vendas_producao.sql", "2026-10-24_16_compras_terceiros.sql", "2026-10-25_17_qualidade_inspecao.sql", "2026-10-26_18_mrp_aps.sql", "2026-10-27_19_expedicao_logistica.sql", "2026-10-28_20_custos_industriais.sql", "2026-10-29_21_fiscal.sql", "2026-10-30_22_financeiro_contabil.sql", "2026-10-31_23_manutencao_documentos.sql", "2026-11-01_24_indicadores_integracoes.sql", "2026-11-02_25_pendencias_producao_estoque_financeiro.sql", "2026-11-03_26_sac_qualidade_oee.sql"];

/** Cria um banco em memória com a cadeia completa de migrações (cada uma aplicada duas vezes para provar idempotência). */
export async function bancoCompleto() {
  const db = new PGlite();
  await db.exec((await readFile("database/schema.sql", "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
  await db.exec("create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);");
  await db.exec(await up("2026-10-21_fundacao_multiempresa.sql"));
  const novas = readdirSync("database/migrations").filter((f) => /^2026-11-(0[4-9]|[1-3]\d)_\d+_/.test(f)).sort();
  for (const f of [...BASE, ...novas]) {
    const s = await up(f);
    await db.exec(s);
    if (/_(10|13|16|17|18|19|20|21|22|23|24|25|26|27|28|29|3\d)_/.test(f)) await db.exec(s);
  }
  const one = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows[0];
  const all = async <T extends Record<string, unknown>>(q: string, a: unknown[] = []) => (await db.query<T>(q, a)).rows;
  return { db, one, all, n: (v: unknown) => Number(v) };
}
