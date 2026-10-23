import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createRomaneioWorkbook } from "../lib/romaneio/excel";

const R = (quantity: number, lengthMm: number, widthMm: number, thicknessMm: number, product: string, extra: Record<string, unknown> = {}) => ({ quantity, lengthMm, widthMm, thicknessMm, product, ...extra });

test("Romaneio sai igual ao modelo oficial: larguras, FIM, fórmulas, totais e impressão em 1 página de largura", async () => {
  const data: any = {
    orderNumber: "27014", client: "Cliente Teste", destination: "Joinville - SC", hasMachining: false, mountType: "MONTADO_HS", warnings: [], orderOptions: {},
    packages: [
      { number: 1, rows: [R(2, 2100, 900, 35, "Folha de Porta A (C/Plast.)", { sourceItems: ["4.1"], games: 1 }), R(9, 2100, 800, 35, "Folha de Porta B (C/Plast.)")] },
      { number: 2, rows: [R(6, 2100, 600, 35, "Folha de Porta C (C/Plast.)", { sourceItems: ["1.1"] })] },
    ],
  };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await createRomaneioWorkbook(data)) as any);
  const ws = wb.getWorksheet("Romaneio")!;
  // larguras do modelo oficial
  assert.ok(Math.abs((ws.getColumn(10).width ?? 0) - 129.29) < 0.05);
  assert.ok(Math.abs((ws.getColumn(11).width ?? 0) - 16.29) < 0.05);
  // linhas de dados, marcador FIM e total
  assert.equal(ws.getCell("A13").value, 1);
  assert.equal(ws.getCell("D13").value, 2);
  assert.equal(ws.getCell("A16").value, "FIM");
  assert.equal(ws.getRow(17).hidden, true);
  const h13: any = ws.getCell("H13").value; assert.match(String(h13.formula), /G13\*F13\*E13\*D13\/1000000000/);
  assert.equal(ws.getCell("G109").value, "Total m³");
  const k109: any = ws.getCell("K109").value; assert.match(String(k109.formula), /\*420/);
  // impressão: A4 retrato, ajustada à largura
  assert.equal(ws.pageSetup.fitToPage, true); assert.equal(ws.pageSetup.fitToWidth, 1); assert.equal(ws.pageSetup.paperSize, 9);
  // cabeçalho do modelo
  assert.match(String(ws.getCell("A1").value), /RUA "A" S\/N QUADRA 04/);
  assert.equal(ws.getCell("A12").value, "N º pacote");
  assert.equal(ws.getCell("B10").value, "27014");
});
