import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarPedidoComercial,
  podeTransicionarOportunidade,
  podeTransicionarProposta,
  totalProposta,
  validarItensProposta,
} from "../lib/comercial-crm";

test("normaliza número de pedido e rejeita identificadores inválidos", () => {
  assert.equal(normalizarPedidoComercial("00001234"), "1234");
  assert.equal(normalizarPedidoComercial("1234"), "1234");
  assert.equal(normalizarPedidoComercial("123"), null);
  assert.equal(normalizarPedidoComercial("12A45"), null);
});

test("só permite avanço comercial coerente e conversão após oportunidade ganha", () => {
  assert.equal(podeTransicionarOportunidade("NOVA", "QUALIFICADA"), true);
  assert.equal(podeTransicionarOportunidade("NOVA", "CONVERTIDA"), false);
  assert.equal(podeTransicionarOportunidade("GANHA", "CONVERTIDA"), true);
  assert.equal(podeTransicionarOportunidade("CONVERTIDA", "NOVA"), false);
  assert.equal(podeTransicionarProposta("ENVIADA", "ACEITA"), true);
  assert.equal(podeTransicionarProposta("RASCUNHO", "ACEITA"), false);
});

test("valida itens e calcula total comercial sem aceitar valores inválidos", () => {
  const itens = validarItensProposta([
    { descricao: "Porta", quantidade: 2, valorUnitario: 125.5 },
    { descricao: "Batente", quantidade: 1, valorUnitario: 80 },
  ]);
  assert.equal(totalProposta(itens), 331);
  assert.throws(() => validarItensProposta([]), /1 a 100 itens/);
  assert.throws(() => validarItensProposta([{ descricao: "", quantidade: 1, valorUnitario: 10 }]), /inválido/);
  assert.throws(() => validarItensProposta([{ descricao: "Porta", quantidade: 1, valorUnitario: -1 }]), /inválido/);
});