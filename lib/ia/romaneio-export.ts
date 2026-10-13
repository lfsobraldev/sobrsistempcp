import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RomaneioIA } from "@/lib/ia/romaneio";

const nf = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export async function romaneioXlsx(r: RomaneioIA): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Romaneio");
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `ROMANEIO${r.pedido ? " — Pedido " + r.pedido : ""}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  const meta: [string, string][] = [["Cliente", r.cliente], ["Transportadora", r.transportadora], ["Rota", r.rota], ["Motorista", r.motorista], ["Placa", r.placa], ["Nota fiscal", r.notaFiscal], ["Entrega", r.dataEntrega]];
  meta.forEach(([k, v], i) => { ws.getCell(2 + i, 1).value = k; ws.getCell(2 + i, 1).font = { bold: true }; ws.getCell(2 + i, 2).value = v; });
  const start = 2 + meta.length + 1;
  const head = ["#", "Código", "Descrição", "Qtd", "Un", "Peso (kg)", "Volumes", "Observação"];
  head.forEach((h, i) => {
    const c = ws.getCell(start, i + 1);
    c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  });
  r.itens.forEach((it, i) => {
    const row = ws.getRow(start + 1 + i);
    row.values = [i + 1, it.codigo, it.descricao, it.quantidade, it.unidade, it.pesoKg ?? "", it.volumes ?? "", it.observacao];
  });
  const end = start + r.itens.length;
  const tot = ws.getRow(end + 1);
  tot.values = ["", "", "TOTAL", { formula: `SUM(D${start + 1}:D${end})` }, "", { formula: `SUM(F${start + 1}:F${end})` }, { formula: `SUM(G${start + 1}:G${end})` }, ""];
  tot.font = { bold: true };
  [6, 16, 56, 10, 6, 12, 10, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: start }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function romaneioPdf(r: RomaneioIA): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36; // A4 paisagem
  const cols = [{ t: "#", w: 24 }, { t: "Código", w: 90 }, { t: "Descrição", w: 330 }, { t: "Qtd", w: 50 }, { t: "Un", w: 30 }, { t: "Peso", w: 50 }, { t: "Vol", w: 40 }, { t: "Obs.", w: 158 }];
  const clip = (s: string, w: number, f = font, size = 9) => { let t = s; while (t.length > 1 && f.widthOfTextAtSize(t, size) > w - 6) t = t.slice(0, -1); return t; };
  let page = pdf.addPage([W, H]); let y = H - M;
  const header = () => {
    page.drawText(`ROMANEIO${r.pedido ? " — Pedido " + r.pedido : ""}`, { x: M, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) }); y -= 18;
    const line = (a: string, b: string) => { page.drawText(`${a}: ${b || "-"}`, { x: M, y, size: 9, font }); };
    line("Cliente", r.cliente); page.drawText(`Transportadora: ${r.transportadora || "-"}`, { x: 320, y, size: 9, font }); page.drawText(`Rota: ${r.rota || "-"}`, { x: 620, y, size: 9, font }); y -= 13;
    line("Motorista", r.motorista); page.drawText(`Placa: ${r.placa || "-"}`, { x: 320, y, size: 9, font }); page.drawText(`NF: ${r.notaFiscal || "-"}`, { x: 620, y, size: 9, font }); y -= 20;
    let x = M; page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: rgb(0.145, 0.388, 0.922) });
    cols.forEach((c) => { page.drawText(c.t, { x: x + 3, y, size: 9, font: bold, color: rgb(1, 1, 1) }); x += c.w; }); y -= 16;
  };
  header();
  r.itens.forEach((it, i) => {
    if (y < M + 30) { page = pdf.addPage([W, H]); y = H - M; header(); }
    const vals = [String(i + 1), it.codigo, it.descricao, nf(it.quantidade), it.unidade, nf(it.pesoKg), nf(it.volumes), it.observacao];
    let x = M;
    if (i % 2) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: rgb(0.96, 0.97, 0.98) });
    vals.forEach((v, k) => { page.drawText(clip(v, cols[k].w), { x: x + 3, y, size: 9, font }); x += cols[k].w; });
    y -= 14;
  });
  const tq = r.itens.reduce((s, i) => s + i.quantidade, 0), tp = r.itens.reduce((s, i) => s + (i.pesoKg ?? 0), 0), tv = r.itens.reduce((s, i) => s + (i.volumes ?? 0), 0);
  y -= 6; page.drawText(`TOTAL — Qtd: ${nf(tq)}   Peso: ${nf(tp)} kg   Volumes: ${nf(tv)}`, { x: M, y, size: 10, font: bold });
  y -= 40; page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.6 }); page.drawLine({ start: { x: 330, y }, end: { x: 550, y }, thickness: 0.6 });
  page.drawText("Conferente", { x: M, y: y - 11, size: 8, font }); page.drawText("Motorista", { x: 330, y: y - 11, size: 8, font });
  return Buffer.from(await pdf.save());
}
