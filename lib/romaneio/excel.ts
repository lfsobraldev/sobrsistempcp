import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PackageRow, ProcessingResult } from "./types";
import { rowVolume } from "./logistics";
import { compactItemIds } from "./domain";

const START_ROW = 13;
const BASE_LAST_DATA_ROW = 108;
const BASE_TOTAL_ROW = 109;
const BASE_FILTER_ROW = 110;
const BASE_OBS_ROW = 111;
const COL = { pkg:"A", order:"B", games:"C", qty:"D", len:"E", wid:"F", thk:"G", m3:"H", palletM3:"I", product:"J", obs:"K" } as const;
const MOUNT_SHORT = { MONTADO_HS:"Mont. HS", MONTADO_TIMADEL:"Mont. Timadel", REVENDA:"Revenda", MONTADO_ESTANCIA:"Mont. Estância" } as const;

type WrittenRow = { excelRow:number; row:PackageRow };

function set(ws: ExcelJS.Worksheet, address: string, value: string | number | Date | null | undefined) { ws.getCell(address).value = value ?? ""; }
function safeMerge(ws: ExcelJS.Worksheet, ref: string) { try { ws.mergeCells(ref); } catch { /* template may already contain a compatible merge */ } }
function totalRows(data: ProcessingResult) { return data.packages.reduce((sum, pkg) => sum + pkg.rows.length, 0); }
function ensureCapacity(ws: ExcelJS.Worksheet, required: number) {
  const base = BASE_LAST_DATA_ROW - START_ROW + 1;
  const extra = Math.max(0, required - base);
  if (extra > 0) ws.duplicateRow(BASE_LAST_DATA_ROW, extra, true);
  return { lastData: BASE_LAST_DATA_ROW + extra, total: BASE_TOTAL_ROW + extra, filter: BASE_FILTER_ROW + extra, obs: BASE_OBS_ROW + extra };
}
function clearData(ws: ExcelJS.Worksheet, last: number) {
  for (let row = START_ROW; row <= last; row++) {
    ws.getRow(row).hidden = false;
    for (let col = 1; col <= 11; col++) ws.getCell(row, col).value = null;
  }
}
function contiguousGroups(rows: PackageRow[], key: (row: PackageRow, index: number) => string) {
  const out: Array<{start:number;end:number;id:string}> = [];
  if (!rows.length) return out;
  let start = 0;
  let id = key(rows[0], 0);
  for (let index = 1; index <= rows.length; index++) {
    const next = index < rows.length ? key(rows[index], index) : "__END__";
    if (next !== id) { out.push({ start, end:index - 1, id }); start = index; id = next; }
  }
  return out;
}
function argb(value?:string){
  const hex=(value||"").replace("#","").trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex)?`FF${hex}`:undefined;
}
function applyDocumentStyle(ws:ExcelJS.Worksheet,data:ProcessingResult,lastData:number){
  const style=data.romaneioStyle;
  if(!style)return;
  const titleFill=argb(style.titleFillColor), titleText=argb(style.titleTextColor);
  const headerFill=argb(style.headerFillColor), headerText=argb(style.headerTextColor);
  const bodyText=argb(style.bodyTextColor);
  for(const cell of [ws.getCell("A5")]){
    if(titleFill)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:titleFill}};
    if(titleText)cell.font={...(cell.font||{}),color:{argb:titleText}};
    if(style.fontName || style.titleFontSize) cell.font={...(cell.font||{}),...(style.fontName?{name:style.fontName}:{}),...(style.titleFontSize?{size:style.titleFontSize}:{})};
  }
  for(let col=1;col<=11;col++){
    const cell=ws.getCell(12,col);
    if(headerFill)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:headerFill}};
    if(headerText)cell.font={...(cell.font||{}),color:{argb:headerText}};
    if(style.fontName || style.headerFontSize) cell.font={...(cell.font||{}),...(style.fontName?{name:style.fontName}:{}),...(style.headerFontSize?{size:style.headerFontSize}:{})};
  }
  if(style.productColumnWidth && style.productColumnWidth>=10 && style.productColumnWidth<=90)ws.getColumn(10).width=style.productColumnWidth;
  if(style.observationColumnWidth && style.observationColumnWidth>=8 && style.observationColumnWidth<=70)ws.getColumn(11).width=style.observationColumnWidth;
  for(let row=START_ROW;row<=lastData;row++){
    if(style.rowHeight && style.rowHeight>=12 && style.rowHeight<=80)ws.getRow(row).height=style.rowHeight;
    for(let col=1;col<=11;col++){
      const cell=ws.getCell(row,col);
      const size=col===10?style.productFontSize:col===11?style.observationFontSize:style.bodyFontSize;
      cell.font={...(cell.font||{}),...(bodyText?{color:{argb:bodyText}}:{}),...(style.fontName?{name:style.fontName}:{}),...(size?{size}: {})};
    }
  }
}
function applyRowStyle(ws: ExcelJS.Worksheet, rowNumber: number, row: PackageRow) {
  if (!row.rowStyle) return;
  const fill = (row.rowStyle.fillColor || "").replace("#", "").toUpperCase();
  const color = (row.rowStyle.textColor || "").replace("#", "").toUpperCase();
  for (let col = 1; col <= 11; col++) {
    const cell = ws.getCell(rowNumber, col);
    if (fill) cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:`FF${fill}` } };
    cell.font = { ...(cell.font || {}), ...(color ? { color:{argb:`FF${color}`} } : {}), ...(row.rowStyle.bold ? {bold:true} : {}), ...(row.rowStyle.italic ? {italic:true} : {}), ...(row.rowStyle.fontSize ? {size:row.rowStyle.fontSize} : {}), ...(row.rowStyle.fontName ? {name:row.rowStyle.fontName} : {}) };
    if (row.rowStyle.align) cell.alignment = { ...(cell.alignment || {}), horizontal:row.rowStyle.align, vertical:"middle", wrapText:true };
  }
}
function observationText(rows: PackageRow[]) {
  const sourceItems = [...new Set(rows.flatMap((row) => row.sourceItems || []))];
  const itemPart = sourceItems.length ? (sourceItems.length === 1 ? `Item ${compactItemIds(sourceItems)}` : `Itens ${compactItemIds(sourceItems)}`) : "";
  const custom = [...new Set(rows.map((row) => (row.observation || "").trim()).filter((value) => value && !/^Itens?\s+[\d\s./-]+$/i.test(value)))];
  return [itemPart, ...custom].filter(Boolean).join(" | ");
}
function observationKey(row: PackageRow, index: number) {
  const ids = [...new Set(row.sourceItems || [])].sort();
  if (ids.length) return `SRC:${ids.join("|")}`;
  if (row.mergeObservation && row.groupId) return `GROUP:${row.groupId}`;
  return `ROW:${index}`;
}

