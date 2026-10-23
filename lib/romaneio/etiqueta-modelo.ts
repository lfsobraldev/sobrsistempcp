import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PackageData, PackageRow, ProcessingResult } from "./types";
import { rowVolume } from "./logistics";

/**
 * Etiqueta de pallet no modelo oficial (Pedido.xlsx): uma aba "Pacote NN" por pacote,
 * com logo, endereço, cliente, pedido, destino, "Pallet X DE N", tabela de peças, total m³ e toneladas.
 * O modelo vem de public/templates/Pedido.xlsx; aqui só se preenche e se replica a formatação.
 */
const FIRST_DATA = 11;
const COLS = 10; // A..J

function groups(rows: PackageRow[], key: (r: PackageRow, i: number) => string) {
  const out: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || key(rows[i], i) !== key(rows[start], start)) { out.push({ start, end: i - 1 }); start = i; }
  }
  return out;
}

/** Altura das linhas de dados (pt): poucas linhas ficam altas; muitas se ajustam à página. */
export function alturaLinha(n: number) {
  if (n <= 2) return 68.25;
  if (n === 3) return 56.1;
  if (n === 4) return 42.95;
  if (n <= 10) return Math.max(30, Math.round((171.8 / n) * 100) / 100);
  return Math.min(48, Math.max(30, Math.round((504 / n) * 100) / 100));
}
export function fonteCliente(len: number) { return len <= 18 ? 60 : len <= 26 ? 52 : len <= 34 ? 46 : len <= 44 ? 42 : len <= 56 ? 34 : 28; }
export function fonteDestino(len: number) { return len <= 14 ? 54 : len <= 20 ? 44 : len <= 28 ? 34 : 26; }

