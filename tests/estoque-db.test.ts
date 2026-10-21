import test from "node:test";
import assert from "node:assert/strict";
import { executarMovimento, type Q } from "../lib/estoque-db";

test("bloqueia movimento em local coberto por inventário mesmo sem item contado", async () => {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const db: Q = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return [{ numero: 42 }];
    },
  };

  const result = await executarMovimento(db, {
    tipo: "ENTRADA",
    produtoId: "produto-id",
    localDestino: "local-em-inventario",
    qBase: 3,
    qInformada: 3,
    unidade: "UN",
    fator: 1,
    usuario: "teste",
  });

  assert.deepEqual(result, {
    ok: false,
    http: 409,
    codigo: "EM_INVENTARIO",
    erro: "Produto/local em inventário aberto (nº 42). Conclua ou cancele o inventário antes de movimentar.",
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /from est_inventarios where status='EM_CONTAGEM'/);
  assert.match(queries[0].sql, /tipo='GERAL' or local_id=any/);
  assert.deepEqual(queries[0].params, [["local-em-inventario"]]);
});