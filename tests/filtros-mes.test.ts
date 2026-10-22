import { test } from "node:test";
import assert from "node:assert/strict";
import { mesesReferencia, opcoesPCP, lerFiltrosPCP } from "@/lib/pcp-filters";

test("mês atual e próximo mês, inclusive virada de ano", () => {
  assert.deepEqual(mesesReferencia(new Date("2026-10-22T15:00:00-03:00")), { atual: "2026-10", proximo: "2026-11" });
  assert.deepEqual(mesesReferencia(new Date("2026-12-31T23:30:00-03:00")), { atual: "2026-12", proximo: "2027-01" });
});

test("opções de filtros acompanham o mês escolhido e o próximo mês sempre existe", async () => {
  const chamadas: Array<{ sql: string; args?: unknown[] }> = [];
  const db = {
    query: async (sql: string, args?: unknown[]) => {
      chamadas.push({ sql, args });
      if (/to_regclass/.test(sql)) return [{ existe: false }];
      return [{ filtros: ["52"], meses: ["2026-09"], pedidos: ["1000"] }];
    },
  };
  const ref = mesesReferencia();
  const o = await opcoesPCP(db, ref.proximo);
  assert.ok(o.meses.includes(ref.proximo) && o.meses.includes(ref.atual));
  assert.equal(o.mesProximo, ref.proximo);
  const sqlMes = chamadas.find((c) => /to_char\(g\.data_programacao/.test(c.sql));
  assert.ok(sqlMes, "consulta limitada ao mês");
  assert.deepEqual(sqlMes!.args, [ref.proximo]);
  // sem mês específico usa a consulta geral
  chamadas.length = 0;
  await opcoesPCP(db, "ATIVO");
  assert.ok(!chamadas.some((c) => /to_char\(g\.data_programacao,'YYYY-MM'\)=\$1/.test(c.sql)));
  // o mês do próximo ciclo é aceito pelo esquema de filtros
  assert.equal(lerFiltrosPCP(new URLSearchParams({ mes: ref.proximo })).mes, ref.proximo);
});
