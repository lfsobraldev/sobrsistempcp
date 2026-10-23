import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { alturaLinha, createEtiquetaModeloWorkbook, fonteCliente } from "../lib/romaneio/etiqueta-modelo";

const R = (quantity: number, lengthMm: number, widthMm: number, thicknessMm: number, product: string, extra: Record<string, unknown> = {}) => ({ quantity, lengthMm, widthMm, thicknessMm, product, ...extra });

test("Etiqueta no modelo oficial: uma aba por pacote, dados, totais, mesclagens e impressão", async () => {
  const data: any = { orderNumber: "27014", client: "Inovar Habitacional Incorp. Imobiliária", destination: "Joinville - SC", packages: [
    { number: 1, rows: [R(2, 2100, 900, 35, "Folha A"), R(9, 2100, 800, 35, "Folha B"), R(13, 2100, 800, 35, "Folha C")] },
    { number: 2, rows: [R(144, 2200, 50, 9, "Conj. L Maior", { games: 72, groupId: "g", productGroupId: "p", mergeProduct: true }), R(72, 1000, 50, 9, "", { games: 72, groupId: "g", productGroupId: "p", mergeProduct: true })] },
  ] };
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await createEtiquetaModeloWorkbook(data)) as any);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Pacote 01", "Pacote 02"]);
  const a = wb.worksheets[0];
  assert.equal(a.getCell("B7").value, 27014); assert.equal(a.getCell("H7").value, "Joinville - SC");
  assert.equal(a.getCell("B9").value, 1); assert.equal(a.getCell("F9").value, 2);
  assert.equal(a.getCell("A11").value, 1); assert.equal(a.getCell("C11").value, 2); assert.equal(a.getCell("F13").value, 35);
  assert.equal(a.getCell("F14").value, "Total m³");
  const tot: any = a.getCell("C14").value; assert.match(String(tot.formula), /SUM\(C11:C13\)/); assert.equal(tot.result, 24);
  const m3: any = a.getCell("G11").value; assert.match(String(m3.formula), /F11\*E11\*D11\*C11\/1000000000/);
  assert.equal(a.getRow(11).height, 56.1);
  assert.equal(a.pageSetup.orientation, "landscape"); assert.equal(a.pageSetup.fitToPage, true);
  assert.ok(a.getImages().length >= 1);
  const b = wb.worksheets[1];
  assert.equal(b.getCell("B11").value, 72); // jogos mesclados por grupo
  assert.ok(Object.keys((b as any)._merges).includes("B11"));
  const bt: any = b.getCell("B13").value; assert.equal(bt.result, 72);
  assert.equal(alturaLinha(1), 68.25); assert.equal(alturaLinha(4), 42.95); assert.equal(fonteCliente(41), 42);
});
