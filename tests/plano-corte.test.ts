import { test } from "node:test";
import assert from "node:assert/strict";
import { planoDeCorte } from "../lib/plano-corte";

test("plano de corte: cabe, não sobrepõe, respeita limites e reporta retalho", () => {
  const r = planoDeCorte([{ id: "A", largura: 800, altura: 600, qtd: 6 }, { id: "B", largura: 400, altura: 400, qtd: 4 }, { id: "X", largura: 5000, altura: 5000, qtd: 1 }], { largura: 2750, altura: 1850, kerf: 4 });
  assert.deepEqual(r.naoCabem, ["X"]);
  assert.equal(r.totalPecas, 10);
  for (const c of r.chapas) {
    for (const p of c.posicoes) { assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 2750 && p.y + p.h <= 1850); }
    for (let i = 0; i < c.posicoes.length; i++) for (let j = i + 1; j < c.posicoes.length; j++) {
      const a = c.posicoes[i], b = c.posicoes[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, "sobreposição");
    }
  }
  assert.equal(r.chapas.length, 1);
  assert.ok(r.aproveitamento > 30);
  assert.ok(r.chapas[0].retalho);
});
test("plano de corte: usa várias chapas quando necessário", () => {
  const r = planoDeCorte([{ id: "P", largura: 1000, altura: 1000, qtd: 8 }], { largura: 2000, altura: 2000 });
  assert.equal(r.chapas.length, 2);
});
