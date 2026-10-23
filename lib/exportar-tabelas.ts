// Exporta para Excel todas as tabelas visíveis da tela (uma aba por tabela). Roda no navegador.
const NUMERO = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;
const SEM_ZERO_ESQUERDA = /^-?(0|[1-9][\d.]*)(,\d+)?$/;

function celula(texto: string): string | number {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t && NUMERO.test(t) && SEM_ZERO_ESQUERDA.test(t) && t.length < 16) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return t;
}

function tituloDaTabela(t: HTMLTableElement, i: number): string {
  const bloco = t.closest(".panel, section, .card");
  const h = bloco?.querySelector("h1,h2,h3,h4,header b, .panel-title");
  const nome = (h?.textContent || "").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  return (nome || `Tabela ${i + 1}`).slice(0, 28);
}

export async function exportarTabelasDaPagina(arquivo: string): Promise<number> {
  const tabelas = Array.from(document.querySelectorAll<HTMLTableElement>("main table")).filter((t) => t.offsetParent !== null && t.querySelector("thead th") && t.querySelectorAll("tbody tr").length);
  if (!tabelas.length) return 0;
  const mod: any = await import("exceljs");
  const Excel = mod.default ?? mod;
  const wb = new Excel.Workbook();
  wb.creator = "Famossul";
  const usados = new Set<string>();
  tabelas.forEach((t, i) => {
    let nome = tituloDaTabela(t, i);
    for (let k = 2; usados.has(nome.toLowerCase()); k++) nome = `${nome.slice(0, 25)} ${k}`;
    usados.add(nome.toLowerCase());
    const ws = wb.addWorksheet(nome);
    const cab = Array.from(t.querySelectorAll("thead th")).map((h) => (h.textContent || "").replace(/\s+/g, " ").trim());
    ws.addRow(cab);
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D3527" } };
    hr.alignment = { vertical: "middle", wrapText: true };
    t.querySelectorAll("tbody tr").forEach((tr) => {
      const cels = Array.from(tr.children) as HTMLTableCellElement[];
      if (cels.length === 1 && (cels[0].colSpan || 1) > 1 && cab.length > 1) return; // linha de "sem dados"/detalhe
      const linha: Array<string | number> = [];
      cels.forEach((c) => { linha.push(celula(c.innerText ?? c.textContent ?? "")); for (let s = 1; s < (c.colSpan || 1); s++) linha.push(""); });
      ws.addRow(linha);
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, cab.length) } };
    ws.columns.forEach((col: any, idx: number) => {
      let w = String(cab[idx] ?? "").length;
      col.eachCell?.({ includeEmpty: false }, (c: any) => { w = Math.max(w, String(c.value ?? "").length); });
      col.width = Math.min(60, Math.max(8, w + 2));
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${arquivo}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return tabelas.length;
}
