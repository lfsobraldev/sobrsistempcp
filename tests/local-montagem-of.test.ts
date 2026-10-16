import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { montarPlanilha } from "../lib/planilha";
import type { Produto } from "../types/pcp";

const p = (pedido: string, of: string, local?: string) => ({
  id: of, filtro: "53", pedido, item: "1", produto: "", descricao: "PORTA 2100X800", tipo: "", canal: "", rebaixo: "", acabamento: "", cor: "",
  quantidade: 1, pedidoCliente: "", statusEngenharia: "", of, percentualProduto: 0, codigoModelo: "", descricaoModelo: "", outrasCaracteristicas: "",
  categoria: "PORTAS", material: "", medida: "2100x800x35", prioridade: "NORMAL", localMontagem: local,
  operacoes: [{ id: of, produtoId: of, processo: "USINAGEM-PORTAS", sequencia: 10, ordemFila: 1, status: "PENDENTE", quantidadePlanejada: 1, quantidadeProduzida: 0 }],
}) as unknown as Produto;

test("Excel gerente: pedidos em ordem numérica crescente, OF's e Local de Montagem (vazio se não preenchido)", () => {
  const wb = montarPlanilha(ExcelJS, [p("25562", "903", "HS"), p("25560", "901"), p("25561", "902", "Timadel"), p("25560", "900")]);
  const ws = wb.getWorksheet("PROGRAMAÇÃO GERENTE")!;
  const pedidos = [3, 4, 5].map((r) => String(ws.getRow(r).getCell(1).value));
  assert.deepEqual(pedidos, ["25560", "25561", "25562"]);
  assert.equal(ws.getRow(1).getCell(19).value, "OF's");
  assert.equal(ws.getRow(1).getCell(20).value, "Local de Montagem");
  assert.equal(ws.getRow(3).getCell(19).value, "900, 901");
  assert.equal(ws.getRow(3).getCell(20).value, "");
  assert.equal(ws.getRow(4).getCell(20).value, "Timadel");
  assert.equal(ws.getRow(5).getCell(20).value, "HS");
});

test("Excel dos setores inclui Local de Montagem na última coluna", () => {
  const wb = montarPlanilha(ExcelJS, [p("25560", "900", "Estância")]);
  const aba = wb.worksheets.find((w) => !["PRIORIDADES", "CONTROLE PRODUÇÃO", "PROGRAMAÇÃO GERENTE", "LEIA-ME"].includes(w.name))!;
  let achou = false;
  aba.eachRow((row) => row.eachCell((c) => { if (c.value === "Local de Montagem") achou = true; if (c.value === "Estância") achou = achou && true; }));
  assert.ok(achou);
  let valor = false;
  aba.eachRow((row) => row.eachCell((c) => { if (c.value === "Estância") valor = true; }));
  assert.ok(valor);
});