export async function createRomaneioWorkbook(data: ProcessingResult) {
  let template: Buffer;
  try {
    template = await readFile(path.join(process.cwd(), "public", "templates", "Romaneio.xlsx"));
  } catch {
    const response = await fetch("https://romaneiosget.vercel.app/templates/Romaneio.xlsx", { cache: "no-store" });
    if (!response.ok) throw new Error("Modelo oficial Romaneio.xlsx indisponível.");
    template = Buffer.from(await response.arrayBuffer());
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(template) as any);
  workbook.creator = "Famossul | Romaneios";
  const ws = workbook.getWorksheet("Romaneio") || workbook.worksheets[0];
  if (!ws) throw new Error("Modelo oficial Romaneio.xlsx inválido.");

  const positions = ensureCapacity(ws, totalRows(data));
  clearData(ws, positions.lastData);
  applyDocumentStyle(ws, data, positions.lastData);

  /*
   * O modelo oficial trabalha com a tabela centralizada.
   * Forçamos o alinhamento em toda a área de dados para impedir
   * que estilos herdados/duplicados do Excel deixem algumas células
   * à esquerda ou desalinhadas após inserção de linhas.
   */
  for (let row = 12; row <= positions.lastData; row++) {
    for (let col = 1; col <= 11; col++) {
      const cell = ws.getCell(row, col);
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: "center",
        vertical: "middle",
        wrapText: col === 10 || col === 11,
      };
    }
  }

  set(ws, "B7", new Date()); ws.getCell("B7").numFmt = "dd/mm/yyyy";
  set(ws, "B8", data.client); set(ws, "B9", data.destination); set(ws, "B10", data.orderNumber); set(ws, "B11", data.delivery || "");
  set(ws, "I7", data.orderOptions?.motorista || "");
  set(ws, "I8", data.orderOptions?.transportadora || "");
  set(ws, "I9", data.orderOptions?.placa || "");
  // No modelo oficial G11:J11 é o rótulo mesclado de Nota Fiscal; o valor fica em K11.
  set(ws, "K11", data.orderOptions?.notaFiscal || "");

  let cursor = START_ROW;
  const written: WrittenRow[] = [];

  for (const pkg of data.packages) {
    if (!pkg.rows.length) continue;
    const packageStart = cursor;

    for (const row of pkg.rows) {
      set(ws, `${COL.games}${cursor}`, row.games ?? "");
      set(ws, `${COL.qty}${cursor}`, row.quantity || "");
      set(ws, `${COL.len}${cursor}`, row.lengthMm || "");
      set(ws, `${COL.wid}${cursor}`, row.widthMm || "");
      set(ws, `${COL.thk}${cursor}`, row.thicknessMm || "");
      if (row.lengthMm && row.widthMm && row.thicknessMm && row.quantity) {
        ws.getCell(`${COL.m3}${cursor}`).value = { formula:`G${cursor}*F${cursor}*E${cursor}*D${cursor}/1000000000`, result:rowVolume(row) } as any;
      } else set(ws, `${COL.m3}${cursor}`, rowVolume(row) || 0);
      ws.getCell(`${COL.m3}${cursor}`).numFmt = "0.000";
      set(ws, `${COL.product}${cursor}`, row.product || "");
      set(ws, `${COL.obs}${cursor}`, "");
      ws.getCell(`${COL.product}${cursor}`).alignment = { ...(ws.getCell(`${COL.product}${cursor}`).alignment || {}), vertical:"middle", horizontal:"center", wrapText:true };
      ws.getCell(`${COL.obs}${cursor}`).alignment = { ...(ws.getCell(`${COL.obs}${cursor}`).alignment || {}), vertical:"middle", horizontal:"center", wrapText:true };
      const longest = Math.max((row.product || "").length, (row.observation || row.itemText || "").length);
      if (!data.romaneioStyle?.rowHeight) ws.getRow(cursor).height = longest > 120 ? 30 : longest > 70 ? 24 : 18;
      applyRowStyle(ws, cursor, row);
      written.push({ excelRow:cursor, row });
      cursor++;
    }

    const packageEnd = cursor - 1;
    set(ws, `${COL.pkg}${packageStart}`, pkg.number);
    set(ws, `${COL.order}${packageStart}`, data.orderNumber);
    const packageM3 = pkg.rows.reduce((sum, row) => sum + rowVolume(row), 0);
    set(ws, `${COL.palletM3}${packageStart}`, packageM3);
    ws.getCell(`${COL.palletM3}${packageStart}`).numFmt = "0.000";
    if (packageEnd > packageStart) {
      safeMerge(ws, `${COL.pkg}${packageStart}:${COL.pkg}${packageEnd}`);
      safeMerge(ws, `${COL.order}${packageStart}:${COL.order}${packageEnd}`);
      safeMerge(ws, `${COL.palletM3}${packageStart}:${COL.palletM3}${packageEnd}`);
    }

    for (const group of contiguousGroups(pkg.rows, (row, index) => row.groupId || `ROW-${index}`)) {
      const start = packageStart + group.start;
      const end = packageStart + group.end;
      const rows = pkg.rows.slice(group.start, group.end + 1);
      const games = rows.find((row) => row.games)?.games;
      if (end > start && games) { set(ws, `${COL.games}${start}`, games); safeMerge(ws, `${COL.games}${start}:${COL.games}${end}`); }
    }

    for (const group of contiguousGroups(pkg.rows, (row, index) => row.productGroupId || `P-${index}`)) {
      const rows = pkg.rows.slice(group.start, group.end + 1);
      if (group.end <= group.start || !rows.some((row) => row.mergeProduct)) continue;
      const start = packageStart + group.start;
      const end = packageStart + group.end;
      const product = rows.map((row) => row.product).find(Boolean) || "";
      set(ws, `${COL.product}${start}`, product);
      safeMerge(ws, `${COL.product}${start}:${COL.product}${end}`);
    }
  }

  // A coluna Obs segue os grupos de origem, inclusive quando um grupo continua em outro pallet.
  // Isso reproduz o comportamento dos romaneios manuais: uma lista de Itens não é repetida em cada linha.
  for (const group of contiguousGroups(written.map((entry) => entry.row), observationKey)) {
    const entries = written.slice(group.start, group.end + 1);
    const first = entries[0]?.excelRow;
    const last = entries.at(-1)?.excelRow;
    if (!first || !last) continue;
    const text = observationText(entries.map((entry) => entry.row));
    if (!text) continue;
    set(ws, `${COL.obs}${first}`, text);
    if (last > first) safeMerge(ws, `${COL.obs}${first}:${COL.obs}${last}`);
    ws.getCell(`${COL.obs}${first}`).alignment = { ...(ws.getCell(`${COL.obs}${first}`).alignment || {}), vertical:"middle", horizontal:"center", wrapText:true };
  }

  for (let row = cursor; row <= positions.lastData; row++) ws.getRow(row).hidden = true;

  ws.getCell(`C${positions.total}`).value = { formula:`SUM(C${START_ROW}:C${positions.lastData})` } as any;
  ws.getCell(`D${positions.total}`).value = { formula:`SUM(D${START_ROW}:D${positions.lastData})` } as any;
  set(ws, `G${positions.total}`, "Total m³");
  ws.getCell(`H${positions.total}`).value = { formula:`SUM(H${START_ROW}:H${positions.lastData})` } as any;
  ws.getCell(`H${positions.total}`).numFmt = "0.000";
  ws.getCell(`K${positions.total}`).value = { formula:`ROUNDUP(((H${positions.total}*420)/1000),1)&" - toneladas"` } as any;

  set(ws, `A${positions.filter}`, "Filtro:"); set(ws, `B${positions.filter}`, data.orderOptions?.filtro || "");
  set(ws, `C${positions.filter}`, "Pag.:"); set(ws, `D${positions.filter}`, data.orderOptions?.pagina || "");
  set(ws, `A${positions.obs}`, "Obs:");
  const additions = (data.config?.additionalItems || []).filter((item) => item.enabled && (item.target === "ROMANEIO" || item.target === "AMBOS")).map((item) => item.text || item.label);
  const footer = [MOUNT_SHORT[data.mountType], (data.complementoObra || data.orderOptions?.complementoObra) ? "Complemento de Obra" : "", data.sourceMode === "CONTAINER" && data.orderOptions?.containerCode ? `Container: ${data.orderOptions.containerCode}` : "", data.config?.romaneioNote, data.orderOptions?.romaneioExtraText, ...additions, data.orderOptions?.conferente ? `Conferente: ${data.orderOptions.conferente}` : "", data.orderOptions?.separador ? `Separado por: ${data.orderOptions.separador}` : ""].filter(Boolean).join(" | ");
  set(ws, `B${positions.obs}`, footer);
  ws.getCell(`B${positions.obs}`).alignment = { ...(ws.getCell(`B${positions.obs}`).alignment || {}), wrapText:true, vertical:"middle" };

  let endRow = positions.obs;
  for (const instruction of data.specialInstructions || []) {
    endRow++;
    ws.duplicateRow(endRow - 1, 1, true);
    set(ws, `A${endRow}`, ""); set(ws, `B${endRow}`, instruction);
    ws.getCell(`B${endRow}`).font = { ...(ws.getCell(`B${endRow}`).font || {}), bold:true };
    ws.getCell(`B${endRow}`).alignment = { ...(ws.getCell(`B${endRow}`).alignment || {}), wrapText:true };
  }

  ws.pageSetup.printArea = `A1:K${endRow}`;

  // Planilha técnica oculta para rastreabilidade. Não interfere na impressão do romaneio,
  // mas permite auditar de onde cada linha veio quando houver divergência no cliente/expedição.
  const auditName = "_AUDITORIA";
  const existingAudit = workbook.getWorksheet(auditName);
  if (existingAudit) workbook.removeWorksheet(existingAudit.id);
  const audit = workbook.addWorksheet(auditName, { state: "veryHidden" });
  audit.columns = [
    { header: "Pallet", key: "pallet", width: 10 },
    { header: "Item", key: "item", width: 28 },
    { header: "Código", key: "code", width: 18 },
    { header: "Categoria", key: "category", width: 16 },
    { header: "Jogos", key: "games", width: 10 },
    { header: "Quantidade", key: "quantity", width: 12 },
    { header: "Comprimento", key: "length", width: 14 },
    { header: "Largura", key: "width", width: 12 },
    { header: "Espessura", key: "thickness", width: 12 },
    { header: "m³", key: "volume", width: 12 },
    { header: "Produto", key: "product", width: 60 },
    { header: "Observação", key: "observation", width: 60 },
    { header: "Origem", key: "original", width: 90 },
  ];
  for (const pkg of data.packages) {
    for (const row of pkg.rows) {
      audit.addRow({
        pallet: pkg.number,
        item: (row.sourceItems || []).join(" / "),
        code: (row.sourceCodes || [row.sourceCode]).filter(Boolean).join(" / "),
        category: row.category || "",
        games: row.games || "",
        quantity: row.quantity || 0,
        length: row.lengthMm || "",
        width: row.widthMm || "",
        thickness: row.thicknessMm || "",
        volume: rowVolume(row),
        product: row.product || "",
        observation: row.observation || row.itemText || "",
        original: row.originalDescription || "",
      });
    }
  }
  audit.getRow(1).font = { bold: true };
  audit.getColumn("volume").numFmt = "0.000";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
