import type { ContainerRule, LogisticsConfig, PackageData, PackageRow, ProcessingResult, ProductCategory } from "./types";
import { classifyProduct, norm, rowRole } from "./domain";
import { packageVolume, rowVolume } from "./logistics";
import { sanitizeConfig } from "./settings";

function cloneRow(row: PackageRow): PackageRow {
  return {
    ...row,
    sourceItems: row.sourceItems ? [...row.sourceItems] : undefined,
    sourceCodes: row.sourceCodes ? [...row.sourceCodes] : undefined,
    rowStyle: row.rowStyle ? { ...row.rowStyle } : undefined,
  };
}

function categoryOf(row: PackageRow): ProductCategory {
  return row.category || classifyProduct(row.product);
}

function isHardware(row: PackageRow) {
  return categoryOf(row) === "FERRAGEM";
}

function roleRank(row: PackageRow) {
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
}

function industrialSort(a: PackageRow, b: PackageRow) {
  return roleRank(a) - roleRank(b)
    || Number(b.widthMm || 0) - Number(a.widthMm || 0)
    || Number(b.lengthMm || 0) - Number(a.lengthMm || 0)
    || norm(a.product).localeCompare(norm(b.product));
}

type LogicalGroup = {
  id: string;
  rows: PackageRow[];
  games: number;
  category: ProductCategory;
  label: string;
};

function estimateGames(rows: PackageRow[]): number {
  const explicit = rows.map((row) => Number(row.games || 0)).filter((value) => value > 0);
  if (explicit.length) return Math.max(...explicit);
  const category = categoryOf(rows[0] || { quantity: 0, product: "" });
  if (category === "PORTA") return rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.quantity || 0)), 0);
  if (category === "MARCO") {
    const legs = rows.filter((row) => rowRole(row) !== "MARCO_TRAVESSA");
    if (legs.length) return Math.max(...legs.map((row) => Math.max(0, Math.round(row.quantity || 0))));
    return Math.max(...rows.map((row) => Math.max(0, Math.round(row.quantity || 0))), 0);
  }
  if (category === "ALIZAR" || category === "KIT") {
    const quantities = rows.map((row) => Math.max(0, Math.round(row.quantity || 0))).filter(Boolean);
    return quantities.length ? Math.min(...quantities) : 0;
  }
  return Math.max(...rows.map((row) => Math.max(0, Math.round(row.quantity || 0))), 0);
}

function logicalGroups(rows: PackageRow[]): LogicalGroup[] {
  const grouped = new Map<string, PackageRow[]>();
  for (const row of [...rows].sort(industrialSort)) {
    const id = row.groupId || `${categoryOf(row)}-${row.sourceItems?.join("-") || row.id || grouped.size}`;
    const list = grouped.get(id) || [];
    list.push(row);
    grouped.set(id, list);
  }
  return [...grouped.entries()].map(([id, groupRows]) => ({
    id,
    rows: groupRows,
    games: estimateGames(groupRows),
    category: categoryOf(groupRows[0]),
    label: groupRows.map((row) => row.product).find(Boolean) || id,
  })).sort((a, b) => roleRank(a.rows[0]) - roleRank(b.rows[0]) || norm(a.label).localeCompare(norm(b.label)));
}

function ruleMatches(rule: ContainerRule, group: LogicalGroup) {
  if (!rule.enabled) return false;
  if (rule.category && rule.category !== group.category) return false;
  if (rule.match?.trim()) {
    const term = norm(rule.match);
    const haystack = norm(group.rows.map((row) => `${row.product} ${row.originalDescription || ""} ${row.finish || ""}`).join(" "));
    if (!haystack.includes(term)) return false;
  }
  return true;
}

function chooseRule(group: LogicalGroup, cfg: LogisticsConfig, fallbackLimit: number) {
  const candidates = cfg.container.rules
    .filter((rule) => ruleMatches(rule, group))
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  const rule = candidates[0];
  const configured = rule ? (rule.editable && fallbackLimit > 0 ? fallbackLimit : rule.maxGames) : (fallbackLimit || cfg.container.defaultMaxGames || 0);
  const maxGames = Math.max(0, Math.round(configured));
  return { rule, maxGames };
}