async function carregarModelo() {
  const wb = new ExcelJS.Workbook();
  let buf: Buffer;
  try { buf = await readFile(path.join(process.cwd(), "public", "templates", "Pedido.xlsx")); }
  catch { throw new Error("Modelo oficial de etiqueta (Pedido.xlsx) não encontrado em public/templates."); }
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Modelo oficial de etiqueta inválido.");
  return { wb, ws };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const ancora = (a: any) => ({ nativeCol: a.nativeCol, nativeRow: a.nativeRow, nativeColOff: a.nativeColOff, nativeRowOff: a.nativeRowOff });
const copiarRange = (r: any) => ({ tl: ancora(r.tl), ...(r.br ? { br: ancora(r.br) } : {}), ...(r.ext ? { ext: { width: r.ext.width, height: r.ext.height } } : {}), editAs: r.editAs });

export async function createEtiquetaModeloWorkbook(data: ProcessingResult) {
  const pacotes: PackageData[] = data.packages.filter((p) => p.rows.length && p.label?.enabled !== false);
  if (!pacotes.length) throw new Error("Nenhuma etiqueta está habilitada para geração.");
  const { wb: tpl, ws: src } = await carregarModelo();
  const out = new ExcelJS.Workbook();
  out.creator = "Famossul | Etiquetas";
  const imagens = src.getImages().map((im) => ({ buffer: tpl.getImage(Number(im.imageId))?.buffer as unknown as Buffer, range: copiarRange(im.range) }));
  const idImagens = imagens.map((im) => out.addImage({ buffer: im.buffer as any, extension: "png" }));
  const totalPacotes = pacotes.length;

  pacotes.forEach((pkg, idx) => {
    const rows = (pkg.label?.rows?.length ? pkg.label.rows : pkg.rows).filter((r) => r.product || r.quantity);
    const n = rows.length;
    const last = FIRST_DATA + n - 1; const total = last + 1;
    const ws = out.addWorksheet(`Pacote ${String(pkg.number).padStart(2, "0")}`);
    for (let c = 1; c <= COLS; c++) { const w = src.getColumn(c).width; if (w) ws.getColumn(c).width = w; }

    // Cabeçalho (linhas 1 a 10): cópia fiel do modelo
    for (let r = 1; r < FIRST_DATA; r++) {
      const sr = src.getRow(r); const dr = ws.getRow(r);
      if (sr.height) dr.height = sr.height;
      for (let c = 1; c <= COLS; c++) { const sc = sr.getCell(c); const dc = dr.getCell(c); dc.value = sc.value as any; dc.style = clone(sc.style); }
    }
    for (const m of ["A6:J6", "F1:J1", "F2:J3", "F4:J4", "A7:A8", "B7:D8", "E7:G8", "H7:J9", "B9:C9", "D9:E9", "F9:G9", "I10:J10"]) ws.mergeCells(m);

    // Dados do pacote
    const cliente = (pkg.label?.client || data.client || "").trim();
    const destino = (pkg.label?.destination || data.destination || "").trim();
    const pedido = (pkg.label?.orderNumber || data.orderNumber || "").trim();
    ws.getCell("A6").value = cliente; ws.getCell("A6").font = { ...(ws.getCell("A6").font || {}), size: fonteCliente(cliente.length) };
    ws.getCell("B7").value = /^\d+$/.test(pedido) ? Number(pedido) : pedido;
    ws.getCell("H7").value = destino; ws.getCell("H7").font = { ...(ws.getCell("H7").font || {}), size: fonteDestino(destino.length) };
    const numPallet = Number(pkg.label?.packageNumber) || pkg.number;
    ws.getCell("B9").value = numPallet;
    ws.getCell("F9").value = Number(pkg.label?.totalPackages) || totalPacotes;

    // Linhas de dados: estilo da linha 11 do modelo
    const h = alturaLinha(n);
    rows.forEach((row, i) => {
      const r = FIRST_DATA + i; const dr = ws.getRow(r); dr.height = h;
      for (let c = 1; c <= COLS; c++) dr.getCell(c).style = clone(src.getRow(FIRST_DATA).getCell(c).style);
      dr.getCell(3).value = row.quantity || (null as any);
      dr.getCell(4).value = row.lengthMm || (null as any);
      dr.getCell(5).value = row.widthMm || (null as any);
      dr.getCell(6).value = row.thicknessMm || (null as any);
      dr.getCell(7).value = { formula: `F${r}*E${r}*D${r}*C${r}/1000000000`, result: rowVolume(row) } as any;
      dr.getCell(8).value = row.product || "";
      ws.mergeCells(`I${r}:J${r}`);
    });
    ws.getCell(`A${FIRST_DATA}`).value = pkg.number;
    if (n > 1) ws.mergeCells(`A${FIRST_DATA}:A${last}`);
    // Jogos (coluna B): mesclado por grupo
    for (const g of groups(rows, (r, i) => r.groupId || `ROW-${i}`)) {
      const games = rows.slice(g.start, g.end + 1).find((r) => r.games)?.games;
      const a = FIRST_DATA + g.start, b = FIRST_DATA + g.end;
      if (games) { ws.getCell(`B${a}`).value = games; if (b > a) ws.mergeCells(`B${a}:B${b}`); }
    }
    // Produto (coluna H): mesclado quando o grupo pede
    for (const g of groups(rows, (r, i) => r.productGroupId || `P-${i}`)) {
      const sub = rows.slice(g.start, g.end + 1);
      if (g.end <= g.start || !sub.some((r) => r.mergeProduct)) continue;
      const a = FIRST_DATA + g.start, b = FIRST_DATA + g.end;
      ws.getCell(`H${a}`).value = sub.map((r) => r.product).find(Boolean) || "";
      ws.mergeCells(`H${a}:H${b}`);
    }

    // Linha de total
    const tr = ws.getRow(total); tr.height = src.getRow(12).height || 23.25;
    for (let c = 1; c <= COLS; c++) tr.getCell(c).style = clone(src.getRow(12).getCell(c).style);
    const somaQtd = rows.reduce((s, r) => s + (r.quantity || 0), 0);
    const somaM3 = rows.reduce((s, r) => s + rowVolume(r), 0);
    const somaJogos = groups(rows, (r, i) => r.groupId || `ROW-${i}`).reduce((s, g) => s + (rows.slice(g.start, g.end + 1).find((r) => r.games)?.games || 0), 0);
    if (somaJogos) { ws.getCell(`B${total}`).value = { formula: `SUM(B${FIRST_DATA}:B${last})`, result: somaJogos } as any; ws.getCell(`B${total}`).font = { name: "Arial", size: 14, bold: true }; }
    ws.getCell(`C${total}`).value = { formula: `SUM(C${FIRST_DATA}:C${last})`, result: somaQtd } as any;
    ws.getCell(`F${total}`).value = "Total m³";
    ws.getCell(`G${total}`).value = { formula: `SUM(G${FIRST_DATA}:G${last})`, result: somaM3 } as any;
    ws.getCell(`H${total}`).value = { formula: `ROUNDUP(((G${total}*420)/1000),1)&" - toneladas"`, result: `${String(Math.ceil(((somaM3 * 420) / 1000) * 10) / 10).replace(".", ",")} - toneladas` } as any;
    ws.mergeCells(`H${total}:J${total}`);

    // Imagens (logo e bandeira) e impressão
    imagens.forEach((im, k) => ws.addImage(idImagens[k], copiarRange(im.range) as any));
    ws.pageSetup = { paperSize: 9, orientation: n >= 11 ? "portrait" : "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true,
      margins: { left: 0.5118, right: 0.5118, top: 0.5118, bottom: 0.5118, header: 0.3, footer: 0.3 }, printArea: `A1:J${total}` } as any;
    void idx;
  });
  return Buffer.from(await out.xlsx.writeBuffer());
}
