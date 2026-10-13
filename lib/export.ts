import type { Andon, Produto } from "@/types/pcp";
import { LABELS } from "@/lib/metrics";
import { familiaDe } from "@/lib/sort";

export type Linha = Record<string, string | number>;

const SOMAVEIS = /^(planejado|produzido|refugo|saldo|quantidade|qtd|pecas|peças|jogos|volume|peso|total|minutos|horas)/i;
const STATUS_COR: Array<[RegExp, string, string]> = [
  [/BLOQUEAD|DIVERG|URGENTE|ATRAS|CRIT|REPROV|ABERT/i, "FFFEE2E2", "FFB91C1C"],
  [/CONCLU|LIBERAD|APROV|RESOLV|OK\b/i, "FFDCFCE7", "FF15803D"],
  [/PENDENT|ALTA|ATEN|AGUARD/i, "FFFEF3C7", "FFB45309"],
  [/ANDAMENTO|ASSUMID|TRATAMENTO/i, "FFDBEAFE", "FF1D4ED8"],
];

/** Exporta abas para .xlsx com formatação profissional: cabeçalho, filtros, congelamento, totais e impressão. */
export async function montarWorkbook(abas: { nome: string; linhas: Linha[] }[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sobral PCP";
  wb.created = new Date();

  for (const a of abas) {
    const linhas = a.linhas.length ? a.linhas : [{ Aviso: "Sem dados" }];
    const cols = Object.keys(linhas[0]);
    const ws = wb.addWorksheet(a.nome.replace(/[\\/?*[\]:]/g, "-").slice(0, 31), {
      properties: { tabColor: { argb: "FF2563EB" } },
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    });
    ws.headerFooter.oddFooter = `&L${a.nome}&CPágina &P de &N&R&D`;

    ws.columns = cols.map((c) => ({
      header: c,
      key: c,
      width: Math.min(60, Math.max(c.length + 4, ...linhas.slice(0, 300).map((l) => String(l[c] ?? "").length + 2), 8)),
    }));
    linhas.forEach((l) => ws.addRow(cols.map((c) => l[c] ?? "")));

    const head = ws.getRow(1);
    head.height = 22;
    head.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });

    const numericCols = new Set<number>();
    cols.forEach((c, i) => {
      const num = linhas.slice(0, 300).every((l) => l[c] === "" || l[c] === undefined || typeof l[c] === "number");
      const hasNum = linhas.some((l) => typeof l[c] === "number");
      if (num && hasNum) {
        numericCols.add(i + 1);
        const dec = linhas.some((l) => typeof l[c] === "number" && !Number.isInteger(l[c] as number));
        ws.getColumn(i + 1).numFmt = dec ? "#,##0.00" : "#,##0";
        ws.getColumn(i + 1).alignment = { horizontal: "right" };
      }
    });

    const last = ws.rowCount;
    for (let r = 2; r <= last; r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
        if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        if (/status|prioridade|situa/i.test(cols[ci - 1] || "") && typeof cell.value === "string") {
          const m = STATUS_COR.find(([rx]) => rx.test(String(cell.value)));
          if (m) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: m[1] } }; cell.font = { color: { argb: m[2] }, bold: true }; }
        }
      });
    }

    const somar = cols.map((c, i) => (numericCols.has(i + 1) && SOMAVEIS.test(c) ? i + 1 : 0)).filter(Boolean);
    if (somar.length && last > 2) {
      const tot = ws.getRow(last + 1);
      tot.getCell(1).value = "TOTAL";
      somar.forEach((ci) => {
        const L = ws.getColumn(ci).letter;
        tot.getCell(ci).value = { formula: `SUBTOTAL(109,${L}2:${L}${last})` };
      });
      tot.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true };
        cell.border = { top: { style: "medium", color: { argb: "FF1E3A8A" } } };
      });
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(last, 1), column: cols.length } };
    ws.pageSetup.printTitlesRow = "1:1";
  }

  return wb;
}

export async function exportarExcel(abas: { nome: string; linhas: Linha[] }[], arquivo: string) {
  const wb = await montarWorkbook(abas);
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${arquivo}_${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const linhaOp = (p: Produto, o: Produto["operacoes"][number]): Linha => ({
  Processo: LABELS[o.processo] || o.processo,
  Seq: o.ordemFila,
  Família: familiaDe(p.categoria),
  Pedido: p.pedido,
  OF: p.of,
  Peça: p.descricao,
  Material: p.material,
  Medida: p.medida,
  Rebaixo: p.rebaixo,
  Acabamento: p.acabamento,
  Cor: p.cor,
  Prioridade: p.prioridade,
  Status: o.status.replaceAll("_", " "),
  Planejado: o.quantidadePlanejada,
  Produzido: o.quantidadeProduzida,
  Refugo: o.quantidadeRefugo,
  Saldo: Math.max(0, o.quantidadePlanejada - o.quantidadeProduzida),
});

/** Exportação completa: planilha profissional por setor (portas > batentes > alizares > baguetes > kit/suporte de trilho). */
export async function exportarCompleto(produtos: Produto[], _andon: Andon[] = []) {
  const { baixarPlanilhaProducao } = await import("@/lib/planilha");
  await baixarPlanilhaProducao(produtos, { arquivo: "Programacao_Producao" });
}

/** Planilha de um único setor (usada nas telas de Líderes e Apontamentos). */
export async function exportarSetor(produtos: Produto[], processo: string) {
  const { baixarPlanilhaProducao } = await import("@/lib/planilha");
  await baixarPlanilhaProducao(produtos, {
    setores: [processo],
    arquivo: `Programacao_${(LABELS[processo] || processo)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")}`,
  });
}
