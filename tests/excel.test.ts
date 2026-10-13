import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { montarWorkbook } from "../lib/export";

test("planilha exportada tem cabeçalho, filtro, congelamento, totais e formatos", async () => {
  const wb = await montarWorkbook([{ nome: "Pedidos/Teste*", linhas: [
    { Pedido: "100", Status: "BLOQUEADA", Planejado: 10, Produzido: 4.5 },
    { Pedido: "101", Status: "CONCLUIDA", Planejado: 20, Produzido: 20 },
  ] }]);
  const buf = await wb.xlsx.writeBuffer();
  const re = new ExcelJS.Workbook();
  await re.xlsx.load(buf as ArrayBuffer);
  const ws = re.worksheets[0];
  assert.equal(ws.name, "Pedidos-Teste-");
  assert.equal(ws.getRow(1).getCell(1).value, "Pedido");
  assert.equal(ws.views[0].state, "frozen");
  assert.ok(ws.autoFilter);
  assert.equal(ws.getCell("B2").fill && (ws.getCell("B2").fill as any).fgColor.argb, "FFFEE2E2");
  assert.equal(ws.getCell("A4").value, "TOTAL");
  assert.deepEqual((ws.getCell("C4").value as any).formula, "SUBTOTAL(109,C2:C3)");
  assert.equal(ws.getColumn(4).numFmt, "#,##0.00");
});

test("sem dados gera aviso em vez de aba vazia", async () => {
  const wb = await montarWorkbook([{ nome: "Vazio", linhas: [] }]);
  assert.equal(wb.worksheets[0].getRow(2).getCell(1).value, "Sem dados");
});
