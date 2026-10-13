import test from "node:test";
import assert from "node:assert/strict";
import { parseImportNumber } from "../lib/import-reader";
import { parseOrderItems, parseLocaleNumber } from "../lib/romaneio/order-parser";
import { auditOrderParse } from "../lib/romaneio/order-audit";

test("números decimais brasileiros e internacionais", () => {
  const casos: Array<[string, number]> = [
    ["0,125", 0.125], ["0.125", 0.125], ["1.234", 1234], ["1,234", 1.234], ["1.234,56", 1234.56],
    ["1,234.56", 1234.56], ["12,5", 12.5], ["2.110", 2110], ["1,234,567", 1234567], ["0,5 m3", 0.5], ["10 un", 10], ["-3,2", -3.2],
  ];
  for (const [entrada, esperado] of casos) assert.equal(parseImportNumber(entrada), esperado, entrada);
  assert.equal(parseImportNumber("N/A"), null);
  assert.equal(parseImportNumber(""), null);
});

test("quantidade com milhar em PDF não vira 1", () => {
  assert.equal(parseLocaleNumber("1.250"), 1250);
  assert.equal(parseLocaleNumber("1.250,5"), 1250.5);
  assert.equal(parseLocaleNumber("0,125"), 0.125);
});

const PEDIDO = [
  "1 12345 PORTA SOLIDA 2110X810X35 UN 1.250 0,5 625,0 12,345",
  "2 23456 BATENTE 2110X180X30 UN 40 0,3 12 0,125",
  "4 34567 ALIZAR 2200X70X10 PCS 8 0,1 0,8 0,050",
].join("\n");

test("parser lê quantidades e volumes do layout fixo", () => {
  const itens = parseOrderItems(PEDIDO);
  assert.equal(itens.length, 3);
  assert.equal(itens[0].quantity, 1250);
  assert.equal(itens[1].volume, 0.125);
});

test("auditoria detecta item faltante na sequência", () => {
  const itens = parseOrderItems(PEDIDO);
  const a = auditOrderParse(PEDIDO, itens);
  assert.deepEqual(a.missingItems, ["3"]);
  assert.ok(a.confidence < 100);
  assert.ok(a.issues[0].includes("3"));
});

test("auditoria com sequência completa tem confiança máxima", () => {
  const completo = PEDIDO + "\n3 45678 MARCO 2110X180X30 UN 2 0,2 0,4 0,010";
  const a = auditOrderParse(completo, parseOrderItems(completo));
  assert.deepEqual(a.missingItems, []);
  assert.equal(a.confidence, 100);
});
