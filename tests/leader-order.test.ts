import test from "node:test";
import assert from "node:assert/strict";
import { leaderPlanRows, leaderReleasedRows } from "../lib/metrics";
import type { Produto } from "../types/pcp";

function produto(
  codigo: string,
  material: string,
  medida: string,
  quantidade: number,
  descricao = "Peça"
): Produto {
  return {
    id: codigo,
    filtro: "F1",
    pedido: "100",
    item: codigo,
    produto: codigo,
    descricao,
    tipo: "",
    canal: "",
    rebaixo: "",
    acabamento: "",
    cor: "",
    quantidade,
    pedidoCliente: "",
    statusEngenharia: "",
    of: `OF-${codigo}`,
    percentualProduto: 100,
    codigoModelo: "",
    descricaoModelo: "",
    outrasCaracteristicas: "",
    categoria: "OUTROS",
    material,
    medida,
    prioridade: "NORMAL",
    operacoes: [{
      id: `OP-${codigo}`,
      produtoId: codigo,
      processo: "RECOBRIDORA",
      sequencia: 1,
      percentual: 100,
      status: "LIBERADA",
      ordemFila: 1,
      quantidadePlanejada: quantidade,
      quantidadeProduzida: 0,
      quantidadeRefugo: 0,
    }],
  };
}

test("ordena linhas dos líderes por material e dimensões sem alterar quantidades", () => {
  const produtos = [
    produto("PINUS-230", "PINUS", "2500x230x30", 6),
    produto("STD-180", "MDF STD", "2200x180x30", 5),
    produto("ULTRA-230", "MDF ULTRA", "2000x230x30", 4),
    produto("STD-230-T", "MDF STD", "900x230x30", 3, "Travessa"),
    produto("STD-230-P", "MDF STD", "2200x230x30", 2, "Perna"),
    produto("STD-230-E25", "MDF STD", "2100x230x25", 1),
  ];

  const planned = leaderPlanRows(produtos, "RECOBRIDORA");
  const released = leaderReleasedRows(produtos, "RECOBRIDORA");
  const ordemEsperada = ["STD-230-P", "STD-230-T", "STD-230-E25", "STD-180", "ULTRA-230", "PINUS-230"];

  assert.deepEqual(planned.map((row) => row.produto), ordemEsperada);
  assert.deepEqual(released.map((row) => row.produto), ordemEsperada);
  assert.equal(planned.reduce((total, row) => total + row.quantidade, 0), 21);
  assert.equal(planned.length, produtos.length);
});