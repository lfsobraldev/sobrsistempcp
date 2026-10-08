export type MountType = "MONTADO_HS" | "MONTADO_TIMADEL" | "REVENDA" | "MONTADO_ESTANCIA";
export type PackageStatus = "VALIDO" | "ATENCAO" | "INVALIDO";
export type ProductCategory = "PORTA" | "MARCO" | "ALIZAR" | "FERRAGEM" | "KIT" | "OUTRO";
export type SourceMode = "PEDIDO" | "ROMANEIO_PRONTO" | "CONTAINER";
export type RowRole =
  | "PORTA"
  | "MARCO_DOBRADICA_DIREITA"
  | "MARCO_CONTRATESTA_DIREITA"
  | "MARCO_DOBRADICA_ESQUERDA"
  | "MARCO_CONTRATESTA_ESQUERDA"
  | "MARCO_PERNA_SEM_MAO"
  | "MARCO_TRAVESSA"
  | "ALIZAR_MAIOR_PERNA"
  | "ALIZAR_MAIOR_TRAVESSA"
  | "ALIZAR_MENOR_PERNA"
  | "ALIZAR_MENOR_TRAVESSA"
  | "KIT"
  | "FERRAGEM"
  | "OUTRO";

export type AdditionalItem = {
  id: string;
  label: string;
  text: string;
  target: "ROMANEIO" | "ETIQUETA" | "AMBOS";
  position: "CABECALHO" | "ANTES_TABELA" | "OBSERVACAO" | "RODAPE";
  enabled: boolean;
  mode?: "TEXTO" | "LINHA";
  games?: number;
  quantity?: number;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  product?: string;
  observation?: string;
};

export type LogisticsRule = {
  maxDoors: number;
  maxM3: number;
  maxTrimGames: number;
  maxFrameGames: number;
};

export type ContainerRule = {
  id: string;
  label: string;
  match?: string;
  category?: ProductCategory;
  maxGames: number;
  editable: boolean;
  enabled: boolean;
  priority?: number;
  observation?: string;
};

export type ContainerConfig = {
  defaultMaxGames: number;
  requireConfiguredLimit: boolean;
  rules: ContainerRule[];
};

export type LogisticsConfig = {
  MONTADO_HS: LogisticsRule;
  MONTADO_TIMADEL: LogisticsRule;
  REVENDA: LogisticsRule & { maxDoorsCardboard: number; maxDoorsThickness41: number };
  MONTADO_ESTANCIA: LogisticsRule;
  mixedMaxM3: number;
  additionalItems: AdditionalItem[];
  romaneioNote?: string;
  labelNote?: string;
  requireFilter?: boolean;
  romaneioStyle?: RomaneioStyle;
  labelStyle?: LabelStyle;
  container: ContainerConfig;
};

export type OrderOptions = {
  mountType: MountType;
  complementoObra?: boolean;
  motorista?: string;
  transportadora?: string;
  placa?: string;
  notaFiscal?: string;
  filtro?: string;
  pagina?: string;
  conferente?: string;
  separador?: string;
  romaneioExtraText?: string;
  etiquetaExtraText?: string;
  containerCode?: string;
  containerGamesPerPallet?: number;
};

export type SourceCatalogItem = {
  item: string;
  parentItem?: string;
  code: string;
  description: string;
  unit?: string;
  quantity: number;
  volume?: number;
  category?: ProductCategory;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  packaging?: "PLASTICO" | "PAPELAO" | "OUTRO";
  finish?: string;
  isParent?: boolean;
  children?: string[];
  used: boolean;
  usedBy?: string[];
};

export type RowStyle = {
  fillColor?: string;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontName?: string;
  align?: "left" | "center" | "right";
};

export type RomaneioStyle = {
  fontName?: string;
  titleFillColor?: string;
  titleTextColor?: string;
  titleFontSize?: number;
  headerFillColor?: string;
  headerTextColor?: string;
  headerFontSize?: number;
  bodyTextColor?: string;
  bodyFontSize?: number;
  productFontSize?: number;
  observationFontSize?: number;
  rowHeight?: number;
  productColumnWidth?: number;
  observationColumnWidth?: number;
};

export type LabelStyle = {
  fontName?: string;
  baseFontSize?: number;
  titleFontSize?: number;
  headerFillColor?: string;
  headerTextColor?: string;
  textColor?: string;
  productTextColor?: string;
  observationTextColor?: string;
  productScale?: number;
  observationScale?: number;
  numericScale?: number;
  boldProduct?: boolean;
  productAlign?: "left" | "center" | "right";
  observationAlign?: "left" | "center" | "right";
  productColumnWidth?: number;
  observationColumnWidth?: number;
  rowHeight?: number;
};

export type PackageRow = {
  id?: string;
  games?: number;
  quantity: number;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  volume?: number;
  product: string;
  observation?: string;
  packaging?: "PLASTICO" | "PAPELAO" | "OUTRO";
  category?: ProductCategory;
  role?: RowRole;
  finish?: string;

  sourceItems?: string[];
  sourceCode?: string;
  sourceCodes?: string[];
  originalDescription?: string;
  groupId?: string;
  groupType?: ProductCategory;
  productGroupId?: string;
  mergeProduct?: boolean;
  mergeObservation?: boolean;
  itemText?: string;
  application?: string;
  hand?: "DIREITA" | "ESQUERDA" | "SEM_MAO";
  matchConfidence?: number;
  rowStyle?: RowStyle;
  manual?: boolean;
  containerRuleId?: string;
  containerMaxGames?: number;
};

export type LabelOverrides = {
  enabled?: boolean;
  packageNumber?: string;
  totalPackages?: string;
  orderNumber?: string;
  client?: string;
  destination?: string;
  extraText?: string;
  fontScale?: number;
  rows?: PackageRow[];
  style?: LabelStyle;
};

export type PackageData = {
  number: number;
  games?: number;
  totalVolume?: number;
  notes?: string;
  rows: PackageRow[];
  label?: LabelOverrides;
  status?: PackageStatus;
  ruleApplied?: string;
  limitM3?: number;
  limitQuantity?: number;
  warnings?: string[];
  packageType?: ProductCategory | "MISTO" | "CONTAINER";
};

export type ReconciliationSummary = {
  found: number;
  mapped: number;
  unmapped: number;
  parentItemsIgnored: number;
};

export type ParserDiagnostics = {
  allItems: number;
  physicalItems: number;
  machiningEntries: number;
  generatedRows: number;
  sourceCategories: Partial<Record<ProductCategory, number>>;
  mappedCategories: Partial<Record<ProductCategory, number>>;
  generatedCategories: Partial<Record<ProductCategory, number>>;
  suspicious: boolean;
  notes: string[];
};

export type ProcessingResult = {
  orderNumber: string;
  client: string;
  destination: string;
  delivery?: string;
  hasMachining: boolean;
  handSplit?: { right: number; left: number };
  mountType: MountType;
  mixedOrder?: boolean;
  complementoObra?: boolean;
  packages: PackageData[];
  warnings: string[];
  config?: LogisticsConfig;
  orderOptions?: OrderOptions;
  sourceItemCount?: number;
  sourceItems?: string[];
  sourceCatalog?: SourceCatalogItem[];
  unmappedItems?: SourceCatalogItem[];
  reconciliation?: ReconciliationSummary;
  parserDiagnostics?: ParserDiagnostics;
  sourceMode?: SourceMode;
  sourceFileName?: string;
  specialInstructions?: string[];
  trimAsResale?: boolean;
  romaneioStyle?: RomaneioStyle;
  labelStyle?: LabelStyle;
};
