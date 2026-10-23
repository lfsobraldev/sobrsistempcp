#!/usr/bin/env tsx
// Aplica todos os arquivos de docs/banco/colar num banco, na ordem, sem precisar de psql.
// Uso: npm run db:aplicar -- "postgresql://usuario:senha@host/banco?sslmode=require" [central]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const OPERACIONAL = [
  "PARTE_1_de_4.sql", "PARTE_2_de_4.sql", "PARTE_3_de_4.sql", "PARTE_4_de_4.sql",
  "1_registro_de_migracoes_SE_AINDA_NAO_EXISTIR.sql", "2_migracao_25_producao_estoque_financeiro.sql", "3_migracao_26_sac_qualidade_oee.sql",
  "5_migracao_27_wms_revisoes_sobras.sql", "6_migracao_28_rh_ehs_projetos.sql", "7_migracao_29_CENTRAL_cargos_identidade.sql",
  "8_migracao_30_seguranca_aprovacoes_auditoria.sql", "9_migracao_31_embalagem_mrp_horizonte.sql", "10_migracao_32_compras_qualidade_comercial.sql",
  "11_migracao_33_financeiro_fechamento_rateio_margem.sql", "12_migracao_34_plataforma_eventos_campos_notificacoes.sql", "13_migracao_35_pessoas_ehs_projetos.sql",
  "14_migracao_36.sql", "15_migracao_37.sql", "16_migracao_38.sql", "17_migracao_39.sql", "18_migracao_40.sql",
];

async function main() {
  const url = process.argv[2];
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('Informe a URL do banco entre aspas: npm run db:aplicar -- "postgresql://..."');
  const ordem = process.argv[3] === "central" ? ["UNICO_CENTRAL_29.sql"] : OPERACIONAL;
  const dir = path.join(process.cwd(), "docs", "banco", "colar");
  const pool = new Pool({ connectionString: url });
  try {
    for (const f of ordem) {
      const sql = await readFile(path.join(dir, f), "utf8");
      const c = await pool.connect();
      try {
        await c.query(sql);
        console.log(`OK        ${f}`);
      } catch (e: any) {
        try { await c.query("ROLLBACK"); } catch { /* sem transação aberta */ }
        if (/já registrado/i.test(String(e?.message))) console.log(`JÁ HAVIA  ${f}`);
        else { console.error(`ERRO      ${f}\n${e?.message || e}`); process.exitCode = 1; return; }
      } finally { c.release(); }
    }
    console.log("Concluído. Agora cole docs/banco/colar/4_verificar_tudo.sql no SQL Editor do Neon: todas as linhas devem ter ok = true.");
  } finally { await pool.end(); }
}
void main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
