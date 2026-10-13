import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { montarPlanilha } from "../lib/planilha";
import type { Produto } from "../types/pcp";

function p(pedido: string, of: string, categoria: string, descricao: string, medida: string, quantidade: number): Produto {
  return {
    id: of, filtro: "53", pedido, item: "1", produto: "",
    descricao, tipo: "", canal: "", rebaixo: "", acabamento: "PET",
    cor: "", quantidade, pedidoCliente: "", statusEngenharia: "",
    of, percentualProduto: 0, codigoModelo: "", descricaoModelo: "",
    outrasCaracteristicas: "", categoria, material: "", medida,
    prioridade: "NORMAL", operacoes: [],
  };
}

test("Excel gerencial contém medidas completas de alizares e batentes, sem misturar pedidos", () => {
  const produtos = [
    p("100", "111", "ALIZARES", "T A 1200X70X09 PET (UL", "1200x70x9", 2),
    p("100", "112", "BATENTE - PERNA", "M STD 2110X130X30", "2110x130x30", 4),
    p("200", "113", "ALIZARES", "T A 2200X50X09 PET (STD)", "2200x50x9", 2),
  ];
  const wb = montarPlanilha(ExcelJS, produtos);
  const ws = wb.getWorksheet("PROGRAMAÇÃO GERENTE");
  assert.ok(ws);
  const heads = ws!.getRow(1).values as unknown[];
  assert.equal(heads[14], "Alizar");
  assert.equal(heads[15], "Batentes");
  assert.equal(heads[16], "Material");
  const rows = [ws!.getRow(3), ws!.getRow(4)];
  const pedido100 = rows.find((r) => String(r.getCell(1).value) === "100");
  const pedido200 = rows.find((r) => String(r.getCell(1).value) === "200");
  assert.ok(pedido100);
  assert.ok(pedido200);
  assert.match(String(pedido100!.getCell(14).value), /1200x70x9/);
  assert.match(String(pedido100!.getCell(15).value), /2110x130x30/);
  assert.equal(pedido100!.getCell(16).value, "ULTRA/STD");
  assert.equal(pedido200!.getCell(16).value, "STD");
  assert.equal(pedido200!.getCell(15).value, "");
});
