import type { PackageRow, ProcessingResult } from "./types";
import { rowRole } from "./domain";
import { rowVolume } from "./logistics";

export type ValidationIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  pallet?: number;
  row?: number;
};

const roleRank = (row: PackageRow) => {
  switch (rowRole(row)) {
    case "PORTA": return 10;
    case "MARCO_DOBRADICA_DIREITA": return 20;
    case "MARCO_CONTRATESTA_DIREITA": return 21;
    case "MARCO_DOBRADICA_ESQUERDA": return 22;
    case "MARCO_CONTRATESTA_ESQUERDA": return 23;
    case "MARCO_PERNA_SEM_MAO": return 24;
    case "MARCO_TRAVESSA": return 30;
    case "ALIZAR_MAIOR_PERNA":
    case "ALIZAR_MAIOR_TRAVESSA":
    case "ALIZAR_MENOR_PERNA":
    case "ALIZAR_MENOR_TRAVESSA": return 40;
    case "KIT": return 50;
    case "OUTRO": return 60;
    case "FERRAGEM": return 90;
    default: return 70;
  }
};

const isHardware = (row: PackageRow) => roleRank(row) === 90;

function uniqueGames(rows: PackageRow[]) {
  const seen = new Set<string>();
  let total = 0;
  rows.forEach((row, index) => {
    const key = row.groupId || `ROW-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    total += Math.max(0, row.games || 0);
  });
  return total;
}

export function validateProcessing(data: ProcessingResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!data.client?.trim()) issues.push({ severity: "ERROR", code: "CLIENT_EMPTY", message: "Cliente não informado." });
  if (!data.destination?.trim()) issues.push({ severity: "WARNING", code: "DESTINATION_EMPTY", message: "Destino não informado. Confira antes de gerar etiquetas." });
  if (data.config?.requireFilter && !data.orderOptions?.filtro?.trim()) issues.push({ severity: "ERROR", code: "FILTER_REQUIRED", message: "Número do filtro é obrigatório nesta configuração." });
  if (data.sourceMode === "CONTAINER") {
    for (const pkg of data.packages) {
      const games = pkg.games || pkg.rows.find((row) => row.games)?.games || 0;
      if (!pkg.limitQuantity && data.config?.container.requireConfiguredLimit) issues.push({ severity: "ERROR", code: "CONTAINER_LIMIT", message: `Pallet ${pkg.number}: defina o limite de jogos do container.`, pallet: pkg.number });
      if (pkg.limitQuantity && games > pkg.limitQuantity) issues.push({ severity: "ERROR", code: "CONTAINER_GAMES", message: `Pallet ${pkg.number} possui ${games} jogos e excede o limite de ${pkg.limitQuantity}.`, pallet: pkg.number });
    }
  }
  const packageNumbers = new Set<number>();
  let hardwareStarted = false;
  let lastGlobalRank = 0;

  for (const pkg of data.packages) {
    if (packageNumbers.has(pkg.number)) {
      issues.push({ severity: "ERROR", code: "DUP_PACKAGE", message: `Número de pallet ${pkg.number} duplicado.`, pallet: pkg.number });
    }
    packageNumbers.add(pkg.number);
    const expectedNumber = packageNumbers.size;
    if (pkg.number !== expectedNumber) {
      issues.push({ severity: "WARNING", code: "PACKAGE_NUMBER_SEQUENCE", message: `Pallet ${pkg.number}: a numeração esperada nesta posição é ${expectedNumber}.`, pallet: pkg.number });
    }

    if (!pkg.rows.length) {
      issues.push({ severity: "WARNING", code: "EMPTY_PALLET", message: `Pallet ${pkg.number} está vazio.`, pallet: pkg.number });
      continue;
    }

    const volume = pkg.rows.reduce((sum, row) => sum + rowVolume(row), 0);
    if (pkg.limitM3 && volume > pkg.limitM3 + 0.0005) {
      issues.push({ severity: "ERROR", code: "M3_LIMIT", message: `Pallet ${pkg.number} possui ${volume.toFixed(3)} m³ e excede o limite de ${pkg.limitM3.toFixed(3)} m³.`, pallet: pkg.number });
    }

    const doorQuantity = pkg.rows.filter((row) => row.category === "PORTA").reduce((sum, row) => sum + Math.max(0, row.quantity || 0), 0);
    if (pkg.limitQuantity && doorQuantity && doorQuantity > pkg.limitQuantity) {
      issues.push({ severity: "ERROR", code: "QTY_LIMIT", message: `Pallet ${pkg.number} possui ${doorQuantity} portas e excede o limite de ${pkg.limitQuantity}.`, pallet: pkg.number });
    }

    const games = uniqueGames(pkg.rows);
    if (pkg.limitQuantity && !doorQuantity && games > pkg.limitQuantity) {
      issues.push({ severity: "ERROR", code: "GAMES_LIMIT", message: `Pallet ${pkg.number} possui ${games} jogos e excede o limite de ${pkg.limitQuantity}.`, pallet: pkg.number });
    }

    const hasHardware = pkg.rows.some(isHardware);
    const hasOther = pkg.rows.some((row) => !isHardware(row));
    if (hasHardware && hasOther) {
      issues.push({ severity: "ERROR", code: "HARDWARE_MIX", message: `Pallet ${pkg.number} mistura ferragens com outros produtos.`, pallet: pkg.number });
    }
    if (hardwareStarted && !hasHardware) {
      issues.push({ severity: "ERROR", code: "HARDWARE_NOT_LAST", message: `Pallet ${pkg.number} aparece depois do início das ferragens. Ferragens devem ser o último grupo.`, pallet: pkg.number });
    }
    if (hasHardware) hardwareStarted = true;

    let previousRowRank = 0;
    for (let rowIndex = 0; rowIndex < pkg.rows.length; rowIndex++) {
      const row = pkg.rows[rowIndex];
      const rank = roleRank(row);
      if (!row.product?.trim() && !(row.mergeProduct || row.productGroupId)) {
        issues.push({ severity: "WARNING", code: "NO_PRODUCT", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: produto vazio sem indicação de continuação.`, pallet: pkg.number, row: rowIndex });
      }
      if (!Number.isFinite(row.quantity) || row.quantity < 0) {
        issues.push({ severity: "ERROR", code: "BAD_QTY", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: quantidade inválida.`, pallet: pkg.number, row: rowIndex });
      } else if (row.quantity === 0) {
        issues.push({ severity: "WARNING", code: "ZERO_QTY", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: quantidade zerada. Confira se a linha deve permanecer no documento.`, pallet: pkg.number, row: rowIndex });
      }
      if ((row.lengthMm || row.widthMm || row.thicknessMm) && !(row.lengthMm && row.widthMm && row.thicknessMm)) {
        issues.push({ severity: "WARNING", code: "PARTIAL_DIMS", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: dimensões incompletas.`, pallet: pkg.number, row: rowIndex });
      }
      const volumeRow = rowVolume(row);
      if (volumeRow < 0 || !Number.isFinite(volumeRow)) {
        issues.push({ severity: "ERROR", code: "BAD_VOLUME", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: cubagem inválida.`, pallet: pkg.number, row: rowIndex });
      }
      if (rank < previousRowRank && rank < 90) {
        issues.push({ severity: "WARNING", code: "ROW_SEQUENCE", message: `Pallet ${pkg.number}, linha ${rowIndex + 1}: sequência industrial deve ser conferida.`, pallet: pkg.number, row: rowIndex });
      }
      previousRowRank = Math.max(previousRowRank, rank);
    }

    const minRank = Math.min(...pkg.rows.map(roleRank));
    const maxRank = Math.max(...pkg.rows.filter((row) => !isHardware(row)).map(roleRank), minRank);
    if (minRank < lastGlobalRank && minRank < 90) {
      issues.push({ severity: "WARNING", code: "PACKAGE_SEQUENCE", message: `Pallet ${pkg.number} está fora da sequência industrial esperada.`, pallet: pkg.number });
    }
    lastGlobalRank = Math.max(lastGlobalRank, maxRank);
  }

  const diagnostics = data.parserDiagnostics;
  if (diagnostics) {
    const categories = ["PORTA", "MARCO", "ALIZAR", "FERRAGEM", "KIT"] as const;
    for (const category of categories) {
      const source = diagnostics.sourceCategories[category] || 0;
      const mapped = diagnostics.mappedCategories[category] || 0;
      if (source > 0 && mapped === 0) {
        issues.push({ severity: "ERROR", code: "SOURCE_CATEGORY_MISSING", message: `${category}: o pedido possui ${source} item(ns), mas nenhum foi representado no romaneio.` });
      }
    }
    if (diagnostics.suspicious) {
      issues.push({ severity: "ERROR", code: "PARSE_SUSPECT", message: diagnostics.notes[0] || "A leitura do pedido parece incompleta e precisa ser conferida antes da emissão." });
    }
  }

  for (const item of data.unmappedItems || []) {
    issues.push({ severity: "WARNING", code: "UNMAPPED", message: `Item ${item.item} (${item.code}) não mapeado: ${item.description}` });
  }

  if (data.reconciliation && data.reconciliation.unmapped !== (data.unmappedItems?.length || 0)) {
    issues.push({ severity: "WARNING", code: "RECONCILIATION", message: "A reconciliação de itens precisa ser atualizada. Confira os itens não mapeados." });
  }
  if (!data.packages.length) {
    issues.push({ severity: "ERROR", code: "NO_PACKAGES", message: "Nenhum pallet foi gerado para este processamento." });
  }
  const totalRows = data.packages.reduce((sum, pkg) => sum + pkg.rows.length, 0);
  if (!totalRows) {
    issues.push({ severity: "ERROR", code: "NO_ROWS", message: "Nenhum produto foi gerado para o romaneio." });
  }
  if (data.reconciliation && data.reconciliation.found > 0 && data.reconciliation.mapped === 0) {
    issues.push({ severity: "ERROR", code: "NOTHING_MAPPED", message: "O pedido possui itens físicos, mas nenhum item foi associado ao romaneio." });
  }
  return issues;
}

export function canGenerate(data: ProcessingResult) {
  return !validateProcessing(data).some((issue) => issue.severity === "ERROR");
}
