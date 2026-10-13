import type { AdditionalItem, ContainerRule, LogisticsConfig, MountType } from "./types";

export const MOUNT_LABELS: Record<MountType, string> = {
  MONTADO_HS: "MONTADO HS",
  MONTADO_TIMADEL: "MONTADO TIMADEL",
  REVENDA: "REVENDA",
  MONTADO_ESTANCIA: "MONTADO ESTÂNCIA",
};

export const DEFAULT_LOGISTICS_CONFIG: LogisticsConfig = {
  MONTADO_HS: { maxDoors: 32, maxM3: 2.0, maxTrimGames: 250, maxFrameGames: 250 },
  MONTADO_TIMADEL: { maxDoors: 34, maxM3: 2.0, maxTrimGames: 250, maxFrameGames: 250 },
  REVENDA: { maxDoors: 34, maxDoorsCardboard: 28, maxDoorsThickness41: 28, maxM3: 1.8, maxTrimGames: 100, maxFrameGames: 100 },
  MONTADO_ESTANCIA: { maxDoors: 34, maxM3: 2.0, maxTrimGames: 250, maxFrameGames: 250 },
  mixedMaxM3: 1.4,
  additionalItems: [],
  romaneioNote: "",
  labelNote: "",
  requireFilter: false,
  romaneioStyle: {
    fontName: "Arial", titleFillColor: "#1F6B4A", titleTextColor: "#FFFFFF", titleFontSize: 12,
    headerFillColor: "#DCE9E0", headerTextColor: "#000000", headerFontSize: 9,
    bodyTextColor: "#000000", bodyFontSize: 8, productFontSize: 8, observationFontSize: 8,
    rowHeight: 18, productColumnWidth: 42, observationColumnWidth: 30,
  },
  labelStyle: {
    fontName: "Arial", baseFontSize: 9, titleFontSize: 15, headerFillColor: "#E6E6E6", headerTextColor: "#000000",
    textColor: "#000000", productTextColor: "#000000", observationTextColor: "#000000",
    productScale: 1, observationScale: 1, numericScale: 1, boldProduct: false, productAlign: "left", observationAlign: "left",
    productColumnWidth: 38, observationColumnWidth: 24, rowHeight: 24,
  },
  container: {
    defaultMaxGames: 0,
    requireConfiguredLimit: true,
    rules: [],
  },
};

const positive = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const nonNegative = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

function sanitizeAdditional(item: Partial<AdditionalItem>, index: number): AdditionalItem {
  return {
    id: typeof item.id === "string" && item.id ? item.id : `ADD-${index + 1}`,
    label: typeof item.label === "string" ? item.label : "Item adicional",
    text: typeof item.text === "string" ? item.text : "",
    target: item.target === "ROMANEIO" || item.target === "ETIQUETA" || item.target === "AMBOS" ? item.target : "AMBOS",
    position: item.position === "CABECALHO" || item.position === "ANTES_TABELA" || item.position === "OBSERVACAO" || item.position === "RODAPE" ? item.position : "OBSERVACAO",
    enabled: item.enabled !== false,
    mode: item.mode === "LINHA" ? "LINHA" : "TEXTO",
    games: nonNegative(item.games),
    quantity: nonNegative(item.quantity),
    lengthMm: nonNegative(item.lengthMm),
    widthMm: nonNegative(item.widthMm),
    thicknessMm: nonNegative(item.thicknessMm),
    product: typeof item.product === "string" ? item.product : "",
    observation: typeof item.observation === "string" ? item.observation : "",
  };
}

function sanitizeContainerRule(rule: Partial<ContainerRule>, index: number): ContainerRule {
  const categories = new Set(["PORTA", "MARCO", "ALIZAR", "FERRAGEM", "KIT", "OUTRO"]);
  return {
    id: typeof rule.id === "string" && rule.id ? rule.id : `CONTAINER-${index + 1}`,
    label: typeof rule.label === "string" && rule.label.trim() ? rule.label.trim() : `Regra ${index + 1}`,
    match: typeof rule.match === "string" ? rule.match.trim() : "",
    category: categories.has(String(rule.category)) ? rule.category : undefined,
    maxGames: nonNegative(rule.maxGames),
    editable: rule.editable !== false,
    enabled: rule.enabled !== false,
    priority: nonNegative(rule.priority, index + 1),
    observation: typeof rule.observation === "string" ? rule.observation.trim() : "",
  };
}


function sanitizeHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}
function sanitizeRomaneioStyle(input: LogisticsConfig["romaneioStyle"] | undefined) {
  const d = DEFAULT_LOGISTICS_CONFIG.romaneioStyle!;
  return {
    fontName: typeof input?.fontName === "string" && input.fontName.trim() ? input.fontName.trim() : d.fontName,
    titleFillColor: sanitizeHex(input?.titleFillColor, d.titleFillColor!), titleTextColor: sanitizeHex(input?.titleTextColor, d.titleTextColor!),
    titleFontSize: positive(input?.titleFontSize, d.titleFontSize!), headerFillColor: sanitizeHex(input?.headerFillColor, d.headerFillColor!),
    headerTextColor: sanitizeHex(input?.headerTextColor, d.headerTextColor!), headerFontSize: positive(input?.headerFontSize, d.headerFontSize!),
    bodyTextColor: sanitizeHex(input?.bodyTextColor, d.bodyTextColor!), bodyFontSize: positive(input?.bodyFontSize, d.bodyFontSize!),
    productFontSize: positive(input?.productFontSize, d.productFontSize!), observationFontSize: positive(input?.observationFontSize, d.observationFontSize!),
    rowHeight: positive(input?.rowHeight, d.rowHeight!), productColumnWidth: positive(input?.productColumnWidth, d.productColumnWidth!), observationColumnWidth: positive(input?.observationColumnWidth, d.observationColumnWidth!),
  };
}
function sanitizeLabelStyle(input: LogisticsConfig["labelStyle"] | undefined) {
  const d = DEFAULT_LOGISTICS_CONFIG.labelStyle!;
  const align = (value: unknown, fallback: "left"|"center"|"right") => value === "left" || value === "center" || value === "right" ? value : fallback;
  return {
    fontName: typeof input?.fontName === "string" && input.fontName.trim() ? input.fontName.trim() : d.fontName,
    baseFontSize: positive(input?.baseFontSize, d.baseFontSize!), titleFontSize: positive(input?.titleFontSize, d.titleFontSize!),
    headerFillColor: sanitizeHex(input?.headerFillColor, d.headerFillColor!), headerTextColor: sanitizeHex(input?.headerTextColor, d.headerTextColor!),
    textColor: sanitizeHex(input?.textColor, d.textColor!), productTextColor: sanitizeHex(input?.productTextColor, d.productTextColor!), observationTextColor: sanitizeHex(input?.observationTextColor, d.observationTextColor!),
    productScale: positive(input?.productScale, d.productScale!), observationScale: positive(input?.observationScale, d.observationScale!), numericScale: positive(input?.numericScale, d.numericScale!),
    boldProduct: Boolean(input?.boldProduct), productAlign: align(input?.productAlign, d.productAlign || "left"), observationAlign: align(input?.observationAlign, d.observationAlign || "left"),
    productColumnWidth: positive(input?.productColumnWidth, d.productColumnWidth!), observationColumnWidth: positive(input?.observationColumnWidth, d.observationColumnWidth!), rowHeight: positive(input?.rowHeight, d.rowHeight!),
  };
}
export function sanitizeConfig(input?: Partial<LogisticsConfig>): LogisticsConfig {
  if (!input) return structuredClone(DEFAULT_LOGISTICS_CONFIG);
  const d = DEFAULT_LOGISTICS_CONFIG;
  const rule = (key: Exclude<MountType, "REVENDA">) => ({
    maxDoors: positive(input[key]?.maxDoors, d[key].maxDoors),
    maxM3: positive(input[key]?.maxM3, d[key].maxM3),
    maxTrimGames: positive(input[key]?.maxTrimGames, d[key].maxTrimGames),
    maxFrameGames: positive(input[key]?.maxFrameGames, d[key].maxFrameGames),
  });
  return {
    MONTADO_HS: rule("MONTADO_HS"),
    MONTADO_TIMADEL: rule("MONTADO_TIMADEL"),
    MONTADO_ESTANCIA: rule("MONTADO_ESTANCIA"),
    REVENDA: {
      maxDoors: positive(input.REVENDA?.maxDoors, d.REVENDA.maxDoors),
      maxDoorsCardboard: positive(input.REVENDA?.maxDoorsCardboard, d.REVENDA.maxDoorsCardboard),
      maxDoorsThickness41: positive(input.REVENDA?.maxDoorsThickness41, d.REVENDA.maxDoorsThickness41),
      maxM3: positive(input.REVENDA?.maxM3, d.REVENDA.maxM3),
      maxTrimGames: positive(input.REVENDA?.maxTrimGames, d.REVENDA.maxTrimGames),
      maxFrameGames: positive(input.REVENDA?.maxFrameGames, d.REVENDA.maxFrameGames),
    },
    mixedMaxM3: positive(input.mixedMaxM3, d.mixedMaxM3),
    additionalItems: Array.isArray(input.additionalItems) ? input.additionalItems.filter(Boolean).map((item, index) => sanitizeAdditional(item, index)) : [],
    romaneioNote: typeof input.romaneioNote === "string" ? input.romaneioNote : "",
    labelNote: typeof input.labelNote === "string" ? input.labelNote : "",
    requireFilter: Boolean(input.requireFilter),
    romaneioStyle: sanitizeRomaneioStyle(input.romaneioStyle),
    labelStyle: sanitizeLabelStyle(input.labelStyle),
    container: {
      defaultMaxGames: nonNegative(input.container?.defaultMaxGames),
      requireConfiguredLimit: input.container?.requireConfiguredLimit !== false,
      rules: Array.isArray(input.container?.rules) ? input.container.rules.filter(Boolean).map((rule, index) => sanitizeContainerRule(rule, index)) : [],
    },
  };
}
