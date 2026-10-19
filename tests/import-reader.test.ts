import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, MAX_IMPORT_SHEETS, validateImportFile } from "../lib/import-reader";

test("valida extensões de arquivo aceitas para importação", () => {
  assert.deepEqual(validateImportFile({ name: "Filtro.xlsx", size: 1024 } as File), { isExcel: true, extension: "xlsx" });
  assert.deepEqual(validateImportFile({ name: "consistem.CSV", size: 1024 } as File), { isExcel: false, extension: "csv" });
  assert.deepEqual(validateImportFile({ name: "antigo.xlsm", size: 1024 } as File), { isExcel: true, extension: "xlsm" });
});

test("recusa arquivos vazios, formatos desconhecidos e tamanhos excessivos", () => {
  assert.throws(() => validateImportFile({ name: "vazio.xlsx", size: 0 } as File), /arquivo está vazio/i);
  assert.throws(() => validateImportFile({ name: "planilha.pdf", size: 1024 } as File), /formato não suportado/i);
  assert.throws(() => validateImportFile({ name: "grande.xlsx", size: MAX_IMPORT_BYTES + 1 } as File), /50 MB/i);
  assert.throws(() => validateImportFile({ name: "", size: 1024 } as File), /nome válido/i);
});

test("limites do parser são explícitos para evitar importações descontroladas", () => {
  assert.equal(MAX_IMPORT_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_IMPORT_ROWS, 200_000);
  assert.equal(MAX_IMPORT_SHEETS, 40);
});
