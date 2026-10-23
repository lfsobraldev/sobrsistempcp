import test from "node:test";
import assert from "node:assert/strict";
import { distribuirSetores } from "../lib/fluxo-setores";

const FLUXO = ["PREPARACAO", "CNC", "EMBALAGEM", "EXPEDICAO"] as const;
const L = (pedido: string, etapa: string, i: string | null, c: string | null) => ({ pedido, etapa, data_inicio: i, data_conclusao: c, dias: 2, cliente: "X" });

test("concluir uma etapa joga o pedido na fila da próxima etapa da rota", () => {
  const r = distribuirSetores([L("1", "PREPARACAO", "2026-10-20", "2026-10-21"), L("1", "CNC", null, null), L("1", "EMBALAGEM", null, null)], FLUXO);
  assert.equal(r.CNC.fila.length, 1); assert.equal(r.CNC.fila[0].desde, "2026-10-21");
  assert.equal(r.EMBALAGEM.fila.length, 0); // só a próxima etapa
  assert.equal(r.PREPARACAO.concluidas, 1);
});
test("iniciou a próxima etapa: sai da fila e entra em andamento", () => {
  const r = distribuirSetores([L("1", "PREPARACAO", "2026-10-20", "2026-10-21"), L("1", "CNC", "2026-10-22", null)], FLUXO);
  assert.equal(r.CNC.fila.length, 0); assert.equal(r.CNC.andamento.length, 1);
});
test("pula etapas que não fazem parte da rota do pedido", () => {
  const r = distribuirSetores([L("2", "PREPARACAO", "2026-10-20", "2026-10-21"), L("2", "EMBALAGEM", null, null)], FLUXO);
  assert.equal(r.EMBALAGEM.fila.length, 1); assert.equal(r.CNC.fila.length, 0);
});
test("embalagem concluída leva o pedido para a fila da expedição; sem conclusão anterior não há fila", () => {
  const a = distribuirSetores([L("3", "EMBALAGEM", "2026-10-20", "2026-10-22"), L("3", "EXPEDICAO", null, null)], FLUXO);
  assert.equal(a.EXPEDICAO.fila.length, 1);
  const b = distribuirSetores([L("4", "PREPARACAO", null, null), L("4", "CNC", null, null)], FLUXO);
  assert.equal(b.PREPARACAO.fila.length + b.CNC.fila.length, 0);
});