function splitGroup(group: LogicalGroup, takeGames: number): PackageRow[] {
  const sourceGames = Math.max(1, group.games || takeGames || 1);
  const ratio = takeGames / sourceGames;
  return group.rows.map((row, index) => {
    const quantity = group.games > 0 ? Math.max(0, Math.round((row.quantity || 0) * ratio)) : row.quantity;
    return {
      ...cloneRow(row),
      games: index === 0 ? takeGames : undefined,
      quantity,
      volume: row.lengthMm && row.widthMm && row.thicknessMm ? undefined : row.volume !== undefined ? row.volume * ratio : undefined,
    };
  });
}

export function applyContainerLogistics(input: ProcessingResult, rawConfig?: LogisticsConfig): ProcessingResult {
  const cfg = sanitizeConfig(rawConfig || input.config);
  const rows = input.packages.flatMap((pkg) => pkg.rows).map(cloneRow);
  const groups = logicalGroups(rows);
  const fallbackLimit = Math.max(0, Math.round(input.orderOptions?.containerGamesPerPallet || 0));
  const packages: PackageData[] = [];
  const warnings = [...input.warnings];

  for (const group of groups) {
    const { rule, maxGames } = chooseRule(group, cfg, fallbackLimit);

    if (!(maxGames > 0)) {
      const one = group.rows.map(cloneRow);
      one.forEach((row) => { row.containerMaxGames = undefined; row.containerRuleId = rule?.id; });
      packages.push({
        number: 0,
        rows: one,
        games: group.games || undefined,
        totalVolume: packageVolume(one),
        packageType: "CONTAINER",
        status: cfg.container.requireConfiguredLimit ? "INVALIDO" : "ATENCAO",
        ruleApplied: `Container: ${rule?.label || group.label} · limite de jogos não configurado`,
        warnings: ["Informe o limite de jogos por pallet antes de emitir o container."],
      });
      continue;
    }

    let remaining = Math.max(0, group.games || 0);
    if (!remaining) {
      const one = group.rows.map((row) => ({ ...cloneRow(row), containerMaxGames: maxGames, containerRuleId: rule?.id }));
      packages.push({
        number: 0,
        rows: one,
        totalVolume: packageVolume(one),
        packageType: "CONTAINER",
        status: "ATENCAO",
        limitQuantity: maxGames,
        ruleApplied: `Container: ${rule?.label || group.label} · até ${maxGames} jogos`,
        warnings: ["O número de jogos deste grupo não foi identificado; confira manualmente."],
      });
      continue;
    }

    while (remaining > 0) {
      const take = Math.min(remaining, maxGames);
      const part = splitGroup(group, take).map((row) => ({ ...row, containerMaxGames: maxGames, containerRuleId: rule?.id }));
      packages.push({
        number: 0,
        rows: part,
        games: take,
        totalVolume: packageVolume(part),
        packageType: "CONTAINER",
        status: "VALIDO",
        limitQuantity: maxGames,
        ruleApplied: `Container: ${rule?.label || group.label} · ${take}/${maxGames} jogos`,
        warnings: rule?.observation ? [rule.observation] : [],
      });
      remaining -= take;
    }
  }

  // Segurança: ferragens sempre por último.
  packages.sort((a, b) => {
    const aHardware = a.rows.every(isHardware) ? 1 : 0;
    const bHardware = b.rows.every(isHardware) ? 1 : 0;
    return aHardware - bHardware;
  });
  packages.forEach((pkg, index) => {
    pkg.number = index + 1;
    pkg.totalVolume = packageVolume(pkg.rows);
    pkg.rows = pkg.rows.map((row, rowIndex) => ({ ...row, id: row.id || `C${index + 1}-R${rowIndex + 1}` }));
  });

  const missingRules = packages.filter((pkg) => pkg.status === "INVALIDO").length;
  if (missingRules) warnings.unshift(`${missingRules} pallet(s) de container precisam de limite de jogos antes da emissão.`);

  return {
    ...input,
    sourceMode: "CONTAINER",
    packages,
    warnings,
    config: cfg,
  };
}

export function containerTotalGames(pkg: PackageData) {
  const explicit = pkg.games || pkg.rows.find((row) => row.games)?.games;
  if (explicit) return explicit;
  return estimateGames(pkg.rows);
}
