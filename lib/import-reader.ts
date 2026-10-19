import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export type HeaderAliases = Record<string, string[]>;

export type RobustTable = {
  rows: Record<string, string>[];
  headerRow: number;
  sheetName: string;
  totalRawRows: number;
  warnings: string[];
};

export const cleanImportText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

export const normalizeImportHeader = (value: unknown) =>
  cleanImportText(value)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘´`]/g, "'")
    .replace(/\s*[-_/]+\s*/g, " ")
    .replace(/[^A-Z0-9%']+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/**
 * Converte número em formato brasileiro (padrão) ou internacional.
 * Regras: "0,125"/"0.125" = decimal; "1.234" = milhar (BR); "1,234" = decimal (BR);
 * "1.234,56" e "1,234.56" = o último separador é o decimal; "1,234,567" = milhares.
 */
export function parseImportNumber(value: unknown): number | null {
  let s = cleanImportText(value)
    .replace(/R\$|US\$|\$/gi, "")
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .replace(/(?:UNIDADES?|UNID|UN|PCS|PC|PÇS|PÇ|JG|CJ|KG|M[23²³]|MM|CM|M|G|L)$/i, "");

  if (!s || /^(?:-|—|N\/?A|ND|N\/D)$/i.test(s)) return null;

  const sign = s.startsWith("-") ? -1 : 1;
  s = s.replace(/^[+-]/, "");
  // Não transforme entradas corrompidas (ex.: "12-3" ou "1.2.3") em números válidos.
  if (!s || /[+-]/.test(s) || !/^\d[\d.,]*$/.test(s)) return null;

  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      const validBrazilian = /^\d{1,3}(?:\.\d{3})*,\d+$/.test(s) || /^\d+,\d+$/.test(s);
      if (!validBrazilian) return null;
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      const validInternational = /^\d{1,3}(?:,\d{3})*\.\d+$/.test(s) || /^\d+\.\d+$/.test(s);
      if (!validInternational) return null;
      s = s.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    if (commas > 1) {
      if (!/^\d{1,3}(?:,\d{3})+$/.test(s)) return null;
      s = s.replace(/,/g, "");
    } else {
      // Uma vírgula é decimal no padrão brasileiro: "1,234" = 1,234.
      s = s.replace(",", ".");
    }
  } else if (dot >= 0) {
    if (dots > 1) {
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(s)) return null;
      s = s.replace(/\./g, "");
    } else {
      const decimals = s.length - dot - 1;
      const milhar = /^[1-9]\d{0,2}\.\d{3}$/.test(s);
      if (decimals === 3 && milhar) s = s.replace(".", "");
    }
  }

  const number = sign * Number(s);
  return Number.isFinite(number) ? number : null;
}

export function findImportKey(
  row: Record<string, string>,
  aliases: string[]
): string | undefined {
  const wanted = aliases.map(normalizeImportHeader).filter(Boolean);
  const exact = Object.keys(row).find((key) => wanted.includes(normalizeImportHeader(key)));
  if (exact) return exact;

  let best: string | undefined;
  let bestScore = 0;

  for (const key of Object.keys(row)) {
    const nk = normalizeImportHeader(key);
    if (!nk) continue;

    for (const alias of wanted) {
      let score = 0;
      if (nk.startsWith(alias) || alias.startsWith(nk)) score = 0.92;
      else if (nk.includes(alias) || alias.includes(nk)) score = 0.86;
      else {
        const a = new Set(alias.split(" ").filter(Boolean));
        const b = new Set(nk.split(" ").filter(Boolean));
        const common = [...a].filter((token) => b.has(token)).length;
        const union = new Set([...a, ...b]).size;
        score = union ? common / union : 0;
      }

      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
  }

  return bestScore >= 0.72 ? best : undefined;
}

function detectDelimiter(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => x.trim()).slice(0, 12);
  const candidates = [";", "\t", ","];
  let best = ";";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = lines.map((line) => line.split(delimiter).length).filter((count) => count > 1);
    if (!counts.length) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + Math.abs(count - avg), 0);
    const score = avg * 4 - variance;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function uniqueHeaders(values: unknown[]) {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = cleanImportText(value) || `COL_${index + 1}`;
    const key = normalizeImportHeader(base) || `COL_${index + 1}`;
    const count = used.get(key) || 0;
    used.set(key, count + 1);
    return count ? `${base}__${count + 1}` : base;
  });
}

function buildAliasPool(aliases: HeaderAliases) {
  return Object.values(aliases).flat().map(normalizeImportHeader).filter(Boolean);
}

function headerScore(row: unknown[], aliasPool: string[]) {
  const seen = new Set<string>();
  let score = 0;

  for (const value of row) {
    const key = normalizeImportHeader(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (aliasPool.includes(key)) score += 5;
    else if (aliasPool.some((alias) => key.includes(alias) || alias.includes(key))) score += 2;

    if (/PEDIDO/.test(key)) score += 2;
    if (/DESCRICAO|PRODUTO/.test(key)) score += 2;
    if (/QUANT|QTD|QTDE/.test(key)) score += 2;
    if (/^OF$|ORDEM.*FABRIC/.test(key)) score += 2;
  }

  return score;
}

function bestHeader(matrix: unknown[][], aliasPool: string[]) {
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < Math.min(matrix.length, 120); i++) {
    const score = headerScore(matrix[i] || [], aliasPool);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 8 ? { index: bestIndex, score: bestScore } : null;
}

function matrixToRows(
  matrix: unknown[][],
  headerIndex: number,
  aliases: HeaderAliases,
  forwardFillFields: string[]
) {
  const headers = uniqueHeaders(matrix[headerIndex] || []);
  const aliasPool = buildAliasPool(aliases);
  const baseline = headerScore(matrix[headerIndex] || [], aliasPool);
  const last = new Map<string, string>();
  const rows: Record<string, string>[] = [];

  for (let line = headerIndex + 1; line < matrix.length; line++) {
    const source = matrix[line] || [];
    if (!source.some((value) => cleanImportText(value))) continue;

    if (headerScore(source, aliasPool) >= Math.max(8, baseline * 0.75)) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, col) => {
      row[header] = cleanImportText(source[col]);
    });

    for (const field of forwardFillFields) {
      const key = findImportKey(row, aliases[field] || [field]);
      if (!key) continue;
      if (row[key]) last.set(field, row[key]);
      else if (last.has(field)) row[key] = last.get(field) || "";
    }

    rows.push(row);
  }

  return rows;
}

/** Limites defensivos para impedir arquivos vazios, inválidos ou excessivos de travarem a importação. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 200_000;
export const MAX_IMPORT_SHEETS = 40;

export function validateImportFile(file: Pick<File, "name" | "size">): { isExcel: boolean; extension: string } {
  const name = cleanImportText(file?.name);
  const size = Number(file?.size);
  const extension = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "";

  if (!name) throw new Error("O arquivo selecionado não possui nome válido.");
  if (!Number.isFinite(size) || size <= 0) throw new Error("O arquivo está vazio. Selecione uma planilha com dados.");
  if (size > MAX_IMPORT_BYTES) throw new Error("O arquivo excede o limite de 50 MB. Divida a planilha em arquivos menores.");
  if (!["csv", "xlsx", "xls", "xlsm", "xlsb"].includes(extension)) {
    throw new Error("Formato não suportado. Envie um arquivo CSV ou Excel (.xlsx, .xls, .xlsm, .xlsb).");
  }

  return { isExcel: extension !== "csv", extension };
}

function readWorkbook(bytes: Uint8Array) {
  try {
    const workbook = XLSX.read(bytes, { type: "array", raw: false, cellDates: false });
    if (!workbook.SheetNames.length) throw new Error("O arquivo não possui planilhas.");
    if (workbook.SheetNames.length > MAX_IMPORT_SHEETS) {
      throw new Error(`O arquivo possui mais de ${MAX_IMPORT_SHEETS} planilhas; mantenha somente as abas necessárias.`);
    }
    return workbook;
  } catch (error) {
    if (error instanceof Error && /mais de|não possui planilhas/.test(error.message)) throw error;
    throw new Error("Não foi possível abrir o Excel. Verifique se o arquivo não está corrompido e tente salvá-lo novamente como .xlsx.");
  }
}

function assertRowLimit(rows: unknown[][]) {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`A planilha excede o limite de ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas. Divida os dados em arquivos menores.`);
  }
}

export async function loadRobustTable(
  file: File,
  aliases: HeaderAliases,
  options?: { forwardFillFields?: string[] }
): Promise<RobustTable> {
  const { isExcel } = validateImportFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const aliasPool = buildAliasPool(aliases);
  const warnings: string[] = [];

  if (isExcel) {
    const wb = readWorkbook(bytes);
    let chosen: { matrix: unknown[][]; headerIndex: number; score: number; sheetName: string } | null = null;

    for (const sheetName of wb.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      }) as unknown[][];
      assertRowLimit(matrix);

      const detected = bestHeader(matrix, aliasPool);
      if (!detected) continue;

      if (!chosen || detected.score > chosen.score) {
        chosen = { matrix, headerIndex: detected.index, score: detected.score, sheetName };
      }
    }

    if (!chosen) throw new Error("Não foi possível identificar o cabeçalho em nenhuma planilha do Excel.");

    return {
      rows: matrixToRows(chosen.matrix, chosen.headerIndex, aliases, options?.forwardFillFields || []),
      headerRow: chosen.headerIndex + 1,
      sheetName: chosen.sheetName,
      totalRawRows: chosen.matrix.length,
      warnings,
    };
  }

  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
    warnings.push("Arquivo decodificado como Windows-1252.");
  }

  const delimiter = detectDelimiter(text);
  let matrix: unknown[][];
  try {
    matrix = parse(text, {
      delimiter,
      columns: false,
      skip_empty_lines: false,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
      trim: false,
    }) as unknown[][];
  } catch {
    throw new Error("Não foi possível ler o CSV. Confira aspas, separadores e se o arquivo foi exportado corretamente.");
  }
  assertRowLimit(matrix);

  const detected = bestHeader(matrix, aliasPool);
  if (!detected) throw new Error("Não foi possível identificar o cabeçalho do arquivo.");

  return {
    rows: matrixToRows(matrix, detected.index, aliases, options?.forwardFillFields || []),
    headerRow: detected.index + 1,
    sheetName: "CSV",
    totalRawRows: matrix.length,
    warnings,
  };
}


export async function loadRobustTables(
  file: File,
  aliases: HeaderAliases,
  options?: { forwardFillFields?: string[] }
): Promise<RobustTable[]> {
  const { isExcel } = validateImportFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const aliasPool = buildAliasPool(aliases);

  if (!isExcel) {
    return [await loadRobustTable(file, aliases, options)];
  }

  const wb = readWorkbook(bytes);
  const result: RobustTable[] = [];
  let totalRows = 0;

  for (const sheetName of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as unknown[][];
    assertRowLimit(matrix);
    totalRows += matrix.length;
    if (totalRows > MAX_IMPORT_ROWS) {
      throw new Error(`O arquivo excede o limite total de ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas somando todas as abas.`);
    }

    const detected = bestHeader(matrix, aliasPool);
    if (!detected) continue;

    result.push({
      rows: matrixToRows(matrix, detected.index, aliases, options?.forwardFillFields || []),
      headerRow: detected.index + 1,
      sheetName,
      totalRawRows: matrix.length,
      warnings: [],
    });
  }

  if (!result.length) {
    throw new Error("Não foi possível identificar cabeçalho em nenhuma planilha do arquivo.");
  }

  return result;
}
